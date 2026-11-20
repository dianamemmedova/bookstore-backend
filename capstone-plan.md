# Capstone layihə planı

**Ad, soyad:** Diana Memmedova
**Layihənin adı:** Book & Store API
**GitHub repo linki:** https://github.com/dianamemmedova/bookstore-backend

---

## 1. Layihə nə edir? (2–3 cümlə)

Onlayn kitab mağazası üçün backend (mövcud React frontum üçün). İstifadəçi qeydiyyatdan keçir, kitabları səbətə və wishlist siyahılarına əlavə edir, promo kodla endirim alıb sifariş verir, kitablara rəy yazır. Admin kitabları, promo kodları və sifarişlərin statusunu idarə edir.

---

## 2. Rollar

| Rol | Nə edə bilər? |
|---|---|
| USER | Qeydiyyat və giriş. Öz səbətini, wishlist siyahılarını və sifarişlərini idarə edir. Promo kod yoxlayır. Sifariş verir və təsdiqlənmiş sifarişi ləğv edir. Rəy yazır və rəyləri faydalı/faydasız səsləyir. |
| ADMIN | USER-in hər şeyi. Əlavə olaraq kitab yaradır, yeniləyir, silir (üz qabığı yükləyir). Promo kodları idarə edir. Sifariş statusunu dəyişir. Statistikaya və əlaqə mesajlarına baxır. |

---

## 3. Modellər və sahələr (ən azı 4 model)

| Model | Sahələr (ad: tip) | Qeyd |
|---|---|---|
| User | id: Int, email: String (unique), firstName, lastName, passwordHash, role: Role, marketingOptIn: Boolean, createdAt | parol yalnız hash kimi |
| Book | id: Int, externalId: String (unique, Open Library id), title, author, coverUrl?, priceCents: Int, stock: Int? (null = limitsiz), createdAt | Open Library kitabı ilk dəfə lazım olanda bazaya yazılır; admin qiyməti və stoku dəyişə bilər |
| CartItem | id, userId, bookId, quantity: Int | @@unique([userId, bookId]) |
| WishlistList | id, userId, name, description, privacy: PUBLIC/PRIVATE | |
| WishlistItem | id, listId, bookId, addedAt | @@unique([listId, bookId]) |
| PromoCode | id, code (unique), discountPercent: Int, label, active: Boolean, expiresAt? | |
| PromoRedemption | id, userId, promoCodeId, orderId, createdAt | @@unique([userId, promoCodeId]) |
| Order | id, userId, status: PENDING/CONFIRMED/DELIVERED/CANCELLED, subtotalCents, discountCents, deliveryFeeCents, totalCents, promoCode?, payMethod: CARD/CASH, deliveryDate, çatdırılma ünvanı sahələri, createdAt | məbləğlər qəpiklə, tam ədəd |
| OrderItem | id, orderId, bookId, title, author, coverUrl, unitPriceCents, quantity | sifariş anındakı snapshot |
| Review | id, userId, bookId, rating: Int (1–5), title, body, recommended: Boolean, createdAt | @@unique([userId, bookId]) |
| ReviewVote | id, reviewId, userId, helpful: Boolean | @@unique([reviewId, userId]) |
| ContactMessage | id, name, email, subject, message, createdAt | |

---

## 4. Əlaqələr

| Əlaqə | Növ | `onDelete` (Cascade / Restrict) |
|---|---|---|
| User → Order | 1–çox | Restrict (sifarişi olan istifadəçi silinmir) |
| Order → OrderItem | 1–çox | Cascade |
| Book → OrderItem | 1–çox | Restrict (satılmış kitab silinmir) |
| User → WishlistList | 1–çox | Cascade |
| WishlistList → WishlistItem | 1–çox | Cascade |
| User ↔ Book (CartItem vasitəsilə, `quantity` ilə) | çox–çox | Cascade |
| WishlistList ↔ Book (WishlistItem vasitəsilə) | çox–çox | Cascade |
| User ↔ PromoCode (PromoRedemption vasitəsilə) | çox–çox | Restrict |
| User ↔ Book (Review vasitəsilə) | çox–çox | Cascade |
| Review → ReviewVote | 1–çox | Cascade |

ER sxemi: `docs/er.png` (çəkib repo-ya qoyacağam).

---

## 5. Endpoint-lər

| Method | Path | Kim? (hamı / USER / sahibi / ADMIN) | Nə edir? |
|---|---|---|---|
| POST | /auth/register | hamı | Qeydiyyat, token qaytarır |
| POST | /auth/login | hamı | Giriş, token qaytarır |
| GET | /me | USER | Öz profilim |
| GET | /books | hamı | Kitab siyahısı (axtarış, janr, qiymət filteri, sıralama, pagination) |
| GET | /books/:id | hamı | Kitab detalı |
| POST | /books | ADMIN | Kitab yarat |
| PATCH | /books/:id | ADMIN | Kitabı yenilə |
| DELETE | /books/:id | ADMIN | Kitabı sil |
| POST | /books/:id/cover | ADMIN | Üz qabığı yüklə |
| GET | /cart | USER | Səbətim |
| PUT | /cart/items/:bookId | USER | Miqdarı təyin et (əlavə et/yenilə) |
| DELETE | /cart/items/:bookId | USER | Səbətdən çıxar |
| POST | /cart/merge | USER | Girişdən sonra qonaq səbətini birləşdir |
| GET | /wishlists | USER | Siyahılarım |
| POST | /wishlists | USER | Siyahı yarat |
| PATCH | /wishlists/:id | sahibi | Siyahını yenilə |
| DELETE | /wishlists/:id | sahibi | Siyahını sil |
| POST | /wishlists/:id/items | sahibi | Kitab əlavə et |
| DELETE | /wishlists/:id/items/:bookId | sahibi | Kitabı çıxar |
| GET | /wishlists/public/:id | hamı | Açıq siyahıya bax |
| POST | /promo/validate | USER | Promo kodu yoxla |
| POST/GET/PATCH | /admin/promos | ADMIN | Promo idarəsi |
| POST | /orders | USER | Checkout |
| GET | /orders | USER | Sifarişlərim (pagination, status filteri) |
| GET | /orders/:id | sahibi | Sifariş detalı |
| POST | /orders/:id/cancel | sahibi | Sifarişi ləğv et |
| PATCH | /admin/orders/:id/status | ADMIN | Statusu dəyiş |
| GET | /books/:id/reviews | hamı | Rəylər (sıralama, ulduz filteri) |
| POST | /books/:id/reviews | USER | Rəy yaz |
| POST | /reviews/:id/vote | USER | Faydalı / faydasız |
| POST | /contact | hamı | Əlaqə mesajı göndər |
| GET | /admin/stats | ADMIN | Satış statistikası |

Siyahı endpoint-ləri (`/books`, `/orders`, `/books/:id/reviews`) pagination + filter ilə olacaq.

---

## 6. Biznes qaydaları (ən vacib hissə)

1. Eyni email ilə ikinci hesab yaradıla bilməz (bazada `@unique`) → 409 `EMAIL_TAKEN`.
2. Qiyməti həmişə server hesablayır. Müştərinin göndərdiyi qiymət nəzərə alınmır. Çatdırılma 5 ₼-dir, endirimdən sonra məbləğ 60 ₼ və yuxarıdırsa pulsuzdur.
3. Checkout bir tranzaksiyadadır. Stoku olan kitabın stoku şərtli azaldılır (`stock >= quantity`). Çatmırsa heç nə yazılmır → 409 `OUT_OF_STOCK`. Eyni anda iki sifarişlə stok mənfiyə düşə bilməz.
4. Hər istifadəçi hər promo koddan yalnız bir dəfə istifadə edir (`@@unique([userId, promoCodeId])`) → 409. Vaxtı bitmiş və ya aktiv olmayan kod → 400.
5. Başqasının sifarişi, səbəti və ya wishlist siyahısı üzərində əməliyyat → 404 (varlığı belə bildirilmir).
6. Yalnız `CONFIRMED` sifariş ləğv edilə bilər, əks halda → 409. Ləğv zamanı stok geri qaytarılır.
7. Çatdırılma tarixi bu gündən ən azı 5 gün sonra olmalıdır → 400.
8. Kart nömrəsi, CVV və s. heç vaxt qəbul edilmir və saxlanmır. Sifariş sxemi bilinməyən sahələri rədd edir (`strictObject`). Yalnız `payMethod` (CARD/CASH) saxlanır → 400.
9. Bir istifadəçi eyni kitaba yalnız bir rəy yaza bilər (`@@unique`) → 409. Eyni rəyə bir istifadəçi bir səs verə bilər.
10. Admin əməliyyatları (kitab CRUD, promo, status, statistika) yalnız ADMIN-dir. Adi istifadəçi → 403.

---

## 7. Riskli yerlər

- Race condition: eyni anda iki checkout (stok), eyni istifadəçinin eyni promo koddan paralel istifadəsi. Həll: tranzaksiya, şərtli `UPDATE`, istifadəçi sətri üzərində `FOR UPDATE`, unikal constraint.
- Pul hesabı: float yox, qəpiklə tam ədəd. Hesab yalnız backdə.
- Fayl yükləmə (üz qabığı): ölçü limiti, MIME tipi və faylın real formatının (magic bytes) yoxlanması, təsadüfi fayl adı.
- Brute force: login və qeydiyyat üçün rate limit.
- Kart məlumatı: frontda formada var, backə getməməlidir (qayda 8).
- Open Library asılılığı: kitab məlumatı və id-ləri xarici API-dəndir, bazada keş saxlanılır.

---

## 8. Nə vaxt nə edəcəm?

| Mərhələ | Nə hazır olacaq | Tarix |
|---|---|---|
| 1 | Repo, Prisma schema, migration, auth, `/me`, rollar | |  10.11.2026
| 2 | Kataloq, səbət, wishlist (Zod + error handling ilə) | |   20.11.2026
| 3 | Promo, sifariş (checkout, stok, ləğv), rəylər, biznes qaydaları + testlər | |  25.11.2026
| 4 | OpenAPI sənədi, Docker, CI, frontun qoşulması, README | |  30.11.2026

---

## 9. AI-a review etdir (Claude)

Planı claude.ai-a yapışdırıb prompt-u işlədəcəm.

AI-ın tapdıqları:

1.
2.
3.

Hansı ilə razı deyiləm və niyə:

---

## 10. CLAUDE.md

- [x] CLAUDE.md yazıldı və yoxlandı
- [x] Biznes qaydaları planla eynidir