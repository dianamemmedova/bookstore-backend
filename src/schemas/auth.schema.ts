import * as z from "zod";

const email = z.string({ error: "email metin formasinda olmalidir"}).trim().toLowerCase().pipe(z.email({ error: "Email formati yanlisdir"}))
const email2 =z.string({ error: "email string olmalidir"}).trim().toLowerCase().pipe(z.email({error: "Email formasi yanlisdir"}))
// const email = z.string({ error: "email mətn olmalıdır" }).trim().toLowerCase().pipe(z.email({ error: "Email formatı yanlışdır" }));

// export const registerSchema = z.object({
//     email,
//     password: z.string({ error: "password metin olmalidir" })
//         .min(8, { error: "Parol ən azı 8 simvol olmalıdır" })
//         .refine((p) => Buffer.byteLength(p, "utf8") <= 72, { error: "Parol 72 baytdan uzun ola bilmez" }),
// });

export const registerSchema = z.object({
    email,
    password: z.string({ error: "Password metin formatinda olamlidir" })
        .min(8, { error: " minumum 8 simvol olmalidir" })
    .refine((p) => Buffer.byteLength(p, "utf8") <= 72 , { error: "paswordun uzunlu]u 72 baytdan uzun olamamalidir"})
})

export const loginSchema = z.object({
    email,
    password: z.string({error: "pasword string olmalidir"}).min(1, {error: "pasvord bos ola bilmez"})
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
// export const registerSchema = z.object({
//   email,
//     password: z.string({ error: "password mətn olmalıdır" })
//     .min(8, { error: "Parol ən azı 8 simvol olmalıdır" })
//     .refine((p) => Buffer.byteLength(p, "utf8") <= 72, {
//         error: "Parol 72 baytdan uzun ola bilməz",
//     }),
// });

// export const loginSchema = z.object({
//     email,
//     password: z.string({ error: "password metin olmalidir" }).min(1, { error: "Parol bos ola bilmez" }),
// });

// export const loginSchema = z.object({
//   email,
//   password: z.string({ error: "password mətn olmalıdır" }).min(1, { error: "Parol boş ola bilməz" }),
// });

// export type RegisterInput = z.infer<typeof registerSchema>;
// export type LoginInput = z.infer<typeof loginSchema>

// export type RegisterInput = z.infer<typeof registerSchema>;
// export type LoginInput = z.infer<typeof loginSchema>;