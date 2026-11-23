import * as z from "zod";
import { EventLocation, EventType } from "../generated/prisma/client";

const str = (label: string, max: number) =>
  z.string({ error: `${label} mətn olmalıdır` }).trim().min(1, { error: `${label} boş ola bilməz` }).max(max, { error: `${label} ən çox ${max} simvol ola bilər` });

const storeFields = {
  name: str("name", 100),
  address: str("address", 200),
  lat: z.number({ error: "lat rəqəm olmalıdır" }).min(-90, { error: "lat -90 ilə 90 arasında olmalıdır" }).max(90, { error: "lat -90 ilə 90 arasında olmalıdır" }),
  lng: z.number({ error: "lng rəqəm olmalıdır" }).min(-180, { error: "lng -180 ilə 180 arasında olmalıdır" }).max(180, { error: "lng -180 ilə 180 arasında olmalıdır" }),
  phone: z.string({ error: "phone mətn olmalıdır" }).trim().regex(/^[+]?[\d\s\-()]{7,20}$/, { error: "Düzgün telefon nömrəsi daxil edin" }),
  hours: str("hours", 100),
};

export const createStoreSchema = z.strictObject(storeFields);
export const updateStoreSchema = z
  .strictObject({
    name: storeFields.name.optional(),
    address: storeFields.address.optional(),
    lat: storeFields.lat.optional(),
    lng: storeFields.lng.optional(),
    phone: storeFields.phone.optional(),
    hours: storeFields.hours.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });

// --- Tədbirlər ---

const dateStr = z
  .string({ error: "date mətn olmalıdır (YYYY-MM-DD)" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "date YYYY-MM-DD formatında olmalıdır" })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, { error: "date etibarlı tarix deyil" });

const eventFields = {
  storeId: z.number({ error: "storeId rəqəm olmalıdır" }).int().positive(),
  title: str("title", 150),
  type: z.enum(EventType, { error: "type AUTHOR, KIDS və ya OTHER olmalıdır" }),
  locationType: z.enum(EventLocation, { error: "locationType IN_STORE və ya VIRTUAL olmalıdır" }),
  date: dateStr,
  time: z.string({ error: "time mətn olmalıdır (HH:mm)" }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "time HH:mm formatında olmalıdır, məs. 14:00" }),
};

export const createEventSchema = z.strictObject(eventFields);
export const updateEventSchema = z
  .strictObject({
    storeId: eventFields.storeId.optional(),
    title: eventFields.title.optional(),
    type: eventFields.type.optional(),
    locationType: eventFields.locationType.optional(),
    date: eventFields.date.optional(),
    time: eventFields.time.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Ən azı bir sahə göndərilməlidir" });

// ?type=AUTHOR,KIDS kimi vergüllə bir neçə dəyər
const csvEnum = <T extends string>(values: readonly T[], label: string) =>
  z
    .string()
    .transform((value) => value.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values as [T, ...T[]], { error: `${label} dəyəri yanlışdır. Mümkün: ${values.join(", ")}` })).min(1));

export const listEventsQuerySchema = z
  .object({
    from: dateStr.optional(),
    to: dateStr.optional(),
    type: csvEnum(Object.values(EventType), "type").optional(),
    locationType: csvEnum(Object.values(EventLocation), "locationType").optional(),
    storeId: z.coerce.number().int().positive().optional(),
    sort: z.enum(["date", "store"], { error: 'sort "date" və ya "store" olmalıdır' }).default("date"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, { error: "from to-dan böyük ola bilməz", path: ["from"] });

export const idParamSchema = z.object({
  id: z.string().regex(/^\d{1,9}$/, { error: "id rəqəm olmalıdır" }),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;