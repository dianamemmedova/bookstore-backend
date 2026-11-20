import * as z from "zod";

// pagination bütün siyahılarda istifadə olunacaq

export const paginationSchema = z.object({
  page: z.coerce
    .number({ error: "page rəqəm olmalıdır" })
    .int({ error: "page tam ədəd olmalıdır" })
    .min(1, { error: "page ən azı 1 olmalıdır" })
    .default(1),
  limit: z.coerce
    .number({ error: "limit rəqəm olmalıdır" })
    .int({ error: "limit tam ədəd olmalıdır" })
    .min(1, { error: "limit ən azı 1 olmalıdır" })
    .max(100, { error: "limit ən çox 100 ola bilər" })
    .default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;