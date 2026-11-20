import type { Request, Response } from "express";
import * as adminService from "../services/admin.service";
import { paginationSchema } from "../schemas/common.schema";

export async function listUsers(req: Request, res: Response) {
  const query = paginationSchema.parse(req.query);
  res.json(await adminService.listUsers(query));
}