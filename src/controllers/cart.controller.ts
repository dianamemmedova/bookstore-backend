import type { Request, Response } from "express";
import * as cartService from "../services/cart.service";
import { cartBookParamSchema, mergeCartSchema, setQuantitySchema } from "../schemas/cart.schema";

export async function getCart(req: Request, res: Response) {
  res.json(await cartService.getCart(req.user!.sub));
}

export async function setItemQuantity(req: Request, res: Response) {
  const { bookId } = cartBookParamSchema.parse(req.params);
  const { quantity } = setQuantitySchema.parse(req.body);
  res.json(await cartService.setItemQuantity(req.user!.sub, Number(bookId), quantity));
}

export async function removeItem(req: Request, res: Response) {
  const { bookId } = cartBookParamSchema.parse(req.params);
  res.json(await cartService.removeItem(req.user!.sub, Number(bookId)));
}

export async function clearCart(req: Request, res: Response) {
  await cartService.clearCart(req.user!.sub);
  res.status(204).end();
}

export async function mergeCart(req: Request, res: Response) {
  const input = mergeCartSchema.parse(req.body);
  res.json(await cartService.mergeCart(req.user!.sub, input));
}