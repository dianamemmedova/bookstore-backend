import type { Request, Response } from "express";
import * as promoService from "../services/promo.service";
import { paginationSchema } from "../schemas/common.schema";
import { createPromoSchema, promoIdParamSchema, updatePromoSchema } from "../schemas/promo.schema";

export async function listPromos(req: Request, res: Response) {
  const query = paginationSchema.parse(req.query);
  res.json(await promoService.listPromos(query));
}

export async function createPromo(req: Request, res: Response) {
  const input = createPromoSchema.parse(req.body);
  res.status(201).json(await promoService.createPromo(input));
}

export async function updatePromo(req: Request, res: Response) {
  const { id } = promoIdParamSchema.parse(req.params);
  const input = updatePromoSchema.parse(req.body);
  res.json(await promoService.updatePromo(Number(id), input));
}

export async function deletePromo(req: Request, res: Response) {
  const { id } = promoIdParamSchema.parse(req.params);
  await promoService.deletePromo(Number(id));
  res.status(204).end();
}