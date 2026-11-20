import * as z from "zod";

const quantity = z
  .number({ error: "quantity rəqəm olmalıdır" })
  .int({ error: "quantity tam ədəd olmalıdır" })
  .min(1, { error: "quantity ən azı 1 olmalıdır (silmək üçün DELETE istifadə et)" })
  .max(99, { error: "Bir kitabdan ən çox 99 ədəd ola bilər" });

export const cartBookParamSchema = z.object({
  bookId: z.string().regex(/^\d{1,9}$/, { error: "Kitab id-si rəqəm olmalıdır" }),
});

// Qiymət göndərilmir: server həmişə bazadakı qiyməti götürür
export const setQuantitySchema = z.strictObject({ quantity });

// Qonaq səbətini giriş edəndən sonra serverdəki səbətə qatmaq üçün
export const mergeCartSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        bookId: z.number({ error: "bookId rəqəm olmalıdır" }).int().positive(),
        quantity,
      }),
      { error: "items siyahı olmalıdır" },
    )
    .min(1, { error: "items boş ola bilməz" })
    .max(50, { error: "Bir dəfəyə ən çox 50 kitab birləşdirmək olar" }),
});

export type SetQuantityInput = z.infer<typeof setQuantitySchema>;
export type MergeCartInput = z.infer<typeof mergeCartSchema>;