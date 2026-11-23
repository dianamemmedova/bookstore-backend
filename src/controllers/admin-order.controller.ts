import type { Request, Response } from "express";
import * as orderService from "../services/order.service";
import { adminOrdersQuerySchema, orderIdParamSchema, updateOrderStatusSchema } from "../schemas/order.schema";

export async function listOrders(req: Request, res: Response) {
  const query = adminOrdersQuerySchema.parse(req.query);
  res.json(await orderService.listAllOrders(query));
}

export async function getOrder(req: Request, res: Response) {
  const { id } = orderIdParamSchema.parse(req.params);
  res.json(await orderService.getAnyOrder(Number(id)));
}

export async function updateStatus(req: Request, res: Response) {
  const { id } = orderIdParamSchema.parse(req.params);
  const { status } = updateOrderStatusSchema.parse(req.body);
  res.json(await orderService.updateOrderStatus(Number(id), status));
}