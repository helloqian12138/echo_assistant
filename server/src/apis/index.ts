import type { Express } from 'express';
import { chatRouter } from './chat.api.js';
import { healthRouter } from './health.api.js';
import { knowledgeRouter } from './knowledge.api.js';
import { readinessRouter } from './readiness.api.js';

export function registerApis(app: Express) {
  app.use('/api/health', healthRouter);
  app.use('/api/readiness', readinessRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/chat', chatRouter);
}
