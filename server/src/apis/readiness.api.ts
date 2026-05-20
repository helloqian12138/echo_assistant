import { Router } from 'express';
import { readinessController } from '../controllers/readiness.controller.js';

export const readinessRouter = Router();

readinessRouter.get('/', readinessController.status);
