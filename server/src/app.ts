import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Express, type RequestHandler } from 'express';
import { registerApis } from './apis/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { requestLogger } from './middlewares/requestLogger.middleware.js';

dotenv.config();

export type AppOptions = {
  middlewares?: RequestHandler[];
};

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);

  for (const middleware of options.middlewares ?? []) {
    app.use(middleware);
  }

  registerApis(app);
  app.use(errorMiddleware);

  return app;
}

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`Echo Assistant server is running on http://localhost:${port}`);
});
