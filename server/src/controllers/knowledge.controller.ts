import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { knowledgeService } from '../services/knowledge.service.js';

const createKnowledgeSchema = z.object({
  title: z.string().trim().min(1, 'title 不能为空'),
  content: z.string().trim().min(1, 'content 不能为空')
});

export const knowledgeController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ items: await knowledgeService.list() });
    } catch (error) {
      next(error);
    }
  },

  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await knowledgeService.get(req.params.id);
      if (!document) {
        res.status(404).json({ message: '知识不存在' });
        return;
      }

      res.json(document);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createKnowledgeSchema.parse(req.body);
      const document = await knowledgeService.create(input);
      res.status(201).json(document);
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const removed = await knowledgeService.remove(req.params.id);
      if (!removed) {
        res.status(404).json({ message: '知识不存在' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
};
