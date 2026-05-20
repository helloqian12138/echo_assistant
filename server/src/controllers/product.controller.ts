import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { productService } from '../services/product.service.js';

const rowsSchema = z.object({
  rows: z.array(z.record(z.union([z.string(), z.number()])))
});

const saveSchema = z.object({
  products: z.array(z.any())
});

export const productController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ items: await productService.list() });
    } catch (error) {
      next(error);
    }
  },

  async enrich(req: Request, res: Response, next: NextFunction) {
    try {
      const { rows } = rowsSchema.parse(req.body);
      res.json({ items: await productService.enrichRows(rows) });
    } catch (error) {
      next(error);
    }
  },

  async save(req: Request, res: Response, next: NextFunction) {
    try {
      const { products } = saveSchema.parse(req.body);
      res.status(201).json({ items: await productService.saveProducts(products) });
    } catch (error) {
      next(error);
    }
  }
};
