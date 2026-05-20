import { ChatOpenAI } from '@langchain/openai';
import { getOpenAIConfig } from '../config/openai.config.js';

export function createChatModel(temperature = 0.2) {
  const openAIConfig = getOpenAIConfig();

  return new ChatOpenAI({
    apiKey: openAIConfig.apiKey,
    model: openAIConfig.model,
    temperature,
    configuration: openAIConfig.baseURL
      ? {
          baseURL: openAIConfig.baseURL,
          fetch: unwrapOpenAIDataEnvelopeFetch
        }
      : undefined
  });
}

export function normalizeModelError(error: unknown) {
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

  if (!isWrappedOpenAIResponse(payload)) {
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

function isWrappedOpenAIResponse(payload: unknown): payload is { data: unknown } {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return false;
  }

  const data = (payload as { data: unknown }).data;
  return Boolean(data && typeof data === 'object' && ('choices' in data || 'data' in data));
}
