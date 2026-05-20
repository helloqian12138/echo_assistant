import { Router } from 'express';
import { knowledgeController } from '../controllers/knowledge.controller.js';

export const knowledgeRouter = Router();

knowledgeRouter.get('/', knowledgeController.list);
knowledgeRouter.post('/', knowledgeController.create);
knowledgeRouter.get('/:id', knowledgeController.detail);
knowledgeRouter.delete('/:id', knowledgeController.remove);
