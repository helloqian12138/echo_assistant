import { Router } from 'express';
import { productController } from '../controllers/product.controller.js';

export const productRouter = Router();

productRouter.get('/', productController.list);
productRouter.post('/enrich', productController.enrich);
productRouter.post('/save', productController.save);
