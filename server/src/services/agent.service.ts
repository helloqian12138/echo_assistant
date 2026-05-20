import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel, normalizeModelError } from './openai-client.js';
import { knowledgeService, type KnowledgeSearchResult } from './knowledge.service.js';
import { orderService, type OrderRecord } from './order.service.js';

export type AgentToolCall = {
  name: string;
  input: Record<string, string>;
  output: OrderRecord | null;
};

export type AgentChatResult = {
  answer: string;
  sources: KnowledgeSearchResult[];
  toolCalls: AgentToolCall[];
  memory: {
    sessionId: string;
    turns: number;
  };
};

export type AgentStreamEvent =
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
      result: AgentChatResult;
    };

type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const AgentState = Annotation.Root({
  question: Annotation<string>(),
  sessionId: Annotation<string>(),
  orderId: Annotation<string | undefined>(),
  order: Annotation<OrderRecord | null>(),
  sources: Annotation<KnowledgeSearchResult[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  toolCalls: Annotation<AgentToolCall[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  answer: Annotation<string>()
});

const orderIdSchema = z.object({
  orderId: z.string().optional()
});

export class EnterpriseAgentService {
  private sessions = new Map<string, SessionMessage[]>();

  async chat(message: string, sessionId = 'default'): Promise<AgentChatResult> {
    const model = createChatModel(0.2);

    const graph = new StateGraph(AgentState)
      .addNode('detectOrder', async (state) => {
        const orderId = await this.detectOrderId(state.question);
        return { orderId };
      })
      .addNode('queryOrder', async (state) => {
        if (!state.orderId) {
          return {
            order: null,
            toolCalls: []
          };
        }

        const order = await orderService.findById(state.orderId);
        return {
          order: order ?? null,
          toolCalls: [
            {
              name: 'query_order',
              input: { orderId: state.orderId },
              output: order ?? null
            }
          ]
        };
      })
      .addNode('retrieveKnowledge', async (state) => {
        const searchQuery = [state.question, state.order ? formatOrderForPrompt(state.order) : ''].filter(Boolean).join('\n');
        const sources = await knowledgeService.search(searchQuery, 5);
        return { sources };
      })
      .addNode('generateAnswer', async (state) => {
        const history = this.sessions.get(state.sessionId) ?? [];
        const response = await model.invoke([
          new SystemMessage(buildSystemPrompt()),
          new HumanMessage(buildUserPrompt(state.question, history, state.sources, state.order, state.toolCalls))
        ]);

        const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        return { answer };
      })
      .addEdge(START, 'detectOrder')
      .addEdge('detectOrder', 'queryOrder')
      .addEdge('queryOrder', 'retrieveKnowledge')
      .addEdge('retrieveKnowledge', 'generateAnswer')
      .addEdge('generateAnswer', END)
      .compile();

    let result: typeof AgentState.State;
    try {
      result = await graph.invoke({
        question: message,
        sessionId,
        orderId: undefined,
        order: null,
        sources: [],
        toolCalls: [],
        answer: ''
      });
    } catch (error) {
      throw normalizeModelError(error);
    }

    const history = this.sessions.get(sessionId) ?? [];
    const nextHistory = [...history, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: result.answer }].slice(-10);
    this.sessions.set(sessionId, nextHistory);

    return {
      answer: result.answer,
      sources: result.sources,
      toolCalls: result.toolCalls,
      memory: {
        sessionId,
        turns: Math.floor(nextHistory.length / 2)
      }
    };
  }

  async *streamChat(message: string, sessionId = 'default'): AsyncGenerator<AgentStreamEvent> {
    const model = createChatModel(0.2);

    yield { type: 'status', message: '正在识别问题中的订单信息' };
    const orderId = await this.detectOrderId(message);

    yield { type: 'status', message: orderId ? `已识别订单 ${orderId}，正在调用订单查询工具` : '未识别到订单号，跳过订单查询工具' };
    const order = orderId ? await orderService.findById(orderId) : undefined;
    const toolCalls: AgentToolCall[] = orderId
      ? [
          {
            name: 'query_order',
            input: { orderId },
            output: order ?? null
          }
        ]
      : [];

    yield { type: 'status', message: '正在检索知识库：优先向量检索，必要时关键词兜底' };
    const searchQuery = [message, order ? formatOrderForPrompt(order) : ''].filter(Boolean).join('\n');
    const sources = await knowledgeService.search(searchQuery, 5);

    yield { type: 'status', message: `已命中 ${sources.length} 个知识片段，正在生成回答` };
    const history = this.sessions.get(sessionId) ?? [];
    let answer = '';

    try {
      const stream = await model.stream([
        new SystemMessage(buildSystemPrompt()),
        new HumanMessage(buildUserPrompt(message, history, sources, order ?? null, toolCalls))
      ]);

      for await (const chunk of stream) {
        const token = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
        if (!token) {
          continue;
        }

        answer += token;
        yield { type: 'token', token };
      }
    } catch (error) {
      throw normalizeModelError(error);
    }

    const nextHistory = [...history, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: answer }].slice(-10);
    this.sessions.set(sessionId, nextHistory);

    yield {
      type: 'done',
      result: {
        answer,
        sources,
        toolCalls,
        memory: {
          sessionId,
          turns: Math.floor(nextHistory.length / 2)
        }
      }
    };
  }

  private async detectOrderId(question: string) {
    const directMatch = question.match(/\b[A-Z]\d{4,}\b/i);
    if (directMatch) {
      return directMatch[0].toUpperCase();
    }

    const model = createChatModel(0);
    const response = await model.invoke([
      new SystemMessage('从用户问题中提取订单号。只返回 JSON，例如 {"orderId":"E1001"}。如果没有订单号，返回 {}。'),
      new HumanMessage(question)
    ]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    try {
      const parsedJson = JSON.parse(json) as unknown;
      const parsed = orderIdSchema.safeParse(parsedJson);
      return parsed.success ? parsed.data.orderId?.toUpperCase() : undefined;
    } catch {
      return undefined;
    }
  }
}

export const enterpriseAgentService = new EnterpriseAgentService();

function buildSystemPrompt() {
  return [
    '你是 Echo Assistant，一个面向企业知识库和业务工具的客服知识库助手。',
    '你必须优先基于提供的知识片段和订单工具结果回答。',
    '如果知识不足，请明确说明缺少依据，不要编造政策。',
    '如果订单工具结果包含 VIP 信息，必须结合知识库中的 VIP 售后优先级给出处理建议。',
    '回答要给出处理建议、依据和下一步动作。'
  ].join('\n');
}

function buildUserPrompt(
  question: string,
  history: SessionMessage[],
  sources: KnowledgeSearchResult[],
  order: OrderRecord | null,
  toolCalls: AgentToolCall[]
) {
  return [
    `当前日期：${new Date().toISOString().slice(0, 10)}`,
    '',
    `用户问题：${question}`,
    '',
    `会话记忆：\n${history.length ? history.map((item) => `${item.role}: ${item.content}`).join('\n') : '无'}`,
    '',
    `订单工具结果：\n${order ? formatOrderForPrompt(order) : toolCalls.length ? '未查询到订单' : '未调用订单工具'}`,
    '',
    `知识检索结果：\n${sources.length ? sources.map((source, index) => `[${index + 1}] ${source.documentTitle} (${source.method}, score=${source.score.toFixed(3)})\n${source.content}`).join('\n\n') : '无命中知识'}`,
    '',
    '请用中文回答，并包含：处理结论、依据、建议客服动作。'
  ].join('\n');
}

function formatOrderForPrompt(order: OrderRecord) {
  const deliveredDays = getDaysSince(order.delivered_at);
  return [
    `订单号：${order.order_id}`,
    `用户：${order.user_name}`,
    `状态：${order.status}`,
    `支付时间：${order.paid_at || '无'}`,
    `发货时间：${order.shipped_at || '无'}`,
    `签收时间：${order.delivered_at || '无'}`,
    `距签收天数：${deliveredDays === null ? '无法计算' : `${deliveredDays} 天`}`,
    `金额：${order.amount}`,
    `是否 VIP：${order.is_vip}`,
    `商品：${order.item_name}`
  ].join('\n');
}

function getDaysSince(dateText: string) {
  if (!dateText) {
    return null;
  }

  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dateUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((todayUtc - dateUtc) / 86_400_000);
}
