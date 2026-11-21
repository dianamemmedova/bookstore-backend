// İstifadə: npx tsx scripts/test-promo-redeem.ts
// Bazaya birbaşa qoşulub redeemPromo()-nu yoxlayır: eyni istifadəçi eyni kodu 10 PARALEL sorğu ilə
// işlətməyə çalışanda yalnız BİRİ keçməlidir. Sonda yaratdığı hər şeyi silir.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { redeemPromo } from "../src/services/promo.service";

let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name} ${ok ? "" : extra}`);
}

async function main() {
  const stamp = Date.now();
  const code = `TEST${stamp}`;
  const user = await prisma.user.create({
    data: { email: `promo${stamp}@test.az`, firstName: "Promo", lastName: "Tester", passwordHash: "x" },
  });
  const other = await prisma.user.create({
    data: { email: `promo2${stamp}@test.az`, firstName: "Promo", lastName: "Other", passwordHash: "x" },
  });
  const promo = await prisma.promoCode.create({ data: { code, discountPercent: 10 } });

  console.log("10 paralel sorğu, eyni istifadəçi, eyni kod");
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => prisma.$transaction((tx) => redeemPromo(tx, user.id, code))),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  check("yalnız 1 sorğu keçdi", ok === 1, `(${ok} keçdi)`);
  check("qalan 9 PROMO_ALREADY_USED ilə rədd olundu", rejected.length === 9 && rejected.every((r) => r.reason?.code === "PROMO_ALREADY_USED"));
  check("bazada cəmi 1 istifadə sətri var", (await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } })) === 1);

  console.log("Başqa istifadəçi eyni kodu işlədə bilər");
  const second = await prisma.$transaction((tx) => redeemPromo(tx, other.id, code)).catch((e) => e);
  check("ikinci istifadəçi üçün uğurlu, endirim 10%", second?.discountPercent === 10, JSON.stringify(second?.message));

  console.log("Söndürülmüş və müddəti bitmiş kod");
  await prisma.promoCode.update({ where: { id: promo.id }, data: { isActive: false } });
  const off = await prisma.$transaction((tx) => redeemPromo(tx, user.id, code)).catch((e) => e);
  check("isActive=false PROMO_INVALID", off?.code === "PROMO_INVALID");
  await prisma.promoCode.update({ where: { id: promo.id }, data: { isActive: true, expiresAt: new Date(Date.now() - 1000) } });
  const expired = await prisma.$transaction((tx) => redeemPromo(tx, user.id, code)).catch((e) => e);
  check("müddəti bitmiş PROMO_INVALID", expired?.code === "PROMO_INVALID");
  const missing = await prisma.$transaction((tx) => redeemPromo(tx, user.id, "YOXDUR999")).catch((e) => e);
  check("olmayan kod PROMO_INVALID", missing?.code === "PROMO_INVALID");

  console.log("Silmə qaydası");
  const del = await prisma.promoCode.delete({ where: { id: promo.id } }).catch((e) => e);
  check("istifadə olunmuş kodu baza silməyə qoymur (P2003)", del?.code === "P2003");

  // Təmizlik
  await prisma.promoRedemption.deleteMany({ where: { promoCodeId: promo.id } });
  await prisma.promoCode.delete({ where: { id: promo.id } });
  await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });

  console.log(`\n${failed === 0 ? "Hamısı keçdi" : `${failed} yoxlama kəsildi`}`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());