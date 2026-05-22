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
    if (isSmallTalk(message)) {
      const answer = buildSmallTalkAnswer(message);
      return this.buildDirectResult(message, answer, sessionId);
    }

    if (isCapabilityQuestion(message)) {
      const answer = buildCapabilityAnswer(message);
      return this.buildDirectResult(message, answer, sessionId);
    }

    if (!hasSupportedIntent(message)) {
      const answer = buildUnsupportedIntentAnswer(message);
      return this.buildDirectResult(message, answer, sessionId);
    }

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
    if (isSmallTalk(message)) {
      const answer = buildSmallTalkAnswer(message);
      yield { type: 'status', message: '识别为普通问候，跳过订单查询和知识检索' };
      yield { type: 'token', token: answer };

      yield { type: 'done', result: this.buildDirectResult(message, answer, sessionId) };
      return;
    }

    if (isCapabilityQuestion(message)) {
      const answer = buildCapabilityAnswer(message);
      yield { type: 'status', message: '识别为能力咨询，返回系统能力说明' };
      yield { type: 'token', token: answer };
      yield { type: 'done', result: this.buildDirectResult(message, answer, sessionId) };
      return;
    }

    if (!hasSupportedIntent(message)) {
      const answer = buildUnsupportedIntentAnswer(message);
      yield { type: 'status', message: '识别为非业务相关问题，跳过订单查询和知识检索' };
      yield { type: 'token', token: answer };
      yield { type: 'done', result: this.buildDirectResult(message, answer, sessionId) };
      return;
    }

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

    if (!hasOrderRelatedIntent(question)) {
      return undefined;
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

  private buildDirectResult(message: string, answer: string, sessionId: string): AgentChatResult {
    const history = this.sessions.get(sessionId) ?? [];
    const nextHistory = [...history, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: answer }].slice(-10);
    this.sessions.set(sessionId, nextHistory);

    return {
      answer,
      sources: [],
      toolCalls: [],
      memory: {
        sessionId,
        turns: Math.floor(nextHistory.length / 2)
      }
    };
  }
}

export const enterpriseAgentService = new EnterpriseAgentService();

function isSmallTalk(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (hasOrderRelatedIntent(normalized)) {
    return false;
  }

  return /^(你好|您好|嗨|哈喽|hello|hi|hey|在吗|在不在|早上好|下午好|晚上好)[。！!,.，\s]*$/.test(normalized);
}

function hasOrderRelatedIntent(message: string) {
  return /订单|退款|退货|售后|物流|快递|发货|签收|支付|商品|客服|赔付|换货|order|refund|return|after-?sales|logistics|shipping|delivery|payment|customer support/i.test(message);
}

function hasSupportedIntent(message: string) {
  return hasOrderRelatedIntent(message) || isCapabilityQuestion(message) || hasWorkflowIntent(message);
}

function hasWorkflowIntent(message: string) {
  return /企业|业务|运营|客户|用户|工单|流程|规则|审批|知识库|知识|文档|政策|制度|规范|话术|质检|投诉|推荐|曝光|配置|自动化|工作流|表格|入库|business|operation|customer|user|ticket|workflow|rule|approval|knowledge|document|policy|sop|support|complaint|recommendation|automation/i.test(message);
}

function isCapabilityQuestion(message: string) {
  return /你能做什么|你可以做什么|有什么功能|支持什么|怎么用|帮助|help|what can you do|capabilities|features/i.test(message);
}

function buildSmallTalkAnswer(message: string) {
  return /hello|hi|hey/i.test(message)
    ? 'Hello, I am Echo Assistant. You can ask me about support issues, operational policies, knowledge base questions, or workflow rules.'
    : '你好，我是 Echo Assistant。你可以问我客服处理、运营规则、企业知识库或工作流自动化相关问题。';
}

function buildCapabilityAnswer(message: string) {
  return /help|what can you do|capabilities|features/i.test(message)
    ? 'I can help with customer support workflows, enterprise knowledge base questions, order or after-sales handling, operational policies, and natural language workflow rules. For example, ask: "Order E1001 wants a refund. What should we do?"'
    : '我可以帮助处理客服工作流、企业知识库问答、订单售后处理、运营政策查询，以及自然语言工作流规则配置。你可以这样问：“订单 E1001 用户想退款，应该怎么处理？”';
}

function buildUnsupportedIntentAnswer(message: string) {
  return /[a-z]/i.test(message) && !/[\u4e00-\u9fa5]/.test(message)
    ? 'I am currently focused on enterprise workflow assistance, including customer support, knowledge base QA, operational policies, and workflow rule configuration. Please ask a question in those areas.'
    : '抱歉，这个问题不在我当前的企业工作流助手能力范围内。我可以帮助你处理客服售后、订单与物流、企业知识库、运营规则、审批流程和工作流自动化相关问题。';
}

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
