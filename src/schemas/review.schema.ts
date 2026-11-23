import * as z from "zod";

export const REVIEW_SORTS = ["featured", "newest", "highest", "lowest"] as const;

const rating = z
  .number({ error: "rating rəqəm olmalıdır" })
  .int({ error: "rating tam ədəd olmalıdır" })
  .min(1, { error: "rating ən azı 1 olmalıdır" })
  .max(5, { error: "rating ən çox 5 ola bilər" });

const title = z.string({ error: "title mətn olmalıdır" }).trim().min(3, { error: "Başlıq ən azı 3 simvol olmalıdır" }).max(100, { error: "Başlıq ən çox 100 simvol ola bilər" });
const body = z.string({ error: "body mətn olmalıdır" }).trim().min(10, { error: "Rəy ən azı 10 simvol olmalıdır" }).max(2000, { error: "Rəy ən çox 2000 simvol ola bilər" });
const recommended = z.boolean({ error: "recommended true/false olmalıdır" });

// recommended göndərilməsə rating >= 4 olanda tövsiyə sayılır (service-də)
export const createReviewSchema = z.strictObject({ rating, title, body, recommended: recommended.optional() });

export const updateReviewSchema = z
  .strictObject({ rating: rating.optional(), title: title.optional(), body: body.optional(), recommended: recommended.optional() })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });

export const voteSchema = z.strictObject({ helpful: z.enum(["yes", "no"], { error: 'helpful "yes" və ya "no" olmalıdır' }) });

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(REVIEW_SORTS, { error: `sort bunlardan biri olmalıdır: ${REVIEW_SORTS.join(", ")}` }).default("featured"),
  rating: z.coerce.number({ error: "rating rəqəm olmalıdır" }).int().min(1).max(5).optional(),
});

export const reviewIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,9}$/, { error: "Rəy id-si rəqəm olmalıdır" }),
});
export const reviewBookParamSchema = z.object({
  bookId: z.string().regex(/^\d{1,9}$/, { error: "Kitab id-si rəqəm olmalıdır" }),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;