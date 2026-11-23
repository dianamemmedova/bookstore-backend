// İstifadə (PowerShell, server işləyərkən başqa pəncərədə):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; npx tsx scripts/smoke-orders.ts
// Admin hesabı ilə test kitabları/promo yaradır, adi test istifadəçilərlə sifariş axınını yoxlayır.
// Sifariş olan kitab/istifadəçi API ilə silinə bilmir (Restrict), ona görə təmizliyi bazaya birbaşa qoşulub edir.
import "dotenv/config";
import bcrypt from "bcryptjs";

// Prisma-nın hər SQL sorğusunu çap etməsini söndürürük ki, nəticə oxunaqlı olsun (config-dən əvvəl təyin olunmalıdır)
process.env.NODE_ENV = "test";
const { prisma } = await import("../src/lib/prisma");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL və ADMIN_PASSWORD yaz (faylın başındakı nümunəyə bax).");
  process.exit(1);
}

let passed = 0;
let failed = 0;

type Res = { status: number; body: any };
async function call(method: string, path: string, opts: { token?: string; json?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: opts.json ? JSON.stringify(opts.json) : undefined });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

// Bakı vaxtı ilə bu gündən n gün sonra, YYYY-MM-DD
function dayPlus(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const delivery = (extra: Record<string, unknown> = {}) => ({
  payMethod: "CASH",
  fullName: "Test Tester",
  phone: "+994501234567",
  city: "Bakı",
  street: "Nizami küç.",
  building: "10",
  apartment: "5",
  deliveryDate: dayPlus(6),
  ...extra,
});

const stockOf = async (id: number) => (await prisma.book.findUniqueOrThrow({ where: { id } })).stock;

async function main() {
  const stamp = Date.now();
  const login = await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  // İstifadəçiləri birbaşa bazada yaradırıq (qeydiyyat endpoint-inin saatlıq limiti test üçün maneə olmasın), sonra API ilə giriş edirik
  const passwordHash = await bcrypt.hash("12345678", 4);
  const register = async (n: string) => {
    const email = `ord${n}${stamp}@test.az`;
    await prisma.user.create({ data: { email, firstName: "Ord", lastName: n, passwordHash } });
    return (await call("POST", "/auth/login", { json: { email, password: "12345678" } })).body?.token as string;
  };
  const u1 = await register("1");
  const u2 = await register("2");
  const u3 = await register("3");
  const u4 = await register("4");

  const mk = async (title: string, price: number, stock: number | null) =>
    (await call("POST", "/admin/books", { token: admin, json: { title: `[TEST] ${title} ${stamp}`, author: "Test", price, stock } })).body.id as number;
  const A = await mk("A", 10, 5);
  const B = await mk("B", 25.5, null);
  const C = await mk("C", 30, 2);
  const D = await mk("D", 10, 1);
  const code = `ORD${stamp}`;
  const promoRes = await call("POST", "/admin/promos", { token: admin, json: { code, discountPercent: 20, description: "test", expiresAt: null } });
  const promoId = promoRes.body?.id as number;
  if (!A || !B || !C || !D || !promoId) return console.log("Test məlumatları yaranmadı, dayanıram.");

  const put = (token: string, id: number, quantity: number) => call("PUT", `/cart/items/${id}`, { token, json: { quantity } });

  try {
    console.log("Giriş tələbi");
    check("tokensiz POST /orders 401", (await call("POST", "/orders", { json: delivery() })).status === 401);
    check("tokensiz GET /orders 401", (await call("GET", "/orders")).status === 401);
    check("adi istifadəçi /admin/orders 403", (await call("GET", "/admin/orders", { token: u1 })).status === 403);

    console.log("Yoxlamalar (səbət boşdur)");
    let r = await call("POST", "/orders", { token: u1, json: delivery() });
    check("boş səbət 400 CART_EMPTY", r.status === 400 && r.body?.error?.code === "CART_EMPTY", JSON.stringify(r.body));
    await put(u1, A, 1);
    check("kart nömrəsi göndərmək → 400", (await call("POST", "/orders", { token: u1, json: delivery({ payMethod: "CARD", cardNumber: "4111111111111111" }) })).status === 400);
    check("cvv göndərmək → 400", (await call("POST", "/orders", { token: u1, json: delivery({ cvv: "123" }) })).status === 400);
    check("məbləğ göndərmək (totalCents) → 400", (await call("POST", "/orders", { token: u1, json: delivery({ totalCents: 1 }) })).status === 400);
    check("payMethod BANK → 400", (await call("POST", "/orders", { token: u1, json: delivery({ payMethod: "BANK" }) })).status === 400);
    check("payMethod kiçik hərf 'card' → 400", (await call("POST", "/orders", { token: u1, json: delivery({ payMethod: "card" }) })).status === 400);
    check("çatdırılma tarixi 3 gün sonra → 400", (await call("POST", "/orders", { token: u1, json: delivery({ deliveryDate: dayPlus(3) }) })).status === 400);
    check("çatdırılma tarixi keçmişdə → 400", (await call("POST", "/orders", { token: u1, json: delivery({ deliveryDate: "2020-01-01" }) })).status === 400);
    check("tarix formatı yanlış → 400", (await call("POST", "/orders", { token: u1, json: delivery({ deliveryDate: "26.11.2026" }) })).status === 400);
    await put(u4, B, 1);
    r = await call("POST", "/orders", { token: u4, json: delivery({ deliveryDate: dayPlus(5) }) });
    check("tarix düz 5 gün sonra qəbul olunur (sərhəd)", r.status === 201, JSON.stringify(r.body));
    check("telefon yanlış → 400", (await call("POST", "/orders", { token: u1, json: delivery({ phone: "abc" }) })).status === 400);
    check("ad çatışmır → 400", (await call("POST", "/orders", { token: u1, json: { ...delivery(), fullName: undefined } })).status === 400);
    check("olmayan promo → 400 PROMO_INVALID", (await call("POST", "/orders", { token: u1, json: delivery({ promoCode: "YOXDUR" }) })).body?.error?.code === "PROMO_INVALID");
    check("xətalı cəhdlərdən sonra səbət və stok toxunulmazdır", (await call("GET", "/cart", { token: u1 })).body?.itemCount === 1 && (await stockOf(A)) === 5);

    console.log("Sifariş 1: promosuz, çatdırılma haqqı 5 AZN");
    await put(u1, A, 2); // 20 AZN
    await put(u1, B, 1); // 25.5 AZN → 45.5
    r = await call("POST", "/orders", { token: u1, json: delivery({ payMethod: "CARD" }) });
    const o1 = r.body;
    check("201", r.status === 201, JSON.stringify(r.body));
    check("status PENDING, payMethod CARD", o1?.status === "PENDING" && o1?.payMethod === "CARD");
    check("subtotal 4550, endirim 0, çatdırılma 500, cəmi 5050 qəpik", o1?.subtotalCents === 4550 && o1?.discountCents === 0 && o1?.deliveryFeeCents === 500 && o1?.totalCents === 5050);
    check("AZN sahələri: finalTotal 50.5", o1?.finalTotal === 50.5 && o1?.deliveryFee === 5);
    check("2 sətir, snapshot ad/qiymət/say", o1?.items?.length === 2 && o1.items.some((i: any) => i.bookId === A && i.quantity === 2 && i.unitPriceCents === 1000 && i.title.includes("[TEST] A")));
    check("delivery bloku və deliveryDate", o1?.delivery?.fullName === "Test Tester" && o1?.delivery?.city === "Bakı" && o1?.deliveryDate === dayPlus(6));
    check("stok azaldı: A 5→3, B limitsiz qalır", (await stockOf(A)) === 3 && (await stockOf(B)) === null);
    check("səbət təmizləndi", (await call("GET", "/cart", { token: u1 })).body?.itemCount === 0);

    console.log("Snapshot: admin qiyməti dəyişəndən sonra köhnə sifariş dəyişmir");
    await call("PATCH", `/admin/books/${A}`, { token: admin, json: { price: 99, title: `[TEST] A yeni ${stamp}` } });
    r = await call("GET", `/orders/${o1.id}`, { token: u1 });
    check("sifarişdə köhnə qiymət və ad qalır", r.status === 200 && r.body?.items?.find((i: any) => i.bookId === A)?.unitPriceCents === 1000 && r.body?.totalCents === 5050 && r.body?.items?.find((i: any) => i.bookId === A)?.title.endsWith(`A ${stamp}`));
    await call("PATCH", `/admin/books/${A}`, { token: admin, json: { price: 10, title: `[TEST] A ${stamp}` } });

    console.log("Sifariş 2: promo 20% + pulsuz çatdırılma");
    await put(u1, C, 2); // 60 AZN
    r = await call("POST", "/orders", { token: u1, json: delivery({ promoCode: code.toLowerCase() }) });
    const o2 = r.body;
    check("201", r.status === 201, JSON.stringify(r.body));
    check("endirim 1200, endirimdən sonra 4800 < 6000 → çatdırılma 500, cəmi 5300", o2?.subtotalCents === 6000 && o2?.discountCents === 1200 && o2?.deliveryFeeCents === 500 && o2?.totalCents === 5300, JSON.stringify(o2));
    check("promoCode və discountPercent saxlanıb", o2?.promoCode === code && o2?.discountPercent === 20);
    r = await call("POST", "/promo/validate", { token: u1, json: { code } });
    check("promo bu istifadəçi üçün artıq işlənib → 409", r.status === 409 && r.body?.error?.code === "PROMO_ALREADY_USED");
    await put(u1, B, 3); // 76.5 AZN, promosuz
    r = await call("POST", "/orders", { token: u1, json: delivery() });
    check("76.5 AZN ≥ 60 → çatdırılma 0, cəmi 7650", r.status === 201 && r.body?.deliveryFeeCents === 0 && r.body?.totalCents === 7650, JSON.stringify(r.body));
    const o3 = r.body;
    await put(u1, B, 3);
    r = await call("POST", "/orders", { token: u1, json: delivery({ promoCode: code }) });
    check("eyni promo ikinci dəfə → 409 PROMO_ALREADY_USED", r.status === 409 && r.body?.error?.code === "PROMO_ALREADY_USED");
    check("uğursuz sifarişdən sonra səbət saxlanılıb", (await call("GET", "/cart", { token: u1 })).body?.itemCount === 3);
    await call("DELETE", "/cart", { token: u1 });

    console.log("Stok çatmayanda (rollback)");
    await put(u2, A, 3); // stok 3
    await prisma.book.update({ where: { id: A }, data: { stock: 1 } }); // admin stoku azaldır
    r = await call("POST", "/orders", { token: u2, json: delivery({ promoCode: code }) });
    check("409 INSUFFICIENT_STOCK, available 1", r.status === 409 && r.body?.error?.code === "INSUFFICIENT_STOCK" && r.body?.error?.details?.available === 1, JSON.stringify(r.body));
    check("stok dəyişməyib (1)", (await stockOf(A)) === 1);
    check("səbət yerindədir", (await call("GET", "/cart", { token: u2 })).body?.itemCount === 3);
    check("promo istifadə edilmiş sayılmır (rollback)", (await call("POST", "/promo/validate", { token: u2, json: { code } })).status === 200);
    check("sifariş yaranmayıb", (await call("GET", "/orders", { token: u2 })).body?.items?.length === 0);
    await prisma.book.update({ where: { id: A }, data: { stock: 3 } });
    await call("DELETE", "/cart", { token: u2 });

    console.log("Sifarişlərə baxmaq");
    r = await call("GET", "/orders", { token: u1 });
    check("u1 3 sifariş görür, yenisi birinci", r.status === 200 && r.body?.items?.length === 3 && r.body.items[0].id === o3.id);
    check("u2 başqasının sifarişini görmür: GET → 404", (await call("GET", `/orders/${o1.id}`, { token: u2 })).status === 404);
    check("u2 başqasının sifarişini ləğv edə bilmir → 404", (await call("POST", `/orders/${o1.id}/cancel`, { token: u2 })).status === 404);
    check("olmayan sifariş → 404", (await call("GET", "/orders/99999999", { token: u1 })).status === 404);
    check("id formatı yanlış → 400", (await call("GET", "/orders/abc", { token: u1 })).status === 400);

    console.log("Ləğv: stok qayıdır, promo azad olur");
    const stockBefore = await stockOf(C);
    r = await call("POST", `/orders/${o2.id}/cancel`, { token: u1 });
    check("ləğv 200, status CANCELLED, cancelledAt var", r.status === 200 && r.body?.status === "CANCELLED" && !!r.body?.cancelledAt);
    check("C stoku 2 ədəd qayıtdı", (await stockOf(C)) === stockBefore! + 2);
    check("promo yenidən istifadə oluna bilər", (await call("POST", "/promo/validate", { token: u1, json: { code } })).status === 200);
    r = await call("POST", `/orders/${o2.id}/cancel`, { token: u1 });
    check("ikinci ləğv → 409 ORDER_NOT_CANCELLABLE (stok ikiqat qayıtmır)", r.status === 409 && r.body?.error?.code === "ORDER_NOT_CANCELLABLE" && (await stockOf(C)) === stockBefore! + 2);

    console.log("Admin: siyahı və status");
    r = await call("GET", "/admin/orders?status=PENDING&limit=100", { token: admin });
    check("admin PENDING siyahısı, user məlumatı ilə", r.status === 200 && r.body?.items?.some((o: any) => o.id === o1.id && o.user?.email?.startsWith("ord1")));
    check("status=CANCELLED filtri o2-ni göstərir", (await call("GET", "/admin/orders?status=CANCELLED&limit=100", { token: admin })).body?.items?.some((o: any) => o.id === o2.id));
    check("yanlış status filtri → 400", (await call("GET", "/admin/orders?status=XYZ", { token: admin })).status === 400);
    check("admin istənilən sifarişə baxır", (await call("GET", `/admin/orders/${o1.id}`, { token: admin })).status === 200);
    r = await call("PATCH", `/admin/orders/${o1.id}/status`, { token: admin, json: { status: "DELIVERED" } });
    check("PENDING → DELIVERED olmaz: 409 INVALID_STATUS_TRANSITION", r.status === 409 && r.body?.error?.code === "INVALID_STATUS_TRANSITION");
    check("status PENDING göndərmək → 400", (await call("PATCH", `/admin/orders/${o1.id}/status`, { token: admin, json: { status: "PENDING" } })).status === 400);
    check("adi istifadəçi status dəyişə bilmir → 403", (await call("PATCH", `/admin/orders/${o1.id}/status`, { token: u1, json: { status: "CONFIRMED" } })).status === 403);
    r = await call("PATCH", `/admin/orders/${o1.id}/status`, { token: admin, json: { status: "CONFIRMED" } });
    check("PENDING → CONFIRMED 200", r.status === 200 && r.body?.status === "CONFIRMED");
    check("istifadəçi öz sifarişində yeni statusu görür", (await call("GET", `/orders/${o1.id}`, { token: u1 })).body?.status === "CONFIRMED");
    r = await call("PATCH", `/admin/orders/${o1.id}/status`, { token: admin, json: { status: "DELIVERED" } });
    check("CONFIRMED → DELIVERED 200", r.status === 200 && r.body?.status === "DELIVERED");
    check("DELIVERED sifarişi istifadəçi ləğv edə bilmir → 409", (await call("POST", `/orders/${o1.id}/cancel`, { token: u1 })).status === 409);
    check("DELIVERED sifarişi admin də ləğv edə bilmir → 409", (await call("PATCH", `/admin/orders/${o1.id}/status`, { token: admin, json: { status: "CANCELLED" } })).status === 409);
    check("olmayan sifariş statusu → 404", (await call("PATCH", "/admin/orders/99999999/status", { token: admin, json: { status: "CONFIRMED" } })).status === 404);

    console.log("Admin ləğvi: stok və promo qayıdır");
    await put(u3, D, 1); // stok 1
    r = await call("POST", "/orders", { token: u3, json: delivery({ promoCode: code }) });
    const o4 = r.body;
    check("u3 sifarişi yaranır, D stoku 0", r.status === 201 && (await stockOf(D)) === 0, JSON.stringify(r.body));
    r = await call("PATCH", `/admin/orders/${o4.id}/status`, { token: admin, json: { status: "CANCELLED" } });
    check("admin ləğv edir: 200 CANCELLED", r.status === 200 && r.body?.status === "CANCELLED");
    check("D stoku 1-ə qayıdır", (await stockOf(D)) === 1);
    check("u3 üçün promo azad olub", (await call("POST", "/promo/validate", { token: u3, json: { code } })).status === 200);

    console.log("Silmə qoruması");
    r = await call("DELETE", `/admin/books/${B}`, { token: admin });
    check("sifarişdə olan kitabı silmək → 409 RELATION_CONFLICT", r.status === 409 && r.body?.error?.code === "RELATION_CONFLICT", JSON.stringify(r.body));
    r = await call("DELETE", `/admin/promos/${promoId}`, { token: admin });
    check("ləğvlərdən sonra promo istifadəsiz qalıb, silinə bilir (204)", r.status === 204, JSON.stringify(r.body));

    console.log("Paralel: stok 1, iki istifadəçi eyni anda");
    await prisma.book.update({ where: { id: D }, data: { stock: 1 } });
    await call("DELETE", "/cart", { token: u3 });
    await put(u3, D, 1);
    await put(u4, D, 1);
    const [x, y] = await Promise.all([
      call("POST", "/orders", { token: u3, json: delivery() }),
      call("POST", "/orders", { token: u4, json: delivery() }),
    ]);
    const statuses = [x.status, y.status].sort();
    check("biri 201, biri 409", statuses[0] === 201 && statuses[1] === 409, JSON.stringify(statuses));
    check("stok mənfiyə düşmədi (0)", (await stockOf(D)) === 0);

    console.log("Paralel: eyni sifarişi 5 dəfə ləğv et");
    await put(u2, C, 1);
    const o5 = (await call("POST", "/orders", { token: u2, json: delivery() })).body;
    const c0 = await stockOf(C);
    const cancels = await Promise.all(Array.from({ length: 5 }, () => call("POST", `/orders/${o5.id}/cancel`, { token: u2 })));
    check("yalnız 1 uğurlu ləğv", cancels.filter((c) => c.status === 200).length === 1);
    check("stok yalnız 1 dəfə qayıdıb", (await stockOf(C)) === c0! + 1);
  } finally {
    // Təmizlik: sifarişlər → kitablar → promo → istifadəçilər (API silə bilmir, Restrict)
    const users = await prisma.user.findMany({ where: { email: { startsWith: "ord", endsWith: `${stamp}@test.az` } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.book.deleteMany({ where: { id: { in: [A, B, C, D] } } });
    await prisma.promoRedemption.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.promoCode.deleteMany({ where: { code } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  await prisma.$disconnect();
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (error) => {
  console.error("Skript xəta ilə dayandı:", error);
  await prisma.$disconnect();
  process.exit(1);
});