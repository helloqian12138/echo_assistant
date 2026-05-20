import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { enterpriseAgentService } from '../services/agent.service.js';

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'message 不能为空'),
  sessionId: z.string().trim().min(1).optional()
});

export const chatController = {
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { message, sessionId } = chatRequestSchema.parse(req.body);
      const result = await enterpriseAgentService.chat(message, sessionId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async streamMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { message, sessionId } = chatRequestSchema.parse(req.body);

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      for await (const event of enterpriseAgentService.streamChat(message, sessionId)) {
        writeSse(res, event.type, event);
      }

      res.end();
    } catch (error) {
      if (res.headersSent) {
        writeSse(res, 'error', {
          type: 'error',
          message: error instanceof Error ? error.message : '服务异常'
        });
        res.end();
        return;
      }

      next(error);
    }
  }
};

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
