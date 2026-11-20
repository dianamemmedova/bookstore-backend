import * as z from "zod";
import { paginationSchema } from "./common.schema";

export const BOOK_SORTS = ["newest", "title", "year-desc", "price-asc", "price-desc"] as const;

export const listBooksQuerySchema = paginationSchema
  .extend({
    q: z.string({ error: "q mətn olmalıdır" }).trim().min(1, { error: "q boş ola bilməz" }).max(100).optional(),
    subject: z.string({ error: "subject mətn olmalıdır" }).trim().min(1).max(60).optional(),
    minPrice: z.coerce.number({ error: "minPrice rəqəm olmalıdır" }).min(0, { error: "minPrice mənfi ola bilməz" }).optional(),
    maxPrice: z.coerce.number({ error: "maxPrice rəqəm olmalıdır" }).min(0, { error: "maxPrice mənfi ola bilməz" }).optional(),
    sort: z.enum(BOOK_SORTS, { error: `sort bunlardan biri olmalıdır: ${BOOK_SORTS.join(", ")}` }).default("newest"),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    error: "minPrice maxPrice-dan böyük ola bilməz",
    path: ["minPrice"],
  });

export const bookIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,9}$/, { error: "Kitab id-si rəqəm olmalıdır" }),
});

export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;