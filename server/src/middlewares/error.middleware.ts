import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: '请求参数错误',
      issues: error.issues
    });
    return;
  }

  const message = error instanceof Error ? error.message : '服务异常';
  const status = message.includes('OPENAI_API_KEY') ? 500 : 500;

  res.status(status).json({
    message
  });
};
