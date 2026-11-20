// İstifadə (PowerShell):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; node scripts/smoke-cart.mjs
// Server işləməlidir. Admin test kitabları yaradır, adi test istifadəçi ilə səbəti yoxlayır, sonda hamısını silir.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL və ADMIN_PASSWORD yaz (faylın başındakı nümunəyə bax).");
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function call(method, path, { token, json } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: json ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

function check(name, condition, extra = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const login = await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  const reg = await call("POST", "/auth/register", {
    json: { firstName: "Cart", lastName: "Tester", email: `cart${Date.now()}@test.az`, password: "12345678" },
  });
  const user = reg.body?.token;

  const make = (title, price, stock) =>
    call("POST", "/admin/books", { token: admin, json: { title, author: "Test", price, stock } });
  const a = (await make("Cart A (stok 3)", 10, 3)).body?.id;
  const b = (await make("Cart B (limitsiz)", 25.5, null)).body?.id;
  const c = (await make("Cart C (qurtarıb)", 5, 0)).body?.id;
  if (!a || !b || !c) return console.log("Test kitabları yaranmadı, dayanıram.");

  console.log("Giriş tələbi");
  check("tokensiz GET /cart 401", (await call("GET", "/cart")).status === 401);
  check("tokensiz PUT 401", (await call("PUT", `/cart/items/${a}`, { json: { quantity: 1 } })).status === 401);

  console.log("Boş səbət");
  let r = await call("GET", "/cart", { token: user });
  check("boş səbət: items [], itemCount 0, subtotalCents 0", r.status === 200 && r.body.items.length === 0 && r.body.itemCount === 0 && r.body.subtotalCents === 0);

  console.log("Əlavə etmək / sayı təyin etmək");
  r = await call("PUT", `/cart/items/${a}`, { token: user, json: { quantity: 2 } });
  check("A kitabından 2 ədəd 200", r.status === 200 && r.body.itemCount === 2);
  check("sətir cəmi 2000 qəpik", r.body?.items?.[0]?.lineTotalCents === 2000);
  r = await call("PUT", `/cart/items/${a}`, { token: user, json: { quantity: 3 } });
  check("eyni kitab yenə PUT: dublikat olmur, sayı 3 olur", r.body?.items?.length === 1 && r.body?.items?.[0]?.quantity === 3);
  r = await call("PUT", `/cart/items/${a}`, { token: user, json: { quantity: 4 } });
  check("stokdan çox (4 > 3) 409 INSUFFICIENT_STOCK", r.status === 409 && r.body?.error?.code === "INSUFFICIENT_STOCK" && r.body?.error?.details?.available === 3);
  r = await call("PUT", `/cart/items/${c}`, { token: user, json: { quantity: 1 } });
  check("qurtarmış kitab 409", r.status === 409 && r.body?.error?.code === "INSUFFICIENT_STOCK");
  r = await call("PUT", `/cart/items/${b}`, { token: user, json: { quantity: 2 } });
  check("limitsiz kitab 200", r.status === 200);
  check("yekun: 3*1000 + 2*2550 = 8100 qəpik, 81 AZN, 5 ədəd", r.body?.subtotalCents === 8100 && r.body?.subtotal === 81 && r.body?.itemCount === 5);

  console.log("Yoxlamalar");
  check("quantity 0 → 400", (await call("PUT", `/cart/items/${a}`, { token: user, json: { quantity: 0 } })).status === 400);
  check("quantity 100 → 400", (await call("PUT", `/cart/items/${b}`, { token: user, json: { quantity: 100 } })).status === 400);
  check("quantity 1.5 → 400", (await call("PUT", `/cart/items/${b}`, { token: user, json: { quantity: 1.5 } })).status === 400);
  check("qiymət göndərmək (price) → 400", (await call("PUT", `/cart/items/${b}`, { token: user, json: { quantity: 1, price: 0.01 } })).status === 400);
  check("olmayan kitab → 404", (await call("PUT", "/cart/items/99999999", { token: user, json: { quantity: 1 } })).status === 404);
  check("yanlış id formatı → 400", (await call("PUT", "/cart/items/abc", { token: user, json: { quantity: 1 } })).status === 400);

  console.log("Admin stoku azaldanda");
  await call("PATCH", `/admin/books/${a}`, { token: admin, json: { stock: 1 } });
  r = await call("GET", "/cart", { token: user });
  const lineA = r.body?.items?.find((i) => i.bookId === a);
  check("səbətdə qalır, amma available: false", lineA?.quantity === 3 && lineA?.available === false);
  await call("PATCH", `/admin/books/${a}`, { token: admin, json: { price: 20 } });
  r = await call("GET", "/cart", { token: user });
  check("admin qiyməti dəyişəndə səbət yeni qiyməti göstərir (3*2000)", r.body?.items?.find((i) => i.bookId === a)?.lineTotalCents === 6000);
  await call("PATCH", `/admin/books/${a}`, { token: admin, json: { stock: 3 } });

  console.log("Qonaq səbətini birləşdirmək");
  r = await call("POST", "/cart/merge", {
    token: user,
    json: { items: [{ bookId: a, quantity: 2 }, { bookId: b, quantity: 1 }, { bookId: b, quantity: 1 }, { bookId: c, quantity: 1 }, { bookId: 99999999, quantity: 1 }] },
  });
  check("merge 200", r.status === 200, `(${r.status})`);
  const m = r.body;
  check("A: 3+2=5 stokdan çox, 3-ə düşür və adjusted-də var", m?.cart?.items?.find((i) => i.bookId === a)?.quantity === 3 && m?.adjusted?.some((x) => x.bookId === a && x.quantity === 3));
  check("B: 2 + (1+1) = 4", m?.cart?.items?.find((i) => i.bookId === b)?.quantity === 4);
  check("C qurtarıb → skipped OUT_OF_STOCK", m?.skipped?.some((x) => x.bookId === c && x.reason === "OUT_OF_STOCK"));
  check("olmayan kitab → skipped NOT_FOUND", m?.skipped?.some((x) => x.bookId === 99999999 && x.reason === "NOT_FOUND"));
  check("boş items → 400", (await call("POST", "/cart/merge", { token: user, json: { items: [] } })).status === 400);

  console.log("Silmək");
  r = await call("DELETE", `/cart/items/${a}`, { token: user });
  check("bir sətri silmək 200", r.status === 200 && !r.body.items.some((i) => i.bookId === a));
  check("səbətdə olmayan kitabı silmək də 200", (await call("DELETE", `/cart/items/${a}`, { token: user })).status === 200);
  check("admin kitabı silir → səbətdən də yox olur", (await call("DELETE", `/admin/books/${b}`, { token: admin })).status === 204 && (await call("GET", "/cart", { token: user })).body?.items?.length === 0);
  await call("PUT", `/cart/items/${a}`, { token: user, json: { quantity: 1 } });
  check("səbəti təmizləmək 204", (await call("DELETE", "/cart", { token: user })).status === 204);
  check("təmizləndikdən sonra boşdur", (await call("GET", "/cart", { token: user })).body?.itemCount === 0);

  for (const id of [a, b, c]) await call("DELETE", `/admin/books/${id}`, { token: admin });

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("Skript xəta ilə dayandı:", error.message);
  process.exit(1);
});