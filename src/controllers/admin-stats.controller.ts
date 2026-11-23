import type { Request, Response } from "express";
import * as statsService from "../services/stats.service";
import { lowStockQuerySchema, salesQuerySchema, topBooksQuerySchema } from "../schemas/stats.schema";

export async function overview(_req: Request, res: Response) {
  res.json(await statsService.getOverview());
}

export async function sales(req: Request, res: Response) {
  const { days } = salesQuerySchema.parse(req.query);
  res.json(await statsService.getSales(days));
}

export async function topBooks(req: Request, res: Response) {
  const { limit, days } = topBooksQuerySchema.parse(req.query);
  res.json(await statsService.getTopBooks(limit, days));
}

export async function lowStock(req: Request, res: Response) {
  const { threshold, limit } = lowStockQuerySchema.parse(req.query);
  res.json(await statsService.getLowStock(threshold, limit));
}