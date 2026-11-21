// İstifadə (PowerShell):
//   $env:ADMIN_EMAIL="admin@bookstore.az"; $env:ADMIN_PASSWORD="AdminParol123"; node scripts/smoke-wishlists.mjs
// Server işləməlidir. Admin test kitabları yaradır, iki adi test istifadəçi ilə siyahıları yoxlayır, sonda kitabları silir.
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

async function register(firstName) {
  const r = await call("POST", "/auth/register", {
    json: { firstName, lastName: "Tester", email: `${firstName.toLowerCase()}${Date.now()}@test.az`, password: "12345678" },
  });
  return r.body?.token;
}

async function main() {
  const login = await call("POST", "/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const admin = login.body?.token;
  if (!admin) return console.log("Admin login alınmadı, dayanıram.");

  const alice = await register("Alice");
  const bob = await register("Bob");

  const make = (title, price) => call("POST", "/admin/books", { token: admin, json: { title, author: "Test", price } });
  const b1 = (await make("Wish A", 10)).body?.id;
  const b2 = (await make("Wish B", 20)).body?.id;
  if (!b1 || !b2) return console.log("Test kitabları yaranmadı, dayanıram.");

  console.log("Giriş tələbi");
  check("tokensiz GET /wishlists 401", (await call("GET", "/wishlists")).status === 401);
  check("tokensiz POST 401", (await call("POST", "/wishlists", { json: { name: "X" } })).status === 401);

  console.log("Siyahı yaratmaq");
  let r = await call("POST", "/wishlists", { token: alice, json: { name: "  Yay oxumaları " } });
  check("yaratma 201", r.status === 201, `(${r.status})`);
  const id = r.body?.id;
  check("ad kəsilir (trim) və standart olaraq gizlidir", r.body?.name === "Yay oxumaları" && r.body?.isPublic === false);
  check("boş siyahı: itemCount 0, items []", r.body?.itemCount === 0 && r.body?.items?.length === 0);
  r = await call("POST", "/wishlists", { token: alice, json: { name: "Yay oxumaları" } });
  check("eyni ad 409 WISHLIST_NAME_TAKEN", r.status === 409 && r.body?.error?.code === "WISHLIST_NAME_TAKEN");
  r = await call("POST", "/wishlists", { token: bob, json: { name: "Yay oxumaları" } });
  check("başqa istifadəçi eyni adı işlədə bilər", r.status === 201);
  const bobList = r.body?.id;
  check("boş ad 400", (await call("POST", "/wishlists", { token: alice, json: { name: "   " } })).status === 400);
  check("61 simvollu ad 400", (await call("POST", "/wishlists", { token: alice, json: { name: "a".repeat(61) } })).status === 400);
  check("userId göndərmək 400", (await call("POST", "/wishlists", { token: alice, json: { name: "Z", userId: 1 } })).status === 400);
  check("isPublic mətn olsa 400", (await call("POST", "/wishlists", { token: alice, json: { name: "Z", isPublic: "yes" } })).status === 400);

  console.log("Kitab əlavə etmək");
  r = await call("PUT", `/wishlists/${id}/items/${b1}`, { token: alice });
  check("kitab əlavə 200", r.status === 200 && r.body?.itemCount === 1);
  r = await call("PUT", `/wishlists/${id}/items/${b1}`, { token: alice });
  check("eyni kitab təkrar: dublikat yoxdur, 200", r.status === 200 && r.body?.itemCount === 1);
  r = await call("PUT", `/wishlists/${id}/items/${b2}`, { token: alice });
  check("ikinci kitab, ən yeni birinci", r.body?.itemCount === 2 && r.body?.items?.[0]?.bookId === b2);
  check("kitabın qiyməti və adı cavabdadır", r.body?.items?.[0]?.book?.title === "Wish B" && r.body?.items?.[0]?.book?.price === 20);
  check("olmayan kitab 404", (await call("PUT", `/wishlists/${id}/items/99999999`, { token: alice })).status === 404);
  check("yanlış kitab id formatı 400", (await call("PUT", `/wishlists/${id}/items/abc`, { token: alice })).status === 400);

  console.log("Mənim siyahılarım");
  r = await call("GET", "/wishlists", { token: alice });
  check("siyahı görünür və itemCount 2", r.status === 200 && r.body?.length === 1 && r.body[0].itemCount === 2);
  check("Alice Bob-un siyahısını görmür", !r.body?.some((w) => w.id === bobList));

  console.log("Sahiblik qaydaları");
  check("Bob Alice-in gizli siyahısını oxuya bilmir (404)", (await call("GET", `/wishlists/${id}`, { token: bob })).status === 404);
  check("Bob dəyişə bilmir (404)", (await call("PATCH", `/wishlists/${id}`, { token: bob, json: { name: "Hack" } })).status === 404);
  check("Bob kitab əlavə edə bilmir (404)", (await call("PUT", `/wishlists/${id}/items/${b1}`, { token: bob })).status === 404);
  check("Bob silə bilmir (404)", (await call("DELETE", `/wishlists/${id}`, { token: bob })).status === 404);
  check("olmayan siyahı 404", (await call("GET", "/wishlists/99999999", { token: alice })).status === 404);

  console.log("Açıq / gizli");
  check("gizli siyahı ictimai ünvanda 404", (await call("GET", `/public/wishlists/${id}`)).status === 404);
  r = await call("PATCH", `/wishlists/${id}`, { token: alice, json: { isPublic: true } });
  check("açıq etmək 200", r.status === 200 && r.body?.isPublic === true);
  r = await call("GET", `/public/wishlists/${id}`);
  check("açıq siyahı tokensiz oxunur 200", r.status === 200 && r.body?.itemCount === 2);
  check("sahibin yalnız adı görünür, email və id yoxdur", r.body?.owner?.firstName === "Alice" && !JSON.stringify(r.body).includes("@") && r.body?.owner?.id === undefined);
  check("boş PATCH 400", (await call("PATCH", `/wishlists/${id}`, { token: alice, json: {} })).status === 400);
  r = await call("PATCH", `/wishlists/${id}`, { token: alice, json: { name: "Qış siyahısı", isPublic: false } });
  check("adı dəyişmək və yenidən gizlətmək 200", r.status === 200 && r.body?.name === "Qış siyahısı" && r.body?.isPublic === false);
  check("yenidən gizli olanda ictimai ünvanda 404", (await call("GET", `/public/wishlists/${id}`)).status === 404);
  await call("POST", "/wishlists", { token: alice, json: { name: "İkinci" } });
  r = await call("PATCH", `/wishlists/${id}`, { token: alice, json: { name: "İkinci" } });
  check("adı başqa siyahının adına dəyişmək 409", r.status === 409 && r.body?.error?.code === "WISHLIST_NAME_TAKEN");

  console.log("Kitabı çıxarmaq və silmək");
  r = await call("DELETE", `/wishlists/${id}/items/${b1}`, { token: alice });
  check("kitabı çıxarmaq 200", r.status === 200 && r.body?.itemCount === 1);
  check("siyahıda olmayan kitabı çıxarmaq da 200", (await call("DELETE", `/wishlists/${id}/items/${b1}`, { token: alice })).status === 200);
  check("admin kitabı silir, siyahıdan da yox olur", (await call("DELETE", `/admin/books/${b2}`, { token: admin })).status === 204 && (await call("GET", `/wishlists/${id}`, { token: alice })).body?.itemCount === 0);
  check("siyahını silmək 204", (await call("DELETE", `/wishlists/${id}`, { token: alice })).status === 204);
  check("silinəndən sonra 404", (await call("GET", `/wishlists/${id}`, { token: alice })).status === 404);

  console.log("Limit");
  const carol = await register("Carol");
  let last = 201;
  for (let i = 1; i <= 21; i++) {
    last = (await call("POST", "/wishlists", { token: carol, json: { name: `Siyahı ${i}` } })).status;
  }
  check("21-ci siyahı 409 WISHLIST_LIMIT", last === 409);

  await call("DELETE", `/admin/books/${b1}`, { token: admin });

  console.log(`\nNəticə: ${passed} keçdi, ${failed} kəsildi`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("Skript xəta ilə dayandı:", error.message);
  process.exit(1);
});