// İstifadə (PowerShell, server işləyərkən başqa pəncərədə):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; npx tsx scripts/smoke-extras.ts
// Əlaqə formu, xəbər bülleteni və hədiyyə kartı balansını yoxlayır. Yaratdığı hər şeyi sonda silir.
// Qeyd: bu endpoint-lərdə spam limiti var (əlaqə 10/saat). Skript hər qaçışda 2 uğurlu mesaj göndərir.
import "dotenv/config";
import bcrypt from "bcryptjs";

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

async function main() {
  const stamp = Date.now();
  const admin = (await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })).body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  const userEmail = `ext${stamp}@test.az`;
  const user = await prisma.user.create({ data: { email: userEmail, firstName: "Ext", lastName: "Tester", passwordHash: await bcrypt.hash("12345678", 4) } });
  const userToken = (await call("POST", "/auth/login", { json: { email: userEmail, password: "12345678" } })).body?.token as string;

  const subEmail = `sub${stamp}@test.az`;
  const createdCardIds: number[] = [];

  try {
    console.log("Əlaqə formu");
    const valid = { name: "Test Adı", email: `Contact${stamp}@Test.az`, subject: "Sifariş haqqında", message: "Sifarişim hələ gəlib çatmayıb, kömək edin." };
    check("boş body → 400", (await call("POST", "/contact", { json: {} })).status === 400);
    check("qısa mətn → 400", (await call("POST", "/contact", { json: { ...valid, message: "qısa" } })).status === 400);
    check("email yanlış → 400", (await call("POST", "/contact", { json: { ...valid, email: "abc" } })).status === 400);
    check("mövzu siyahıda yoxdur → 400", (await call("POST", "/contact", { json: { ...valid, subject: "Reklam" } })).status === 400);
    check("artıq sahə (isRead) → 400", (await call("POST", "/contact", { json: { ...valid, isRead: true } })).status === 400);
    let r = await call("POST", "/contact", { json: valid });
    check("qonaq göndərir: 201", r.status === 201, JSON.stringify(r.body));
    r = await call("POST", "/contact", { token: userToken, json: { ...valid, email: userEmail } });
    check("giriş edən göndərir: 201", r.status === 201);
    const rows = await prisma.contactMessage.findMany({ where: { OR: [{ email: userEmail }, { email: `contact${stamp}@test.az` }] }, orderBy: { id: "asc" } });
    check("email kiçik hərfə çevrilib, qonaq mesajı userId=null", rows[0]?.email === `contact${stamp}@test.az` && rows[0]?.userId === null);
    check("giriş edənin mesajı istifadəçiyə bağlanıb", rows[1]?.userId === user.id);
    check("yanlış token ilə göndərmək → 401 (qonaq kimi keçmir)", (await call("POST", "/contact", { token: "yalan", json: valid })).status === 401);

    console.log("Əlaqə: admin");
    check("adi istifadəçi admin siyahısını görmür → 403", (await call("GET", "/admin/contact-messages", { token: userToken })).status === 403);
    r = await call("GET", "/admin/contact-messages?unread=true&limit=100", { token: admin });
    const mine = r.body?.items?.find((m: any) => m.id === rows[0].id);
    check("admin oxunmamışları görür, unreadCount var", r.status === 200 && !!mine && typeof r.body?.unreadCount === "number");
    r = await call("PATCH", `/admin/contact-messages/${rows[0].id}`, { token: admin, json: { isRead: true } });
    check("oxunmuş kimi işarələyir", r.status === 200 && r.body?.isRead === true);
    check("oxunmamış siyahısından çıxır", !(await call("GET", "/admin/contact-messages?unread=true&limit=100", { token: admin })).body?.items?.some((m: any) => m.id === rows[0].id));
    check("olmayan mesaj → 404", (await call("PATCH", "/admin/contact-messages/99999999", { token: admin, json: { isRead: true } })).status === 404);
    check("unread=abc → 400", (await call("GET", "/admin/contact-messages?unread=abc", { token: admin })).status === 400);
    check("mesajı silir → 204", (await call("DELETE", `/admin/contact-messages/${rows[0].id}`, { token: admin })).status === 204);
    check("ikinci dəfə silmək → 404", (await call("DELETE", `/admin/contact-messages/${rows[0].id}`, { token: admin })).status === 404);

    console.log("Xəbər bülleteni");
    check("email yoxdur → 400", (await call("POST", "/newsletter/subscribe", { json: {} })).status === 400);
    check("email yanlış → 400", (await call("POST", "/newsletter/subscribe", { json: { email: "abc" } })).status === 400);
    r = await call("POST", "/newsletter/subscribe", { json: { email: subEmail.toUpperCase() } });
    check("abunə: 200", r.status === 200);
    const first = r.body;
    r = await call("POST", "/newsletter/subscribe", { json: { email: subEmail } });
    check("təkrar abunə də 200 və EYNİ cavab (email-in varlığı sızmır)", r.status === 200 && JSON.stringify(r.body) === JSON.stringify(first));
    check("bazada yalnız 1 sətir, kiçik hərflə", (await prisma.newsletterSubscriber.count({ where: { email: subEmail } })) === 1);
    r = await call("GET", "/admin/newsletter?limit=100", { token: admin });
    check("admin siyahısı: abunəçi var, unsubscribeToken göstərilmir", r.status === 200 && r.body?.items?.some((s: any) => s.email === subEmail) && !JSON.stringify(r.body).includes("unsubscribeToken"));
    check("adi istifadəçi → 403", (await call("GET", "/admin/newsletter", { token: userToken })).status === 403);
    check("yanlış token ilə çıxmaq → 404", (await call("POST", "/newsletter/unsubscribe", { json: { token: "yalan-token-yalan" } })).status === 404);
    const sub = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: subEmail } });
    check("düzgün token ilə çıxır: 200", (await call("POST", "/newsletter/unsubscribe", { json: { token: sub.unsubscribeToken } })).status === 200);
    check("isActive false, unsubscribedAt dolu", (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: subEmail } })).isActive === false);
    check("active=false filtri onu göstərir", (await call("GET", "/admin/newsletter?active=false&limit=100", { token: admin })).body?.items?.some((s: any) => s.email === subEmail));
    await call("POST", "/newsletter/subscribe", { json: { email: subEmail } });
    const again = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: subEmail } });
    check("yenidən abunə olanda aktivləşir, token dəyişmir", again.isActive === true && again.unsubscribedAt === null && again.unsubscribeToken === sub.unsubscribeToken);

    console.log("Hədiyyə kartı: admin");
    check("adi istifadəçi kart yarada bilmir → 403", (await call("POST", "/admin/gift-cards", { token: userToken, json: { amount: 50 } })).status === 403);
    check("amount 0 → 400", (await call("POST", "/admin/gift-cards", { token: admin, json: { amount: 0 } })).status === 400);
    check("amount 3 onluq → 400", (await call("POST", "/admin/gift-cards", { token: admin, json: { amount: 10.123 } })).status === 400);
    check("balans göndərmək (balanceCents) → 400", (await call("POST", "/admin/gift-cards", { token: admin, json: { amount: 10, balanceCents: 99999 } })).status === 400);
    r = await call("POST", "/admin/gift-cards", { token: admin, json: { amount: 150, note: `test ${stamp}` } });
    const card = r.body;
    if (card?.id) createdCardIds.push(card.id);
    check("201, kod 16 rəqəm, '4521' ilə başlayır", r.status === 201 && /^4521\d{12}$/.test(card?.code ?? ""), JSON.stringify(r.body));
    check("initialCents = balanceCents = 15000, balance 150", card?.initialCents === 15000 && card?.balanceCents === 15000 && card?.balance === 150);
    const expired = (await call("POST", "/admin/gift-cards", { token: admin, json: { amount: 20, expiresAt: "2020-01-01T00:00:00Z" } })).body;
    if (expired?.id) createdCardIds.push(expired.id);
    const off = (await call("POST", "/admin/gift-cards", { token: admin, json: { amount: 30 } })).body;
    if (off?.id) createdCardIds.push(off.id);
    check("söndürmək: 200", (await call("PATCH", `/admin/gift-cards/${off.id}`, { token: admin, json: { isActive: false } })).body?.isActive === false);
    check("kodlar bir-birindən fərqlidir", new Set([card.code, expired.code, off.code]).size === 3);
    check("admin siyahısı kartı göstərir", (await call("GET", "/admin/gift-cards?limit=100", { token: admin })).body?.items?.some((c: any) => c.id === card.id));

    console.log("Hədiyyə kartı: balans yoxlaması (açıq)");
    r = await call("POST", "/gift-cards/balance", { json: { cardNumber: card.code } });
    check("düzgün kart: 200, balance 150", r.status === 200 && r.body?.balance === 150 && r.body?.balanceCents === 15000);
    r = await call("POST", "/gift-cards/balance", { json: { cardNumber: `${card.code.slice(0, 4)} ${card.code.slice(4, 8)} ${card.code.slice(8, 12)} ${card.code.slice(12)}` } });
    check("boşluqlu format da qəbul olunur", r.status === 200 && r.body?.balance === 150);
    check("cavabda kart nömrəsi və id yoxdur", !JSON.stringify(r.body).includes(card.code) && !("id" in r.body));
    check("15 rəqəm → 400", (await call("POST", "/gift-cards/balance", { json: { cardNumber: "123456789012345" } })).status === 400);
    check("hərf → 400", (await call("POST", "/gift-cards/balance", { json: { cardNumber: "abcdabcdabcdabcd" } })).status === 400);
    const e1 = await call("POST", "/gift-cards/balance", { json: { cardNumber: "1234123412341234" } });
    check("olmayan kart → 404 GIFT_CARD_NOT_FOUND", e1.status === 404 && e1.body?.error?.code === "GIFT_CARD_NOT_FOUND");
    const e2 = await call("POST", "/gift-cards/balance", { json: { cardNumber: expired.code } });
    const e3 = await call("POST", "/gift-cards/balance", { json: { cardNumber: off.code } });
    check("müddəti bitmiş və söndürülmüş kart: eyni 404 (səbəb açıqlanmır)", e2.status === 404 && e3.status === 404 && e2.body?.error?.message === e1.body?.error?.message && e3.body?.error?.message === e1.body?.error?.message);
  } finally {
    await prisma.contactMessage.deleteMany({ where: { OR: [{ email: userEmail }, { email: `contact${stamp}@test.az` }] } });
    await prisma.newsletterSubscriber.deleteMany({ where: { email: subEmail } });
    await prisma.giftCard.deleteMany({ where: { id: { in: createdCardIds } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
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