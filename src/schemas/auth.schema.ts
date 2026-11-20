import * as z from "zod";

const email = z
  .string({ error: "email mətn olmalıdır" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Email formatı yanlışdır" }));

export const personName = (label: string) =>
  z
    .string({ error: `${label} mətn olmalıdır` })
    .trim()
    .min(2, { error: `${label} ən azı 2 simvol olmalıdır` })
    .max(50, { error: `${label} ən çox 50 simvol ola bilər` })
    .regex(/^[\p{L}\s'-]+$/u, { error: `${label} yalnız hərflərdən ibarət olmalıdır` });

export const passwordRule = z
  .string({ error: "password mətn olmalıdır" })
  .min(8, { error: "Parol ən azı 8 simvol olmalıdır" })
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, {
    error: "Parol 72 baytdan uzun ola bilməz",
  });

export const registerSchema = z.object({
  firstName: personName("Ad"),
  lastName: personName("Soyad"),
  email,
  password: passwordRule,
  marketingOptIn: z.boolean({ error: "marketingOptIn true/false olmalıdır" }).default(false),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: "password mətn olmalıdır" }).min(1, { error: "Parol boş ola bilməz" }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;