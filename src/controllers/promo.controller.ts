import type { Request, Response } from "express";
import * as promoService from "../services/promo.service";
import { validatePromoSchema } from "../schemas/promo.schema";

export async function validatePromo(req: Request, res: Response) {
  const { code } = validatePromoSchema.parse(req.body);
  res.json(await promoService.validatePromo(code, req.user?.sub));
}