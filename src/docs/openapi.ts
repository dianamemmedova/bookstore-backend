import * as z from "zod";
import { registerSchema, loginSchema } from "../schemas/auth.schema";
import { updateMeSchema, changePasswordSchema } from "../schemas/me.schema";
import { listBooksQuerySchema, adminListBooksQuerySchema, createBookSchema, updateBookSchema } from "../schemas/book.schema";
import { setQuantitySchema, mergeCartSchema } from "../schemas/cart.schema";
import { createWishlistSchema, updateWishlistSchema } from "../schemas/wishlist.schema";
import { validatePromoSchema, createPromoSchema, updatePromoSchema } from "../schemas/promo.schema";
import { checkoutSchema, adminOrdersQuerySchema, updateOrderStatusSchema } from "../schemas/order.schema";
import { createReviewSchema, updateReviewSchema, voteSchema, listReviewsQuerySchema } from "../schemas/review.schema";
import { contactSchema, newsletterSubscribeSchema, newsletterUnsubscribeSchema, adminContactQuerySchema, adminNewsletterQuerySchema, markReadSchema } from "../schemas/contact.schema";
import { balanceSchema, createGiftCardSchema, updateGiftCardSchema } from "../schemas/gift-card.schema";
import { createStoreSchema, updateStoreSchema, createEventSchema, updateEventSchema, listEventsQuerySchema } from "../schemas/store.schema";
import { salesQuerySchema, topBooksQuerySchema, lowStockQuerySchema } from "../schemas/stats.schema";
import { paginationSchema } from "../schemas/common.schema";
import { bakuDatePlus } from "../schemas/order.schema";

// Sənəd KODDAKI Zod schema-lardan götürülür: request body və query parametrləri kodla eyni qalır,
// ayrıca əl ilə yazılmır. Yalnız cavab formaları (components) aşağıda əl ilə təsvir olunub.

type Json = Record<string, unknown>;

function toJson(schema: z.ZodType): Json {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Json;
  return rest;
}

function queryParameters(schema: z.ZodType) {
  const json = toJson(schema) as { properties?: Record<string, Json>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: "query",
    required: json.required?.includes(name) ?? false,
    schema: prop,
  }));
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: Json) => ({ "application/json": { schema } });

type Auth = "none" | "optional" | "user" | "admin";

type Op = {
  tag: string;
  summary: string;
  description?: string;
  auth?: Auth;
  path?: Record<string, string>; // yol parametrləri: ad → izah
  query?: z.ZodType;
  body?: z.ZodType;
  example?: Json; // Swagger-də 'Try it out' üçün hazır nümunə
  multipart?: Json; // fayl yükləmə
  ok?: { status?: number; description?: string; schema?: Json };
  errors?: Record<number, string>; // əlavə xəta cavabları
};

const COMMON_ERRORS: Record<number, string> = {
  400: "Sorğu məlumatları yanlışdır (VALIDATION_ERROR). `error.details` sahələr üzrə xətaları göstərir",
  401: "Token yoxdur və ya etibarsızdır (UNAUTHORIZED)",
  403: "İcazə yoxdur (FORBIDDEN)",
  404: "Tapılmadı (NOT_FOUND)",
};

function build(method: string, p: string, op: Op) {
  const auth = op.auth ?? "none";
  const parameters = [
    ...Object.entries(op.path ?? {}).map(([name, description]) => ({
      name,
      in: "path",
      required: true,
      description,
      schema: { type: "string", pattern: "^\\d{1,9}$" },
    })),
    ...(op.query ? queryParameters(op.query) : []),
  ];

  const status = op.ok?.status ?? 200;
  const responses: Record<string, Json> = {
    [status]: {
      description: op.ok?.description ?? (status === 204 ? "Uğurlu, cavab gövdəsi yoxdur" : "Uğurlu"),
      ...(status !== 204 && op.ok?.schema ? { content: jsonContent(op.ok.schema) } : {}),
    },
  };
  const errors: Record<number, string> = { ...op.errors };
  if (op.body || op.query || op.multipart || op.path) errors[400] ??= COMMON_ERRORS[400];
  if (auth === "user" || auth === "admin") errors[401] ??= COMMON_ERRORS[401];
  if (auth === "optional") errors[401] ??= "Token göndərilib, amma etibarsızdır (UNAUTHORIZED)";
  if (auth === "admin") errors[403] ??= COMMON_ERRORS[403];
  for (const [code, description] of Object.entries(errors)) {
    responses[code] = { description, content: jsonContent(ref("Error")) };
  }

  return {
    tags: [op.tag],
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    ...(auth === "user" || auth === "admin" ? { security: [{ bearerAuth: [] }] } : {}),
    ...(auth === "optional" ? { security: [{}, { bearerAuth: [] }] } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(op.body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: toJson(op.body), ...(op.example ? { example: op.example } : {}) } },
          },
        }
      : {}),
    ...(op.multipart ? { requestBody: { required: true, content: { "multipart/form-data": { schema: op.multipart } } } } : {}),
    responses,
  };
}

// --- Cavab formaları (components) ---

const int = { type: "integer" };
const str = { type: "string" };
const bool = { type: "boolean" };
const nullable = (schema: Json) => ({ anyOf: [schema, { type: "null" }] });
const dateTime = { type: "string", format: "date-time" };
const arrayOf = (schema: Json) => ({ type: "array", items: schema });
const obj = (properties: Record<string, Json>) => ({ type: "object", properties });

const schemas: Record<string, Json> = {
  Error: obj({
    error: obj({
      code: { ...str, example: "VALIDATION_ERROR" },
      message: str,
      requestId: { ...str, format: "uuid" },
      details: { description: "Yalnız bəzi xətalarda (məs. validasiya, INSUFFICIENT_STOCK)" },
    }),
  }),
  User: obj({ id: int, email: { ...str, format: "email" }, firstName: str, lastName: str, role: { type: "string", enum: ["USER", "ADMIN"] }, createdAt: dateTime }),
  AuthResult: obj({ user: ref("User"), token: { ...str, description: "JWT (HS256). `Authorization: Bearer <token>` kimi göndərilir" } }),
  Page: obj({ page: int, limit: int, total: int, totalPages: int }),
  Book: obj({
    id: int, externalId: nullable(str), title: str, author: str, description: nullable(str), coverUrl: nullable(str),
    year: nullable(int), pages: nullable(int), subjects: arrayOf(str),
    priceCents: { ...int, description: "Adi qiymət qəpiklə" }, price: { type: "number", description: "Adi qiymət AZN ilə" },
    discountPercent: { ...int, description: "Endirim faizi (0–90), 0 = endirim yoxdur" },
    salePriceCents: { ...int, description: "Müştərinin ödəyəcəyi qiymət (endirimlə), qəpiklə. Səbət və sifariş bunu işlədir" }, salePrice: { type: "number", description: "Satış qiyməti AZN ilə" },
    isAudiobook: bool,
    hasAudio: { ...bool, description: "Audio fayl yüklənib. Fayl adı heç vaxt göstərilmir, dinləmə yalnız alanlara açılır" },
    inStock: bool,
  }),
  AdminBook: { allOf: [ref("Book"), obj({ stock: { ...nullable(int), description: "Qalıq (null = limitsiz)" }, createdAt: dateTime, updatedAt: dateTime })] },
  AdminBookList: { allOf: [ref("Page"), obj({ items: arrayOf(ref("AdminBook")) })] },
  BookList: { allOf: [ref("Page"), obj({ items: arrayOf(ref("Book")) })] },
  Cart: obj({
    items: arrayOf(obj({ bookId: int, quantity: int, book: ref("Book"), lineTotalCents: int, available: { ...bool, description: "false: admin stoku azaldıb, miqdar artıq mövcud deyil" } })),
    itemCount: int, subtotalCents: int, subtotal: { type: "number" },
  }),
  Wishlist: obj({
    id: int, name: str, isPublic: bool, createdAt: dateTime, updatedAt: dateTime, itemCount: int,
    items: arrayOf(obj({ bookId: int, addedAt: dateTime, book: ref("Book") })),
  }),
  Order: obj({
    id: int, status: { type: "string", enum: ["PENDING", "CONFIRMED", "DELIVERED", "CANCELLED"] }, payMethod: { type: "string", enum: ["CARD", "CASH"] },
    items: arrayOf(obj({ bookId: int, title: str, author: str, coverUrl: nullable(str), unitPriceCents: int, unitPrice: { type: "number" }, quantity: int, lineTotalCents: int })),
    subtotalCents: int, subtotal: { type: "number" }, discountCents: int, discountAmount: { type: "number" },
    deliveryFeeCents: int, deliveryFee: { type: "number" }, totalCents: int, finalTotal: { type: "number" },
    promoCode: nullable(str), discountPercent: nullable(int), deliveryDate: { ...str, format: "date" },
    delivery: obj({ fullName: str, phone: str, city: str, street: str, building: str, apartment: str }),
    createdAt: dateTime, cancelledAt: nullable(dateTime),
  }),
  Review: obj({
    id: int, bookId: int, user: { ...str, example: "Əli M." }, rating: int, title: str, body: str, recommended: bool,
    helpful: obj({ yes: int, no: int }), myVote: { ...nullable({ type: "string", enum: ["yes", "no"] }), description: "Giriş edənin öz səsi" },
    isMine: bool, createdAt: dateTime, updatedAt: dateTime,
  }),
  ReviewList: {
    allOf: [
      ref("Page"),
      obj({
        summary: obj({ totalReviews: int, avgRating: { type: "number" }, recommendedPercent: int, ratingCounts: arrayOf(obj({ star: int, count: int })) }),
        items: arrayOf(ref("Review")),
      }),
    ],
  },
  Store: obj({ id: int, name: str, address: str, lat: { type: "number" }, lng: { type: "number" }, phone: str, hours: str }),
  StoreEvent: obj({
    id: int, storeId: int, storeName: str, title: str,
    type: { type: "string", enum: ["AUTHOR", "KIDS", "OTHER"] }, locationType: { type: "string", enum: ["IN_STORE", "VIRTUAL"] },
    date: { ...str, format: "date" }, time: { ...str, example: "14:00" },
  }),
  Message: obj({ message: str }),
};

const ok = (schema: Json, extra: Partial<NonNullable<Op["ok"]>> = {}) => ({ schema, ...extra });
const created = (schema: Json) => ({ status: 201, schema });
const noContent = { status: 204 } as const;
const idPath = (what: string) => ({ id: `${what} id-si` });

// --- Endpointlər ---

const operations: [string, string, Op][] = [
  // Auth
  ["post", "/auth/register", { tag: "Auth", summary: "Qeydiyyat", example: { firstName: "Diana", lastName: "Məmmədova", email: "diana@example.com", password: "Parol12345", marketingOptIn: false }, description: "Yeni istifadəçi yaradır və dərhal token qaytarır. Saatda IP başına 10 cəhd.", body: registerSchema, ok: created(ref("AuthResult")), errors: { 409: "Email artıq qeydiyyatdadır (EMAIL_TAKEN)", 429: "Çox sayda qeydiyyat" } }],
  ["post", "/auth/login", { tag: "Auth", summary: "Giriş", example: { email: "admin@bookstore.az", password: "AdminParol123" }, description: "15 dəqiqədə 5 uğursuz cəhddən sonra bloklanır (429). Səhv email və səhv parol eyni 401 cavabını verir.", body: loginSchema, ok: ok(ref("AuthResult")), errors: { 401: "Email və ya parol yanlışdır", 429: "Çox sayda uğursuz cəhd" } }],

  // Profil
  ["get", "/me", { tag: "Profil", summary: "Öz profilim", auth: "user", ok: ok(ref("User")) }],
  ["patch", "/me", { tag: "Profil", summary: "Profili dəyiş", auth: "user", body: updateMeSchema, ok: ok(ref("User")) }],
  ["put", "/me/password", { tag: "Profil", summary: "Parolu dəyiş", auth: "user", body: changePasswordSchema, ok: noContent, errors: { 400: "Cari parol yanlışdır (WRONG_PASSWORD) və ya yeni parol uyğun deyil" } }],

  // Kitablar
  ["get", "/books", { tag: "Kitablar", summary: "Kataloq (axtarış, filtr, sıralama)", query: listBooksQuerySchema, ok: ok(ref("BookList")) }],
  ["get", "/books/{id}", { tag: "Kitablar", summary: "Kitabın detalları", path: idPath("Kitab"), ok: ok(ref("Book")), errors: { 404: "Kitab tapılmadı" } }],
  ["get", "/books/{id}/audio-access", { tag: "Audio", summary: "Dinləmə linki al", description: "Yalnız kitabı alan (ləğv olunmamış sifarişi olan) istifadəçi və ya admin üçün. Cavabdakı `url` 2 saat işləyir və `GET /audio/{token}` ilə açılır. Almayıbsa 403, audio yüklənməyibsə 404.", auth: "user", path: idPath("Kitab"), ok: ok(obj({ url: { ...str, example: "/audio/eyJhbGciOi..." }, expiresInSeconds: int })), errors: { 403: "Kitab alınmayıb", 404: "Audio yoxdur" } }],
  ["get", "/audio/{token}", { tag: "Audio", summary: "Audio faylı axıt", description: "`audio-access` cavabındakı linkdir (token linkin içindədir, başlıq lazım deyil). `Range` başlığı dəstəklənir: pleyerdə irəli-geri çəkmək üçün 206 qaytarır. Token etibarsız və ya vaxtı bitibsə 401.", path: { token: "audio-access cavabından gələn token" }, ok: ok({ type: "string", format: "binary" }), errors: { 401: "Link etibarsızdır və ya vaxtı bitib", 404: "Audio yoxdur" } }],

  // Səbət
  ["get", "/cart", { tag: "Səbət", summary: "Səbətim", description: "Qiymətlər həmişə bazadakı cari qiymətdir.", auth: "user", ok: ok(ref("Cart")) }],
  ["delete", "/cart", { tag: "Səbət", summary: "Səbəti təmizlə", auth: "user", ok: noContent }],
  ["post", "/cart/merge", { tag: "Səbət", summary: "Qonaq səbətini birləşdir", example: { items: [{ bookId: 1, quantity: 2 }] }, description: "Girişdən sonra brauzerdəki (localStorage) səbəti serverdəkinə qatır. Stokdan çox olanı azaldır (`adjusted`), tapılmayan/qurtarmışı atır (`skipped`).", auth: "user", body: mergeCartSchema, ok: ok(obj({ cart: ref("Cart"), skipped: arrayOf(obj({ bookId: int, reason: { type: "string", enum: ["NOT_FOUND", "OUT_OF_STOCK"] } })), adjusted: arrayOf(obj({ bookId: int, quantity: int })) })) }],
  ["put", "/cart/items/{bookId}", { tag: "Səbət", summary: "Kitabın sayını təyin et", description: "Sətri yaradır və ya sayını əvəz edir (artırmır).", auth: "user", path: { bookId: "Kitab id-si" }, body: setQuantitySchema, ok: ok(ref("Cart")), errors: { 404: "Kitab tapılmadı", 409: "Stok kifayət etmir (INSUFFICIENT_STOCK, `details.available`)" } }],
  ["delete", "/cart/items/{bookId}", { tag: "Səbət", summary: "Kitabı səbətdən çıxar", auth: "user", path: { bookId: "Kitab id-si" }, ok: ok(ref("Cart")) }],

  // Wishlist
  ["get", "/wishlists", { tag: "Arzu siyahıları", summary: "Siyahılarım", auth: "user", ok: ok(obj({ items: arrayOf(obj({ id: int, name: str, isPublic: bool, itemCount: int })) })) }],
  ["post", "/wishlists", { tag: "Arzu siyahıları", summary: "Yeni siyahı", description: "Ən çox 20 siyahı. Ad istifadəçi daxilində unikaldır.", auth: "user", body: createWishlistSchema, ok: created(ref("Wishlist")), errors: { 409: "WISHLIST_NAME_TAKEN və ya WISHLIST_LIMIT" } }],
  ["get", "/wishlists/{id}", { tag: "Arzu siyahıları", summary: "Siyahının detalı", description: "Başqasının siyahısı 404 qaytarır.", auth: "user", path: idPath("Siyahı"), ok: ok(ref("Wishlist")) }],
  ["patch", "/wishlists/{id}", { tag: "Arzu siyahıları", summary: "Adı və ya açıqlığı dəyiş", auth: "user", path: idPath("Siyahı"), body: updateWishlistSchema, ok: ok(ref("Wishlist")), errors: { 409: "WISHLIST_NAME_TAKEN" } }],
  ["delete", "/wishlists/{id}", { tag: "Arzu siyahıları", summary: "Siyahını sil", auth: "user", path: idPath("Siyahı"), ok: noContent }],
  ["put", "/wishlists/{id}/items/{bookId}", { tag: "Arzu siyahıları", summary: "Kitab əlavə et", description: "Təkrar əlavə xəta deyil (idempotent). Siyahıda ən çox 200 kitab.", auth: "user", path: { id: "Siyahı id-si", bookId: "Kitab id-si" }, ok: ok(ref("Wishlist")), errors: { 409: "WISHLIST_FULL" } }],
  ["delete", "/wishlists/{id}/items/{bookId}", { tag: "Arzu siyahıları", summary: "Kitabı siyahıdan çıxar", auth: "user", path: { id: "Siyahı id-si", bookId: "Kitab id-si" }, ok: ok(ref("Wishlist")) }],
  ["get", "/public/wishlists/{id}", { tag: "Arzu siyahıları", summary: "Açıq siyahıya bax (tokensiz)", description: "Yalnız `isPublic: true` siyahılar. Sahibin yalnız adı göstərilir. Gizli siyahı 404 verir.", path: idPath("Siyahı"), ok: ok({ allOf: [ref("Wishlist"), obj({ owner: obj({ firstName: str }) })] }) }],

  // Promo
  ["post", "/promo/validate", { tag: "Promo", summary: "Promo kodunu yoxla", description: "Qonaq da yoxlaya bilər; token varsa 'bu kodu artıq işlətmisən?' də yoxlanır. Etibarsız, söndürülmüş və müddəti bitmiş kod eyni 400 PROMO_INVALID verir. Uğursuz cəhdlər limitlidir (15 dəq / 30).", auth: "optional", body: validatePromoSchema, ok: ok(obj({ code: str, description: nullable(str), discountPercent: int })), errors: { 400: "PROMO_INVALID", 409: "PROMO_ALREADY_USED", 429: "Çox sayda uğursuz cəhd" } }],

  // Sifarişlər
  ["post", "/orders", { tag: "Sifarişlər", summary: "Sifariş ver (checkout)", example: { payMethod: "CASH", promoCode: "ILKALIS20", fullName: "Diana Məmmədova", phone: "+994501234567", city: "Bakı", street: "Nizami küç.", building: "10", apartment: "5", deliveryDate: bakuDatePlus(6) }, description: "Sifariş serverdəki **səbətdən** yaranır. Məbləğləri client göndərmir. Kart məlumatları (nömrə, CVV) göndərilsə 400. Hamısı bir transaksiyada: stok, promo, sifariş, səbətin təmizlənməsi. Çatdırılma 5 AZN, endirimdən sonra ≥ 60 AZN olsa pulsuz.", auth: "user", body: checkoutSchema, ok: created(ref("Order")), errors: { 400: "CART_EMPTY, PROMO_INVALID və ya validasiya xətası", 409: "INSUFFICIENT_STOCK və ya PROMO_ALREADY_USED" } }],
  ["get", "/orders", { tag: "Sifarişlər", summary: "Sifarişlərim", auth: "user", ok: ok(obj({ items: arrayOf(ref("Order")) })) }],
  ["get", "/orders/{id}", { tag: "Sifarişlər", summary: "Sifarişin detalı", description: "Başqasının sifarişi 404 qaytarır.", auth: "user", path: idPath("Sifariş"), ok: ok(ref("Order")) }],
  ["post", "/orders/{id}/cancel", { tag: "Sifarişlər", summary: "Sifarişi ləğv et", description: "Yalnız PENDING və CONFIRMED. Stok qayıdır, promo azad olur.", auth: "user", path: idPath("Sifariş"), ok: ok(ref("Order")), errors: { 409: "ORDER_NOT_CANCELLABLE" } }],

  // Rəylər
  ["get", "/books/{bookId}/reviews", { tag: "Rəylər", summary: "Kitabın rəyləri", description: "Qonaq da oxuya bilər. Token varsa hər rəydə `myVote` və `isMine` dolur. `summary` həmişə kitabın bütün rəylərindən hesablanır (ulduz filtri onu dəyişmir).", auth: "optional", path: { bookId: "Kitab id-si" }, query: listReviewsQuerySchema, ok: ok(ref("ReviewList")) }],
  ["post", "/books/{bookId}/reviews", { tag: "Rəylər", summary: "Rəy yaz", example: { rating: 5, title: "Möhtəşəm əsər", body: "Bu kitabı bir nəfəsə oxudum, hamıya tövsiyə edirəm." }, description: "Bir istifadəçi bir kitaba bir rəy yaza bilər.", auth: "user", path: { bookId: "Kitab id-si" }, body: createReviewSchema, ok: created(ref("Review")), errors: { 409: "REVIEW_ALREADY_EXISTS" } }],
  ["patch", "/reviews/{id}", { tag: "Rəylər", summary: "Öz rəyini dəyiş", auth: "user", path: idPath("Rəy"), body: updateReviewSchema, ok: ok(ref("Review")) }],
  ["delete", "/reviews/{id}", { tag: "Rəylər", summary: "Rəyi sil", description: "Öz rəyini istifadəçi, istənilən rəyi admin silə bilər.", auth: "user", path: idPath("Rəy"), ok: noContent }],
  ["put", "/reviews/{id}/vote", { tag: "Rəylər", summary: "'Faydalı oldu?' səsi ver / dəyiş", auth: "user", path: idPath("Rəy"), body: voteSchema, ok: ok(ref("Review")), errors: { 403: "Öz rəyinə səs vermək olmaz" } }],
  ["delete", "/reviews/{id}/vote", { tag: "Rəylər", summary: "Səsi geri götür", auth: "user", path: idPath("Rəy"), ok: ok(ref("Review")) }],

  // Əlaqə, bülleten, hədiyyə kartı
  ["post", "/contact", { tag: "Əlaqə", summary: "Əlaqə formu", example: { name: "Diana", email: "diana@example.com", subject: "Sifariş haqqında", message: "Sifarişim hələ gəlib çatmayıb, kömək edin." }, description: "Qonaq da yaza bilər; token varsa mesaj istifadəçiyə bağlanır. Saatda 10 uğurlu mesaj.", auth: "optional", body: contactSchema, ok: created(ref("Message")), errors: { 429: "Çox sayda mesaj" } }],
  ["post", "/newsletter/subscribe", { tag: "Bülleten", summary: "Abunə ol", description: "Təkrar abunə xəta deyil və cavab eynidir (email-in varlığı sızmır). Real email hələ göndərilmir.", body: newsletterSubscribeSchema, ok: ok(ref("Message")) }],
  ["post", "/newsletter/unsubscribe", { tag: "Bülleten", summary: "Abunəlikdən çıx (token ilə)", body: newsletterUnsubscribeSchema, ok: ok(ref("Message")) }],
  ["post", "/gift-cards/balance", { tag: "Hədiyyə kartı", summary: "Kart balansı", description: "Tapılmayan, söndürülmüş və müddəti bitmiş kart eyni 404 verir. 15 dəqiqədə 10 'tapılmadı' limiti.", body: balanceSchema, ok: ok(obj({ balanceCents: int, balance: { type: "number" }, expiresAt: nullable(dateTime) })), errors: { 404: "GIFT_CARD_NOT_FOUND", 429: "Çox sayda uğursuz cəhd" } }],

  // Mağazalar və tədbirlər
  ["get", "/stores", { tag: "Mağazalar", summary: "Mağazalar", ok: ok(obj({ items: arrayOf(ref("Store")) })) }],
  ["get", "/stores/{id}", { tag: "Mağazalar", summary: "Mağaza", path: idPath("Mağaza"), ok: ok(ref("Store")) }],
  ["get", "/events", { tag: "Tədbirlər", summary: "Tədbirlər (filtr)", description: "`type` və `locationType` vergüllə bir neçə dəyər qəbul edir: `type=AUTHOR,KIDS`.", query: listEventsQuerySchema, ok: ok({ allOf: [ref("Page"), obj({ items: arrayOf(ref("StoreEvent")) })] }) }],
  ["get", "/events/{id}", { tag: "Tədbirlər", summary: "Tədbir", path: idPath("Tədbir"), ok: ok(ref("StoreEvent")) }],

  // Admin: istifadəçilər, kitablar
  ["get", "/admin/users", { tag: "Admin: istifadəçilər", summary: "İstifadəçi siyahısı", auth: "admin", query: paginationSchema, ok: ok({ allOf: [ref("Page"), obj({ items: arrayOf(ref("User")) })] }) }],
  ["get", "/admin/books", { tag: "Admin: kitablar", summary: "Kitab siyahısı (dəqiq stok ilə)", description: "Müştəri kataloqu ilə eyni axtarış/filtr/sıralama + `stockStatus` (in, low ≤5, out, unlimited). Cavabda dəqiq `stock` var.", auth: "admin", query: adminListBooksQuerySchema, ok: ok(ref("AdminBookList")) }],
  ["post", "/admin/books", { tag: "Admin: kitablar", summary: "Kitab yarat", example: { title: "Nümunə kitab", author: "Müəllif", price: 12.5, discountPercent: 20, isAudiobook: false, stock: 20, subjects: ["Roman"], year: 2020, pages: 300, description: "Qısa təsvir" }, description: "`price` adi qiymətdir, AZN ilə (ən çox 2 onluq). `discountPercent` 0–90: satış qiyməti `salePrice` avtomatik hesablanır. `isAudiobook` audio kitab işarəsidir. `coverUrl` göndərilmir, üz qabığı ayrıca yüklənir.", auth: "admin", body: createBookSchema, ok: created(ref("AdminBook")) }],
  ["patch", "/admin/books/{id}", { tag: "Admin: kitablar", summary: "Kitabı dəyiş", auth: "admin", path: idPath("Kitab"), body: updateBookSchema, ok: ok(ref("AdminBook")) }],
  ["delete", "/admin/books/{id}", { tag: "Admin: kitablar", summary: "Kitabı sil", description: "Sifarişdə olan kitab silinmir (409 RELATION_CONFLICT).", auth: "admin", path: idPath("Kitab"), ok: noContent, errors: { 409: "RELATION_CONFLICT" } }],
  ["post", "/admin/books/{id}/audio", { tag: "Admin: kitablar", summary: "Audio fayl yüklə", description: "MP3, M4A, OGG və ya WAV, ən çox 200 MB. Fayl tipi uzantıdan yox, faylın içindən yoxlanır. Fayl açıq qovluqda deyil, private qovluqda saxlanır. Kitab avtomatik `isAudiobook: true` olur. Köhnə fayl silinir.", auth: "admin", path: idPath("Kitab"), multipart: { type: "object", required: ["audio"], properties: { audio: { type: "string", format: "binary" } } }, ok: ok(ref("AdminBook")), errors: { 400: "INVALID_AUDIO" } }],
  ["delete", "/admin/books/{id}/audio", { tag: "Admin: kitablar", summary: "Audio faylı sil", auth: "admin", path: idPath("Kitab"), ok: ok(ref("AdminBook")) }],
  ["post", "/admin/books/{id}/cover", { tag: "Admin: kitablar", summary: "Üz qabığı yüklə", description: "JPEG, PNG və ya WEBP, ən çox 2 MB. Fayl tipi uzantıdan yox, faylın içindən (magic bytes) yoxlanır. Köhnə şəkil silinir.", auth: "admin", path: idPath("Kitab"), multipart: { type: "object", required: ["cover"], properties: { cover: { type: "string", format: "binary" } } }, ok: ok(ref("AdminBook")) }],

  // Admin: promo
  ["get", "/admin/promos", { tag: "Admin: promo", summary: "Promo kodları", auth: "admin", query: paginationSchema, ok: ok({ allOf: [ref("Page"), obj({ items: arrayOf(obj({ id: int, code: str, description: nullable(str), discountPercent: int, isActive: bool, expiresAt: nullable(dateTime), usedCount: int, createdAt: dateTime })) })] }) }],
  ["post", "/admin/promos", { tag: "Admin: promo", summary: "Promo kodu yarat", example: { code: "YAZ25", discountPercent: 25, description: "Yay kampaniyası", expiresAt: null }, auth: "admin", body: createPromoSchema, ok: created({ type: "object" }), errors: { 409: "PROMO_CODE_TAKEN" } }],
  ["patch", "/admin/promos/{id}", { tag: "Admin: promo", summary: "Promo kodunu dəyiş", auth: "admin", path: idPath("Promo"), body: updatePromoSchema, ok: ok({ type: "object" }) }],
  ["delete", "/admin/promos/{id}", { tag: "Admin: promo", summary: "Promo kodunu sil", description: "İstifadə olunub-sa silinmir, `isActive: false` ilə söndürmək lazımdır.", auth: "admin", path: idPath("Promo"), ok: noContent, errors: { 409: "PROMO_IN_USE" } }],

  // Admin: sifarişlər
  ["get", "/admin/orders", { tag: "Admin: sifarişlər", summary: "Bütün sifarişlər", auth: "admin", query: adminOrdersQuerySchema, ok: ok({ allOf: [ref("Page"), obj({ items: arrayOf({ allOf: [ref("Order"), obj({ user: obj({ id: int, email: str, firstName: str, lastName: str }) })] }) })] }) }],
  ["get", "/admin/orders/{id}", { tag: "Admin: sifarişlər", summary: "Sifarişin detalı", auth: "admin", path: idPath("Sifariş"), ok: ok(ref("Order")) }],
  ["patch", "/admin/orders/{id}/status", { tag: "Admin: sifarişlər", summary: "Statusu dəyiş", description: "İcazəli keçidlər: PENDING→CONFIRMED, CONFIRMED→DELIVERED, PENDING/CONFIRMED→CANCELLED (stok qayıdır, promo azad olur).", auth: "admin", path: idPath("Sifariş"), body: updateOrderStatusSchema, ok: ok(ref("Order")), errors: { 409: "INVALID_STATUS_TRANSITION və ya ORDER_NOT_CANCELLABLE" } }],

  // Admin: mesajlar, bülleten, hədiyyə kartları
  ["get", "/admin/contact-messages", { tag: "Admin: əlaqə", summary: "Mesajlar", auth: "admin", query: adminContactQuerySchema, ok: ok({ allOf: [ref("Page"), obj({ unreadCount: int, items: arrayOf({ type: "object" }) })] }) }],
  ["patch", "/admin/contact-messages/{id}", { tag: "Admin: əlaqə", summary: "Oxundu/oxunmadı işarələ", auth: "admin", path: idPath("Mesaj"), body: markReadSchema, ok: ok({ type: "object" }) }],
  ["delete", "/admin/contact-messages/{id}", { tag: "Admin: əlaqə", summary: "Mesajı sil", auth: "admin", path: idPath("Mesaj"), ok: noContent }],
  ["get", "/admin/newsletter", { tag: "Admin: əlaqə", summary: "Bülleten abunəçiləri", auth: "admin", query: adminNewsletterQuerySchema, ok: ok({ allOf: [ref("Page"), obj({ activeCount: int, items: arrayOf({ type: "object" }) })] }) }],
  ["post", "/admin/gift-cards", { tag: "Admin: hədiyyə kartları", summary: "Hədiyyə kartı yarat", example: { amount: 50 }, description: "16 rəqəmli nömrə kriptoqrafik təsadüfi yaradılır.", auth: "admin", body: createGiftCardSchema, ok: created({ type: "object" }) }],
  ["get", "/admin/gift-cards", { tag: "Admin: hədiyyə kartları", summary: "Hədiyyə kartları", auth: "admin", query: paginationSchema, ok: ok({ allOf: [ref("Page"), obj({ items: arrayOf({ type: "object" }) })] }) }],
  ["patch", "/admin/gift-cards/{id}", { tag: "Admin: hədiyyə kartları", summary: "Kartı dəyiş / söndür", auth: "admin", path: idPath("Kart"), body: updateGiftCardSchema, ok: ok({ type: "object" }) }],

  // Admin: mağazalar, tədbirlər
  ["post", "/admin/stores", { tag: "Admin: mağazalar və tədbirlər", summary: "Mağaza yarat", example: { name: "Yeni filial", address: "Nizami küç. 1, Bakı", lat: 40.4, lng: 49.8, phone: "+994 12 310 00 07", hours: "B.e.–Şən: 09:00–21:00" }, auth: "admin", body: createStoreSchema, ok: created(ref("Store")), errors: { 409: "STORE_NAME_TAKEN" } }],
  ["patch", "/admin/stores/{id}", { tag: "Admin: mağazalar və tədbirlər", summary: "Mağazanı dəyiş", auth: "admin", path: idPath("Mağaza"), body: updateStoreSchema, ok: ok(ref("Store")), errors: { 409: "STORE_NAME_TAKEN" } }],
  ["delete", "/admin/stores/{id}", { tag: "Admin: mağazalar və tədbirlər", summary: "Mağazanı sil", description: "Mağazanın tədbirləri də silinir.", auth: "admin", path: idPath("Mağaza"), ok: noContent }],
  ["post", "/admin/events", { tag: "Admin: mağazalar və tədbirlər", summary: "Tədbir yarat", example: { storeId: 1, title: "Müəllif imza günü", type: "AUTHOR", locationType: "IN_STORE", date: "2027-01-15", time: "14:00" }, auth: "admin", body: createEventSchema, ok: created(ref("StoreEvent")) }],
  ["patch", "/admin/events/{id}", { tag: "Admin: mağazalar və tədbirlər", summary: "Tədbiri dəyiş", auth: "admin", path: idPath("Tədbir"), body: updateEventSchema, ok: ok(ref("StoreEvent")) }],
  ["delete", "/admin/events/{id}", { tag: "Admin: mağazalar və tədbirlər", summary: "Tədbiri sil", auth: "admin", path: idPath("Tədbir"), ok: noContent }],

  // Admin: statistika
  ["get", "/admin/stats/overview", { tag: "Admin: statistika", summary: "Ümumi göstəricilər", description: "`revenue.grossCents` = ləğv edilməmiş sifarişlərin cəmi, `deliveredCents` = yalnız çatdırılmışlar.", auth: "admin", ok: ok({ type: "object" }) }],
  ["get", "/admin/stats/sales", { tag: "Admin: statistika", summary: "Gündəlik satış", description: "Satışı olmayan günlər də 0 ilə gəlir. Günlər Bakı vaxtı ilədir.", auth: "admin", query: salesQuerySchema, ok: ok({ type: "object" }) }],
  ["get", "/admin/stats/top-books", { tag: "Admin: statistika", summary: "Ən çox satılan kitablar", auth: "admin", query: topBooksQuerySchema, ok: ok({ type: "object" }) }],
  ["get", "/admin/stats/low-stock", { tag: "Admin: statistika", summary: "Stoku azalan kitablar", auth: "admin", query: lowStockQuerySchema, ok: ok({ type: "object" }) }],
];

const paths: Record<string, Record<string, unknown>> = {};
for (const [method, p, op] of operations) {
  (paths[p] ??= {})[method] = build(method, p, op);
}

export const OPERATION_KEYS = operations.map(([method, p]) => `${method.toUpperCase()} ${p}`);

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Book & Store API",
    version: "1.0.0",
    description:
      "Onlayn kitab mağazasının backend-i.\n\n" +
      "**Giriş:** `POST /auth/login` ilə token al, sağ yuxarıdakı **Authorize** düyməsinə yapışdır (yalnız tokenin özü, `Bearer` yazmadan).\n\n" +
      "**Pul:** bütün məbləğlər qəpiklə (`…Cents`, integer) və AZN ilə (sahənin adında Cents yoxdur) qaytarılır. Admin kitab yaradanda qiyməti AZN ilə göndərir.\n\n" +
      "**Xətalar:** hamısı eyni formadadır: `{ \"error\": { \"code\", \"message\", \"requestId\", \"details?\" } }`.",
  },
  servers: [{ url: "/" }],
  tags: [...new Set(operations.map(([, , op]) => op.tag))].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas,
  },
};