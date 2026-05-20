import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { enterpriseAgentService } from '../services/agent.service.js';

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'message 不能为空')
});

export const chatController = {
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { message } = chatRequestSchema.parse(req.body);
      const answer = await enterpriseAgentService.chat(message);

      res.json({ answer });
    } catch (error) {
      next(error);
    }
  }
};
