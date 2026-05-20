import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createChatModel, normalizeModelError } from './openai-client.js';

export type ProductRecord = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  grossMargin: number;
  tags: string[];
  targetUsers: string[];
  sellingPoints: string[];
  afterSaleRisk: 'low' | 'medium' | 'high';
  recommendScore: number;
  raw: Record<string, string | number>;
  createdAt: string;
};

export type ProductDraft = Omit<ProductRecord, 'id' | 'createdAt'> & {
  id?: string;
};

const productDraftSchema = z.object({
  name: z.string(),
  category: z.string(),
  price: z.number(),
  stock: z.number(),
  grossMargin: z.number(),
  tags: z.array(z.string()),
  targetUsers: z.array(z.string()),
  sellingPoints: z.array(z.string()),
  afterSaleRisk: z.enum(['low', 'medium', 'high']),
  recommendScore: z.number(),
  raw: z.record(z.union([z.string(), z.number()]))
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(__dirname, '../../data/runtime');
const productsPath = path.join(runtimeDir, 'products.json');

class ProductService {
  async list() {
    await ensureStore();
    return readProducts();
  }

  async enrichRows(rows: Array<Record<string, string | number>>) {
    const normalizedRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
    if (normalizedRows.length === 0) {
      return [];
    }

    try {
      const model = createChatModel(0.1);
      const response = await model.invoke([
        new SystemMessage(
          [
            '你是电商商品录入助手。请把 Excel 商品行补全为 JSON 数组。',
            '每个商品字段必须包含：name, category, price, stock, grossMargin, tags, targetUsers, sellingPoints, afterSaleRisk, recommendScore, raw。',
            'afterSaleRisk 只能是 low、medium、high。recommendScore 范围 0-100。grossMargin 是 0-1 小数。',
            '只返回 JSON，不要 markdown。'
          ].join('\n')
        ),
        new HumanMessage(JSON.stringify(normalizedRows.slice(0, 20)))
      ]);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const json = content.match(/\[[\s\S]*\]/)?.[0] ?? '[]';
      const parsed = JSON.parse(json) as unknown;
      const drafts = z.array(productDraftSchema).parse(parsed);
      return drafts.map((draft, index) => normalizeDraft(draft, normalizedRows[index] ?? {}));
    } catch (error) {
      const normalizedError = normalizeModelError(error);
      console.warn(normalizedError instanceof Error ? normalizedError.message : normalizedError);
      return normalizedRows.map((row) => createFallbackDraft(row));
    }
  }

  async saveProducts(drafts: ProductDraft[]) {
    await ensureStore();
    const products = await readProducts();
    const now = new Date().toISOString();
    const records = drafts.map((draft) => ({
      ...normalizeDraft(draft, draft.raw),
      id: draft.id || `P${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      createdAt: now
    }));
    await writeFile(productsPath, JSON.stringify([...products, ...records], null, 2), 'utf8');
    return records;
  }
}

export const productService = new ProductService();

async function ensureStore() {
  await mkdir(runtimeDir, { recursive: true });
  if (!existsSync(productsPath)) {
    await writeFile(productsPath, '[]', 'utf8');
  }
}

async function readProducts() {
  const raw = await readFile(productsPath, 'utf8');
  return JSON.parse(raw) as ProductRecord[];
}

function createFallbackDraft(row: Record<string, string | number>): ProductDraft {
  const name = readText(row, ['name', '商品名', '商品名称', 'title']) || '未命名商品';
  const category = readText(row, ['category', '类目', '品类']) || inferCategory(name);
  const price = readNumber(row, ['price', '价格', '售价']) || 99;
  const stock = readNumber(row, ['stock', '库存']) || 100;
  const cost = readNumber(row, ['cost', '成本']);
  const grossMargin = cost ? clamp((price - cost) / price, 0.05, 0.8) : 0.35;
  const tags = Array.from(new Set([category, ...name.split(/[,\s，、]+/).filter(Boolean)])).slice(0, 4);
  const afterSaleRisk = name.includes('智能') || name.includes('电') ? 'medium' : 'low';

  return {
    name,
    category,
    price,
    stock,
    grossMargin,
    tags,
    targetUsers: inferTargetUsers(name, category),
    sellingPoints: [`${category}场景适用`, `价格带 ${price} 元`, stock > 50 ? '库存充足' : '适合限量曝光'],
    afterSaleRisk,
    recommendScore: Math.round(clamp(grossMargin * 100 + Math.min(stock, 100) * 0.25, 30, 92)),
    raw: row
  };
}

function normalizeDraft(draft: ProductDraft, raw: Record<string, string | number>): ProductDraft {
  return {
    name: draft.name || '未命名商品',
    category: draft.category || inferCategory(draft.name),
    price: Number(draft.price) || 0,
    stock: Number(draft.stock) || 0,
    grossMargin: clamp(Number(draft.grossMargin) || 0.3, 0, 1),
    tags: (draft.tags ?? []).filter(Boolean),
    targetUsers: (draft.targetUsers ?? []).filter(Boolean),
    sellingPoints: (draft.sellingPoints ?? []).filter(Boolean),
    afterSaleRisk: draft.afterSaleRisk ?? 'medium',
    recommendScore: Math.round(clamp(Number(draft.recommendScore) || 60, 0, 100)),
    raw: draft.raw ?? raw
  };
}

function readText(row: Record<string, string | number>, keys: string[]) {
  const entry = Object.entries(row).find(([key]) => keys.some((item) => item.toLowerCase() === key.toLowerCase()));
  return entry ? String(entry[1]).trim() : '';
}

function readNumber(row: Record<string, string | number>, keys: string[]) {
  const value = readText(row, keys);
  return Number(value) || 0;
}

function inferCategory(name: string) {
  if (/杯|水壶|厨/.test(name)) return '智能家居';
  if (/耳机|手机|充电|蓝牙/.test(name)) return '数码配件';
  if (/椅|桌|收纳/.test(name)) return '居家办公';
  return '日用百货';
}

function inferTargetUsers(name: string, category: string) {
  if (category === '智能家居') return ['VIP 用户', '白领', '礼品人群'];
  if (category === '数码配件') return ['年轻用户', '通勤用户', '数码兴趣用户'];
  if (name.includes('儿童')) return ['亲子家庭', '新人用户'];
  return ['新人用户', '价格敏感用户'];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
