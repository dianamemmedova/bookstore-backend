import * as z from "zod";

// Front kart nömrəsini boşluqlu göndərə bilər ("4521 0000 ..."): boşluqları atırıq, 16 rəqəm tələb edirik
export const balanceSchema = z.strictObject({
  cardNumber: z
    .string({ error: "cardNumber mətn olmalıdır" })
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{16}$/, { error: "Kart nömrəsi 16 rəqəmdən ibarət olmalıdır" })),
});

const amountAzn = z
  .number({ error: "amount rəqəm olmalıdır (AZN)" })
  .positive({ error: "amount 0-dan böyük olmalıdır" })
  .max(1000, { error: "amount ən çox 1000 AZN ola bilər" })
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, { error: "amount ən çox 2 onluq rəqəm ola bilər" });

const expiresAt = z.iso
  .datetime({ error: "expiresAt ISO formatında olmalıdır, məs. 2027-12-31T23:59:59Z" })
  .transform((value) => new Date(value))
  .nullable();

const note = z.string({ error: "note mətn olmalıdır" }).trim().max(200).nullable();

export const createGiftCardSchema = z.strictObject({
  amount: amountAzn,
  expiresAt: expiresAt.optional(),
  note: note.optional(),
});

export const updateGiftCardSchema = z
  .strictObject({
    isActive: z.boolean({ error: "isActive true/false olmalıdır" }).optional(),
    expiresAt: expiresAt.optional(),
    note: note.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });