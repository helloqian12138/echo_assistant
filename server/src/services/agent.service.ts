import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { getOpenAIConfig } from '../config/openai.config.js';

export class EnterpriseAgentService {
  async chat(message: string): Promise<string> {
    const openAIConfig = getOpenAIConfig();

    const model = new ChatOpenAI({
      apiKey: openAIConfig.apiKey,
      model: openAIConfig.model,
      temperature: 0.2,
      configuration: openAIConfig.baseURL
        ? {
            baseURL: openAIConfig.baseURL,
            fetch: unwrapOpenAIDataEnvelopeFetch
          }
        : undefined
    });

    const graph = new StateGraph(MessagesAnnotation)
      .addNode('chatModel', async (state) => {
        const response = await model.invoke(state.messages);
        return { messages: [response] };
      })
      .addEdge(START, 'chatModel')
      .addEdge('chatModel', END)
      .compile();

    let result: typeof MessagesAnnotation.State;
    try {
      result = await graph.invoke({
        messages: [
          new SystemMessage('你是 Echo Assistant，一个面向企业知识库问答的 AI 助手。请用简洁中文回答。'),
          new HumanMessage(message)
        ]
      });
    } catch (error) {
      throw normalizeModelError(error);
    }

    const response = result.messages.at(-1);
    return typeof response?.content === 'string' ? response.content : JSON.stringify(response?.content ?? '');
  }
}

export const enterpriseAgentService = new EnterpriseAgentService();

function normalizeModelError(error: unknown) {
  if (error instanceof Error && error.message.includes("Cannot read properties of undefined (reading 'message')")) {
    return new Error(
      '模型接口返回格式不兼容 OpenAI chat.completions。请确认 OPENAI_BASE_URL 是 OpenAI 兼容地址，例如 https://your-host/v1，并确认该模型会返回 choices[0].message.content。'
    );
  }

  return error;
}

const unwrapOpenAIDataEnvelopeFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return response;
  }

  const clonedResponse = response.clone();
  const payload = (await clonedResponse.json().catch(() => undefined)) as unknown;

  if (!isWrappedOpenAIChatCompletion(payload)) {
    return response;
  }

  const body = JSON.stringify(payload.data);
  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

function isWrappedOpenAIChatCompletion(payload: unknown): payload is { data: unknown } {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return false;
  }

  const data = (payload as { data: unknown }).data;
  return Boolean(data && typeof data === 'object' && 'choices' in data);
}
