import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';

export const chatRouter = Router();

chatRouter.post('/', chatController.sendMessage);
chatRouter.post('/stream', chatController.streamMessage);
