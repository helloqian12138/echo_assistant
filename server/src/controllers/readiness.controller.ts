import type { Request, Response, NextFunction } from 'express';
import { readinessService } from '../services/readiness.service.js';

export const readinessController = {
  async status(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await readinessService.getStatus());
    } catch (error) {
      next(error);
    }
  }
};
