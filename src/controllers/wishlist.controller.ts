import type { Request, Response } from "express";
import * as wishlistService from "../services/wishlist.service";
import {
  createWishlistSchema,
  updateWishlistSchema,
  wishlistIdParamSchema,
  wishlistItemParamSchema,
} from "../schemas/wishlist.schema";

export async function listMine(req: Request, res: Response) {
  res.json(await wishlistService.listMine(req.user!.sub));
}

export async function create(req: Request, res: Response) {
  const input = createWishlistSchema.parse(req.body);
  res.status(201).json(await wishlistService.createWishlist(req.user!.sub, input));
}

export async function getMine(req: Request, res: Response) {
  const { id } = wishlistIdParamSchema.parse(req.params);
  res.json(await wishlistService.getMine(req.user!.sub, Number(id)));
}

export async function update(req: Request, res: Response) {
  const { id } = wishlistIdParamSchema.parse(req.params);
  const input = updateWishlistSchema.parse(req.body);
  res.json(await wishlistService.updateWishlist(req.user!.sub, Number(id), input));
}

export async function remove(req: Request, res: Response) {
  const { id } = wishlistIdParamSchema.parse(req.params);
  await wishlistService.deleteWishlist(req.user!.sub, Number(id));
  res.status(204).end();
}

export async function addItem(req: Request, res: Response) {
  const { id, bookId } = wishlistItemParamSchema.parse(req.params);
  res.json(await wishlistService.addItem(req.user!.sub, Number(id), Number(bookId)));
}

export async function removeItem(req: Request, res: Response) {
  const { id, bookId } = wishlistItemParamSchema.parse(req.params);
  res.json(await wishlistService.removeItem(req.user!.sub, Number(id), Number(bookId)));
}

export async function getPublic(req: Request, res: Response) {
  const { id } = wishlistIdParamSchema.parse(req.params);
  res.json(await wishlistService.getPublic(Number(id)));
}