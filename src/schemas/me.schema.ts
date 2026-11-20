import * as z from "zod";
import { passwordRule, personName } from "./auth.schema";

// updateMeSchema – istifadəçinin profil məlumatlarını yeniləməsini yoxlayır.
export const updateMeSchema = z
    // strictObject() - Bu metod obyektin yalnız əvvəlcədən müəyyən etdiyimiz sahələri qəbul etməsinə imkan verir.
  .strictObject({
    firstName: personName("Ad").optional(),
    lastName: personName("Soyad").optional(),
    marketingOptIn: z.boolean({ error: "marketingOptIn true/false olmalıdır" }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    error: "Ən azı bir sahə göndərilməlidir",
  });
  // Zod-da refine() hazır validasiya qaydalarından əlavə özümüzün xüsusi şərtimizi yazmağımıza imkan verir.

// changePasswordSchema – istifadəçinin parolunu dəyişməsi zamanı göndərdiyi məlumatları yoxlayır.
export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string({ error: "currentPassword mətn olmalıdır" }).min(1, { error: "Cari parol boş ola bilməz" }),
    newPassword: passwordRule,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    error: "Yeni parol cari paroldan fərqli olmalıdır",
    path: ["newPassword"],
  });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;