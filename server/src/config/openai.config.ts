import { z } from 'zod';

const openAIConfigSchema = z.object({
  apiKey: z.string().trim().min(1, '缺少 OPENAI_API_KEY，请在 server/.env 中配置后重试'),
  baseURL: z.string().trim().url().optional(),
  model: z.string().trim().min(1).default('gpt-4o-mini')
});

function normalizeBaseURL(baseURL?: string) {
  if (!baseURL) {
    return undefined;
  }

  const trimmed = baseURL.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

export function getOpenAIConfig() {
  const config = openAIConfigSchema.parse({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    model: process.env.OPENAI_MODEL
  });

  return {
    ...config,
    baseURL: normalizeBaseURL(config.baseURL)
  };
}
