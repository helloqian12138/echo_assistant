import { Router } from 'express';
import { recommendationController } from '../controllers/recommendation.controller.js';

export const recommendationRouter = Router();

recommendationRouter.get('/rules', recommendationController.listRules);
recommendationRouter.post('/rules', recommendationController.createRule);
recommendationRouter.get('/feed', recommendationController.recommend);
