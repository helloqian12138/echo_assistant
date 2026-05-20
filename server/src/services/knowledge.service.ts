import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type KnowledgeDocument = {
  id: string;
  title: string;
  content: string;
  source: 'seed' | 'upload';
  createdAt: string;
};

export type KnowledgeChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  vector: number[];
};

export type KnowledgeSearchResult = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  method: 'vector' | 'keyword';
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '../../data');
const seedPath = path.join(dataRoot, 'seed/ecommerce-sop.md');
const runtimeDir = path.join(dataRoot, 'runtime');
const runtimeKnowledgePath = path.join(runtimeDir, 'knowledge.json');
const vectorSize = 128;

class KnowledgeService {
  private documents: KnowledgeDocument[] = [];
  private chunks: KnowledgeChunk[] = [];
  private ready = false;
  private initPromise?: Promise<void>;

  async init() {
    if (!this.initPromise) {
      this.initPromise = this.load();
    }

    await this.initPromise;
  }

  async list() {
    await this.init();
    return this.documents.map(({ id, title, source, createdAt, content }) => ({
      id,
      title,
      source,
      createdAt,
      size: content.length,
      chunks: this.chunks.filter((chunk) => chunk.documentId === id).length
    }));
  }

  async get(id: string) {
    await this.init();
    return this.documents.find((document) => document.id === id);
  }

  async create(input: { title: string; content: string }) {
    await this.init();
    const document: KnowledgeDocument = {
      id: `upload_${Date.now()}`,
      title: input.title.trim() || '未命名知识',
      content: input.content.trim(),
      source: 'upload',
      createdAt: new Date().toISOString()
    };

    this.documents.push(document);
    this.rebuildChunks();
    await this.persistUploads();
    return document;
  }

  async remove(id: string) {
    await this.init();
    const document = this.documents.find((item) => item.id === id);

    if (!document) {
      return false;
    }

    if (document.source === 'seed') {
      throw new Error('内置示例知识不能删除');
    }

    this.documents = this.documents.filter((item) => item.id !== id);
    this.rebuildChunks();
    await this.persistUploads();
    return true;
  }

  async search(query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
    await this.init();
    const queryVector = vectorize(query);
    const vectorResults = this.chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryVector, chunk.vector)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ chunk, score }) => toSearchResult(chunk, score, 'vector' as const));

    const shouldFallbackToKeyword = vectorResults.length < 3 || (vectorResults[0]?.score ?? 0) < 0.18;
    if (!shouldFallbackToKeyword) {
      return vectorResults;
    }

    const existingIds = new Set(vectorResults.map((item) => item.chunkId));
    const keywordResults = keywordSearch(query, this.chunks, limit)
      .filter((item) => !existingIds.has(item.chunkId))
      .slice(0, Math.max(0, limit - vectorResults.length));

    return [...vectorResults, ...keywordResults].slice(0, limit);
  }

  async status() {
    await this.init();
    return {
      ready: this.ready,
      documents: this.documents.length,
      chunks: this.chunks.length
    };
  }

  private async load() {
    await mkdir(runtimeDir, { recursive: true });
    const seedContent = await readFile(seedPath, 'utf8');
    const seedDocument: KnowledgeDocument = {
      id: 'seed_ecommerce_sop',
      title: '电商客服知识库示例：退款、物流、订单与发票 SOP',
      content: seedContent,
      source: 'seed',
      createdAt: '2026-05-20T00:00:00.000Z'
    };

    const uploads = await this.loadUploads();
    this.documents = [seedDocument, ...uploads];
    this.rebuildChunks();
    this.ready = this.documents.length > 0 && this.chunks.length > 0;
  }

  private async loadUploads() {
    if (!existsSync(runtimeKnowledgePath)) {
      await writeFile(runtimeKnowledgePath, '[]', 'utf8');
      return [];
    }

    const raw = await readFile(runtimeKnowledgePath, 'utf8');
    const parsed = JSON.parse(raw) as KnowledgeDocument[];
    return parsed.filter((document) => document.source === 'upload');
  }

  private async persistUploads() {
    const uploads = this.documents.filter((document) => document.source === 'upload');
    await writeFile(runtimeKnowledgePath, JSON.stringify(uploads, null, 2), 'utf8');
  }

  private rebuildChunks() {
    this.chunks = this.documents.flatMap((document) =>
      splitIntoChunks(document.content).map((content, index) => ({
        id: `${document.id}_chunk_${index}`,
        documentId: document.id,
        documentTitle: document.title,
        content,
        vector: vectorize(content)
      }))
    );
  }
}

export const knowledgeService = new KnowledgeService();

function splitIntoChunks(content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';

  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).length > 700 && buffer) {
      chunks.push(buffer);
      buffer = paragraph;
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks;
}

function vectorize(text: string) {
  const vector = Array.from({ length: vectorSize }, () => 0);
  for (const token of tokenize(text)) {
    vector[hashToken(token) % vectorSize] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

function tokenize(text: string) {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9_]+|[\u4e00-\u9fa5]/g) ?? [];
  const cjk = lower.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const bigrams = cjk.flatMap((word) => {
    const result: string[] = [];
    for (let index = 0; index < word.length - 1; index += 1) {
      result.push(word.slice(index, index + 2));
    }
    return result;
  });

  return [...words, ...bigrams].filter((token) => token.trim().length > 0);
}

function hashToken(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function cosineSimilarity(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function keywordSearch(query: string, chunks: KnowledgeChunk[], limit: number): KnowledgeSearchResult[] {
  const queryTokens = Array.from(new Set(tokenize(query)));
  return chunks
    .map((chunk) => {
      const text = chunk.content.toLowerCase();
      const hits = queryTokens.filter((token) => text.includes(token)).length;
      return {
        chunk,
        score: queryTokens.length === 0 ? 0 : hits / queryTokens.length
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => toSearchResult(chunk, score, 'keyword'));
}

function toSearchResult(chunk: KnowledgeChunk, score: number, method: 'vector' | 'keyword'): KnowledgeSearchResult {
  return {
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    content: chunk.content,
    score,
    method
  };
}
