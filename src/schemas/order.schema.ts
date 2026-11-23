import * as z from "zod";
import { OrderStatus } from "../generated/prisma/client";

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} mətn olmalıdır` })
    .trim()
    .min(min, { error: `${label} ən azı ${min} simvol olmalıdır` })
    .max(max, { error: `${label} ən çox ${max} simvol ola bilər` });

// Bu gün Bakı vaxtı ilə (UTC+4), n gün sonranın tarixi: "2026-11-26"
export function bakuDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(new Date()); // YYYY-MM-DD
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const MIN_DELIVERY_DAYS = 5;
export const MAX_DELIVERY_DAYS = 90;

const deliveryDate = z
  .string({ error: "deliveryDate mətn olmalıdır (YYYY-MM-DD)" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "deliveryDate YYYY-MM-DD formatında olmalıdır" })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), { error: "deliveryDate etibarlı tarix deyil" })
  .refine((value) => value >= bakuDatePlus(MIN_DELIVERY_DAYS), {
    error: `Çatdırılma tarixi ən tez bu gündən ${MIN_DELIVERY_DAYS} gün sonra ola bilər`,
  })
  .refine((value) => value <= bakuDatePlus(MAX_DELIVERY_DAYS), {
    error: `Çatdırılma tarixi ən çox ${MAX_DELIVERY_DAYS} gün sonra ola bilər`,
  });

const promoCode = z
  .string({ error: "promoCode mətn olmalıdır" })
  .trim()
  .toUpperCase()
  .min(1)
  .max(30, { error: "Promo kodu etibarlı deyil" });

// strictObject: cardNumber, cvv, price, totalCents və s. göndərilsə 400 qaytarır.
// Məbləğləri client göndərmir, server səbətdən və bazadakı qiymətlərdən özü hesablayır.
export const checkoutSchema = z.strictObject({
  payMethod: z.enum(["CARD", "CASH"], { error: "payMethod CARD və ya CASH olmalıdır" }),
  promoCode: promoCode.optional(),
  fullName: text("fullName", 3, 50),
  phone: z
    .string({ error: "phone mətn olmalıdır" })
    .trim()
    .regex(/^[+]?[\d\s\-()]{7,15}$/, { error: "Düzgün telefon nömrəsi daxil edin" }),
  city: text("city", 1, 60),
  street: text("street", 1, 120),
  building: text("building", 0, 20).optional(),
  apartment: text("apartment", 0, 20).optional(),
  deliveryDate,
});

export const orderIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,9}$/, { error: "Sifariş id-si rəqəm olmalıdır" }),
});

export const adminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(OrderStatus, { error: "status PENDING, CONFIRMED, DELIVERED və ya CANCELLED olmalıdır" }).optional(),
});

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(["CONFIRMED", "DELIVERED", "CANCELLED"], {
    error: "status CONFIRMED, DELIVERED və ya CANCELLED olmalıdır",
  }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;