import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { recommendationService } from '../services/recommendation.service.js';

const createRuleSchema = z.object({
  name: z.string().optional(),
  naturalLanguage: z.string().trim().min(1)
});

export const recommendationController = {
  async listRules(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ items: await recommendationService.listRules() });
    } catch (error) {
      next(error);
    }
  },

  async createRule(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createRuleSchema.parse(req.body);
      res.status(201).json(await recommendationService.createRule(input));
    } catch (error) {
      next(error);
    }
  },

  async recommend(req: Request, res: Response, next: NextFunction) {
    try {
      const userType = typeof req.query.userType === 'string' ? req.query.userType : 'VIP 用户';
      res.json(await recommendationService.recommend(userType));
    } catch (error) {
      next(error);
    }
  }
};
