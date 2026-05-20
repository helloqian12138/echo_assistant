import type { Express } from 'express';
import { chatRouter } from './chat.api.js';
import { healthRouter } from './health.api.js';

export function registerApis(app: Express) {
  app.use('/api/health', healthRouter);
  app.use('/api/chat', chatRouter);
}
