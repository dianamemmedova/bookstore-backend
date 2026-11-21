import * as z from "zod";

const name = z
  .string({ error: "name mətn olmalıdır" })
  .trim()
  .min(1, { error: "Siyahının adı boş ola bilməz" })
  .max(60, { error: "Siyahının adı ən çox 60 simvol ola bilər" });

const idString = (label: string) => z.string().regex(/^\d{1,9}$/, { error: `${label} rəqəm olmalıdır` });

export const wishlistIdParamSchema = z.object({ id: idString("Siyahı id-si") });
export const wishlistItemParamSchema = z.object({ id: idString("Siyahı id-si"), bookId: idString("Kitab id-si") });

// strictObject: userId kimi artıq sahə göndərmək olmaz
export const createWishlistSchema = z.strictObject({
  name,
  isPublic: z.boolean({ error: "isPublic true/false olmalıdır" }).default(false),
});

export const updateWishlistSchema = z
  .strictObject({
    name: name.optional(),
    isPublic: z.boolean({ error: "isPublic true/false olmalıdır" }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });

export type CreateWishlistInput = z.infer<typeof createWishlistSchema>;
export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>;