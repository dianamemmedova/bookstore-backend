// İstifadə: npm run smoke   (əvvəl başqa pəncərədə npm run dev işləməlidir)
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

async function call(method, path, { body, token, rawBody } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function check(name, condition, extra = "") {
  if (condition) {
    passed++;
    console.log(`  OK    ${name}`);
  } else {
    failed++;
    console.log(`  XƏTA  ${name} ${extra}`);
  }
}

async function main() {
  const stamp = Date.now();
  const email = `smoke${stamp}@test.az`;
  const password = "12345678";
  const newPassword = "yeniParol123";

  console.log(`\nServer: ${BASE}\n`);

  console.log("Addım 1-2: server və xəta formatı");
  let r = await call("GET", "/health");
  check("GET /health 200 və db ok", r.status === 200 && r.data?.db === "ok", JSON.stringify(r.data));

  r = await call("GET", "/yoxdur");
  check("GET /yoxdur 404 NOT_FOUND", r.status === 404 && r.data?.error?.code === "NOT_FOUND");
  check("X-Request-Id başlığı var", Boolean(r.headers.get("x-request-id")));

  r = await call("POST", "/health", { rawBody: "{bad" });
  check("Yanlış JSON 400 VALIDATION_ERROR", r.status === 400 && r.data?.error?.code === "VALIDATION_ERROR");

  console.log("\nAddım 3: qeydiyyat və giriş");
  r = await call("POST", "/auth/register", {
    body: { firstName: "Diana", lastName: "Məmmədova", email, password, marketingOptIn: true },
  });
  check("Qeydiyyat 201", r.status === 201, JSON.stringify(r.data));
  check("Cavabda token var", typeof r.data?.token === "string");
  check("Cavabda passwordHash YOXDUR", r.data?.user && !("passwordHash" in r.data.user));
  check("Rol USER-dir", r.data?.user?.role === "USER");

  r = await call("POST", "/auth/register", {
    body: { firstName: "Diana", lastName: "Məmmədova", email, password },
  });
  check("Eyni email 409 EMAIL_TAKEN", r.status === 409 && r.data?.error?.code === "EMAIL_TAKEN");

  r = await call("POST", "/auth/register", {
    body: { firstName: "D", lastName: "123", email: "yanlis", password: "123" },
  });
  const fields = (r.data?.error?.details ?? []).map((d) => d.field).sort().join(",");
  check("Yanlış məlumat 400, 4 sahə xətası", r.status === 400 && fields === "email,firstName,lastName,password", fields);

  r = await call("POST", "/auth/login", { body: { email, password } });
  check("Login 200 və token", r.status === 200 && typeof r.data?.token === "string");
  const token = r.data?.token;

  r = await call("POST", "/auth/login", { body: { email, password: "sehvParol1" } });
  check("Yanlış parol 401", r.status === 401 && r.data?.error?.code === "UNAUTHORIZED");

  r = await call("POST", "/auth/login", { body: { email: "yoxdur@test.az", password } });
  check("Olmayan email də 401 (eyni cavab)", r.status === 401);

  console.log("\nAddım 4: token, /me, rollar");
  r = await call("GET", "/me");
  check("Tokensiz /me 401", r.status === 401);

  r = await call("GET", "/me", { token: "abc" });
  check("Yanlış token 401", r.status === 401);

  r = await call("GET", "/me", { token });
  check("/me 200, email düzgün", r.status === 200 && r.data?.email === email, JSON.stringify(r.data));

  r = await call("PATCH", "/me", { token, body: { firstName: "Dian" } });
  check("PATCH /me ad dəyişdi", r.status === 200 && r.data?.firstName === "Dian");

  r = await call("PATCH", "/me", { token, body: {} });
  check("PATCH /me boş 400", r.status === 400);

  r = await call("PATCH", "/me", { token, body: { role: "ADMIN" } });
  check("PATCH /me ilə role göndərmək 400", r.status === 400);

  r = await call("PUT", "/me/password", { token, body: { currentPassword: "sehv12345", newPassword } });
  check("Yanlış cari parol 400 WRONG_PASSWORD", r.status === 400 && r.data?.error?.code === "WRONG_PASSWORD");

  r = await call("PUT", "/me/password", { token, body: { currentPassword: password, newPassword } });
  check("Parol dəyişdi 204", r.status === 204);

  r = await call("POST", "/auth/login", { body: { email, password } });
  check("Köhnə parolla giriş 401", r.status === 401);

  r = await call("POST", "/auth/login", { body: { email, password: newPassword } });
  check("Yeni parolla giriş 200", r.status === 200);

  r = await call("GET", "/admin/users", { token });
  check("Adi istifadəçi /admin/users 403", r.status === 403 && r.data?.error?.code === "FORBIDDEN");

  console.log(`\nNəticə: ${passed} keçdi, ${failed} xəta\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("\nSkript işləmədi. Server (npm run dev) işləyir?\n", error.cause?.code ?? error.message);
  process.exit(1);
});