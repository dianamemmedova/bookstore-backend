import * as z from "zod";

// Front-dakı <select> ilə eyni mövzular
export const CONTACT_SUBJECTS = ["Sifariş haqqında", "Kitab tövsiyəsi", "Texniki problem", "Əməkdaşlıq", "Digər"] as const;

const email = z
  .string({ error: "email mətn olmalıdır" })
  .trim()
  .toLowerCase()
  .max(254, { error: "Email çox uzundur" })
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { error: "Email formatı düzgün deyil." });

export const contactSchema = z.strictObject({
  name: z.string({ error: "name mətn olmalıdır" }).trim().min(2, { error: "Ad ən azı 2 simvol olmalıdır" }).max(100, { error: "Ad ən çox 100 simvol ola bilər" }),
  email,
  subject: z.enum(CONTACT_SUBJECTS, { error: `subject bunlardan biri olmalıdır: ${CONTACT_SUBJECTS.join(", ")}` }),
  message: z.string({ error: "message mətn olmalıdır" }).trim().min(10, { error: "Mesaj ən azı 10 simvol olmalıdır" }).max(3000, { error: "Mesaj ən çox 3000 simvol ola bilər" }),
});

export const newsletterSubscribeSchema = z.strictObject({ email });
export const newsletterUnsubscribeSchema = z.strictObject({
  token: z.string({ error: "token mətn olmalıdır" }).trim().min(10).max(100),
});

const flag = z.enum(["true", "false"], { error: 'Yalnız "true" və ya "false"' }).transform((v) => v === "true");

export const adminContactQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: flag.optional(),
});
export const adminNewsletterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  active: flag.optional(),
});
export const markReadSchema = z.strictObject({ isRead: z.boolean({ error: "isRead true/false olmalıdır" }) });

export const idParamSchema = z.object({
  id: z.string().regex(/^\d{1,9}$/, { error: "id rəqəm olmalıdır" }),
});

export type ContactInput = z.infer<typeof contactSchema>;