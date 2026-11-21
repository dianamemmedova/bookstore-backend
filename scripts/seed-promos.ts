// İstifadə: npm run seed:promos
// Frontdakı üç promo kodu bazaya yazır. Təkrar işlətmək təhlükəsizdir: olan koda toxunmur.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const PROMOS = [
  { code: "ILKALIS20", discountPercent: 20, description: "İlk alışa özel — 20% endirim" },
  { code: "KITAB10", discountPercent: 10, description: "10% endirim" },
  { code: "BAKU15", discountPercent: 15, description: "15% endirim" },
];

async function main() {
  const result = await prisma.promoCode.createMany({ data: PROMOS, skipDuplicates: true });
  console.log(`${result.count} yeni promo kodu əlavə olundu. Bazada cəmi: ${await prisma.promoCode.count()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());