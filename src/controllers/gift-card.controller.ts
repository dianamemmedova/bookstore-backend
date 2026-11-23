import type { Request, Response } from "express";
import * as giftCardService from "../services/gift-card.service";
import { paginationSchema } from "../schemas/common.schema";
import { idParamSchema } from "../schemas/contact.schema";
import { balanceSchema, createGiftCardSchema, updateGiftCardSchema } from "../schemas/gift-card.schema";

export async function checkBalance(req: Request, res: Response) {
  const { cardNumber } = balanceSchema.parse(req.body);
  res.json(await giftCardService.checkBalance(cardNumber));
}

// --- Admin ---

export async function createGiftCard(req: Request, res: Response) {
  const input = createGiftCardSchema.parse(req.body);
  res.status(201).json(await giftCardService.createGiftCard(input));
}

export async function listGiftCards(req: Request, res: Response) {
  res.json(await giftCardService.listGiftCards(paginationSchema.parse(req.query)));
}

export async function updateGiftCard(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const input = updateGiftCardSchema.parse(req.body);
  res.json(await giftCardService.updateGiftCard(Number(id), input));
}