import type { Request, Response } from "express";
import * as orderService from "../services/order.service";
import { checkoutSchema, orderIdParamSchema } from "../schemas/order.schema";

export async function checkout(req: Request, res: Response) {
  const input = checkoutSchema.parse(req.body);
  res.status(201).json(await orderService.checkout(req.user!.sub, input));
}

export async function listMyOrders(req: Request, res: Response) {
  res.json(await orderService.listMyOrders(req.user!.sub));
}

export async function getMyOrder(req: Request, res: Response) {
  const { id } = orderIdParamSchema.parse(req.params);
  res.json(await orderService.getMyOrder(req.user!.sub, Number(id)));
}

export async function cancelMyOrder(req: Request, res: Response) {
  const { id } = orderIdParamSchema.parse(req.params);
  res.json(await orderService.cancelMyOrder(req.user!.sub, Number(id)));
}