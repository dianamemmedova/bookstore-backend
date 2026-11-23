import * as z from "zod";

export const salesQuerySchema = z.object({
  days: z.coerce.number({ error: "days rəqəm olmalıdır" }).int({ error: "days tam ədəd olmalıdır" }).min(1, { error: "days ən azı 1 olmalıdır" }).max(365, { error: "days ən çox 365 ola bilər" }).default(30),
});

export const topBooksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  // days verilməsə bütün dövr
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number({ error: "threshold rəqəm olmalıdır" }).int().min(0).max(1000).default(5),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});