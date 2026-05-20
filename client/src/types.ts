export type ChatResponse = {
  answer: string;
  sources: KnowledgeSource[];
  toolCalls: ToolCall[];
  memory: {
    sessionId: string;
    turns: number;
  };
};

export type KnowledgeItem = {
  id: string;
  title: string;
  source: 'seed' | 'upload';
  createdAt: string;
  size: number;
  chunks: number;
};

export type KnowledgeDocument = KnowledgeItem & {
  content: string;
};

export type KnowledgeSource = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  method: 'vector' | 'keyword';
};

export type ToolCall = {
  name: string;
  input: Record<string, string>;
  output: Record<string, string> | null;
};

export type ReadinessStatus = {
  knowledge: {
    ready: boolean;
    label: string;
    documents: number;
    chunks: number;
  };
  model: {
    ready: boolean;
    label: string;
    model: string | null;
    baseURL: string | null;
  };
  tools: {
    ready: boolean;
    label: string;
    items: Array<{
      name: string;
      ready: boolean;
      description: string;
    }>;
  };
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type ChatStreamEvent =
  | {
      type: 'status';
      message: string;
    }
  | {
      type: 'token';
      token: string;
    }
  | {
      type: 'done';
      result: ChatResponse;
    }
  | {
      type: 'error';
      message: string;
    };
