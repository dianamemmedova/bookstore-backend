import * as z from "zod";

// Admin kodu yaradanda: böyük hərf, rəqəm, _ və -, 3-30 simvol. Kiçik hərflə yazsa da böyüyə çevrilir.
const adminCode = z
  .string({ error: "code mətn olmalıdır" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,30}$/, { error: "Kod 3-30 simvol olmalıdır: hərf, rəqəm, _ və -" });

// İstifadəçi yoxlayanda: formatı ayrıca yoxlamırıq, səhv kod sadəcə "etibarlı deyil" olsun
const userCode = z
  .string({ error: "code mətn olmalıdır" })
  .trim()
  .toUpperCase()
  .min(1, { error: "Promo kodu daxil edin" })
  .max(30, { error: "Promo kodu etibarlı deyil" });

const discountPercent = z
  .number({ error: "discountPercent rəqəm olmalıdır" })
  .int({ error: "discountPercent tam ədəd olmalıdır" })
  .min(1, { error: "discountPercent ən azı 1 olmalıdır" })
  .max(90, { error: "discountPercent ən çox 90 ola bilər" });

const description = z.string({ error: "description mətn olmalıdır" }).trim().max(200).nullable();

// ISO tarix mətni ("2026-12-31T23:59:59Z") gəlir, Date-ə çevrilir. null = müddətsiz.
const expiresAt = z.iso
  .datetime({ error: "expiresAt ISO formatında olmalıdır, məs. 2026-12-31T23:59:59Z" })
  .transform((value) => new Date(value))
  .nullable();

export const validatePromoSchema = z.strictObject({ code: userCode });

export const createPromoSchema = z.strictObject({
  code: adminCode,
  discountPercent,
  description: description.optional(),
  isActive: z.boolean({ error: "isActive true/false olmalıdır" }).default(true),
  expiresAt: expiresAt.optional(),
});

// code dəyişdirilmir: istifadə tarixçəsi koda bağlıdır
export const updatePromoSchema = z
  .strictObject({
    discountPercent: discountPercent.optional(),
    description: description.optional(),
    isActive: z.boolean({ error: "isActive true/false olmalıdır" }).optional(),
    expiresAt: expiresAt.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });

export const promoIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,9}$/, { error: "Promo id-si rəqəm olmalıdır" }),
});

export type CreatePromoInput = z.infer<typeof createPromoSchema>;
export type UpdatePromoInput = z.infer<typeof updatePromoSchema>;