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

// --- Admin: kitab yaratmaq və dəyişmək ---

const priceAzn = z
  .number({ error: "price rəqəm olmalıdır (AZN)" })
  .positive({ error: "price 0-dan böyük olmalıdır" })
  .max(10000, { error: "price ən çox 10000 AZN ola bilər" })
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    error: "price ən çox 2 onluq rəqəm ola bilər",
  });

const bookFields = {
  title: z.string({ error: "title mətn olmalıdır" }).trim().min(1, { error: "title boş ola bilməz" }).max(200),
  author: z.string({ error: "author mətn olmalıdır" }).trim().min(1, { error: "author boş ola bilməz" }).max(200),
  description: z.string({ error: "description mətn olmalıdır" }).trim().max(5000).nullable(),
  year: z
    .number({ error: "year rəqəm olmalıdır" })
    .int({ error: "year tam ədəd olmalıdır" })
    .min(1000, { error: "year ən azı 1000 olmalıdır" })
    .max(new Date().getFullYear() + 1, { error: "year gələcək ildən böyük ola bilməz" })
    .nullable(),
  pages: z
    .number({ error: "pages rəqəm olmalıdır" })
    .int({ error: "pages tam ədəd olmalıdır" })
    .min(1, { error: "pages ən azı 1 olmalıdır" })
    .max(10000)
    .nullable(),
  subjects: z
    .array(z.string().trim().min(1).max(60), { error: "subjects mətn siyahısı olmalıdır" })
    .max(10, { error: "subjects ən çox 10 ədəd ola bilər" }),
  price: priceAzn,
  // null = limitsiz (məs. e-kitab), 0 = qurtarıb
  stock: z
    .number({ error: "stock rəqəm olmalıdır" })
    .int({ error: "stock tam ədəd olmalıdır" })
    .min(0, { error: "stock mənfi ola bilməz" })
    .max(1_000_000)
    .nullable(),
};

// strictObject: gözlənilməyən sahə (məs. id, coverUrl) göndərilsə 400. Üz qabığı yalnız yükləmə endpointi ilə dəyişir.
export const createBookSchema = z.strictObject({
  title: bookFields.title,
  author: bookFields.author,
  price: bookFields.price,
  description: bookFields.description.optional(),
  year: bookFields.year.optional(),
  pages: bookFields.pages.optional(),
  subjects: bookFields.subjects.default([]),
  stock: bookFields.stock.default(null),
});

export const updateBookSchema = z
  .strictObject({
    title: bookFields.title.optional(),
    author: bookFields.author.optional(),
    price: bookFields.price.optional(),
    description: bookFields.description.optional(),
    year: bookFields.year.optional(),
    pages: bookFields.pages.optional(),
    subjects: bookFields.subjects.optional(),
    stock: bookFields.stock.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;