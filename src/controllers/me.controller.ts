import type { Request, Response } from "express";
import * as meService from "../services/me.service";
import { changePasswordSchema, updateMeSchema } from "../schemas/me.schema";

export async function getMe(req: Request, res: Response) {
  res.json(await meService.getMe(req.user!.sub));
}

export async function updateMe(req: Request, res: Response) {
  const input = updateMeSchema.parse(req.body);
  res.json(await meService.updateMe(req.user!.sub, input));
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  await meService.changePassword(req.user!.sub, input);
  res.status(204).end();
}