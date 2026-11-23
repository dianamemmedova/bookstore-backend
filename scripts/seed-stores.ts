// İstifadə: npm run seed:stores
// Frontdakı 6 mağazanı və nümunə tədbirləri bazaya yazır. Təkrar işlədəndə mağazalar yenilənir (adına görə),
// tədbirlər yalnız cədvəl boşdursa yaradılır, yəni dublikat olmur. Tədbir tarixləri bu gündən başlayır, ona görə həmişə "gələcək" olur.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const stores = [
  { name: "Nəriman Nərimanov", address: "Nəriman Nərimanov küç. 25, Bakı", lat: 40.4093, lng: 49.8671, phone: "+994 12 310 00 01", hours: "B.e.–Şən: 09:00–21:00" },
  { name: "İçərişəhər", address: "Qız Qalası yan., Bakı", lat: 40.366, lng: 49.8358, phone: "+994 12 310 00 02", hours: "B.e.–Şən: 10:00–20:00" },
  { name: "Xətai", address: "Xətai pr. 14, Bakı", lat: 40.3935, lng: 49.8812, phone: "+994 12 310 00 03", hours: "B.e.–Şən: 09:00–21:00" },
  { name: "Yasamal", address: "Həsən Əliyev küç. 3, Bakı", lat: 40.403, lng: 49.838, phone: "+994 12 310 00 04", hours: "B.e.–Şən: 10:00–20:00" },
  { name: "Nizami Mall", address: "Nizami küç. 107, Bakı", lat: 40.3791, lng: 49.8512, phone: "+994 12 310 00 05", hours: "B.e.–Baz: 10:00–22:00" },
  { name: "Sumqayıt", address: "M.Müşfiq küç. 18, Sumqayıt", lat: 40.596, lng: 49.65, phone: "+994 18 310 00 06", hours: "B.e.–Şən: 09:00–20:00" },
];

// [mağaza adı, bu gündən neçə gün sonra, saat, ad, tip, yer]
const events: [string, number, string, string, "AUTHOR" | "KIDS" | "OTHER", "IN_STORE" | "VIRTUAL"][] = [
  ["Nəriman Nərimanov", 1, "11:00", "Şənbə Uşaq Hekayəsi", "KIDS", "IN_STORE"],
  ["İçərişəhər", 1, "11:00", "Həftəlik Uşaq Nağılı", "KIDS", "IN_STORE"],
  ["Xətai", 2, "14:00", "Bazar Günü Nağıl Saatı", "KIDS", "IN_STORE"],
  ["Yasamal", 7, "11:00", "Həftəlik Uşaq Nağılı", "KIDS", "IN_STORE"],
  ["Nizami Mall", 7, "11:00", "K-POP Kitab Saatı", "KIDS", "IN_STORE"],
  ["Nəriman Nərimanov", 7, "13:00", "Müəllif İmza Günü", "AUTHOR", "IN_STORE"],
  ["İçərişəhər", 8, "14:00", "Yerli Müəlliflə Söhbət", "AUTHOR", "IN_STORE"],
  ["Xətai", 9, "14:00", "Bazar Günü Nağıl Saatı", "KIDS", "IN_STORE"],
  ["Sumqayıt", 14, "18:00", "Virtual Müəllif Müzakirəsi", "AUTHOR", "VIRTUAL"],
  ["Nəriman Nərimanov", 19, "19:00", "Online Kitab Klubu", "OTHER", "VIRTUAL"],
  ["Nizami Mall", 24, "15:00", "Yeni İl Kitabları Təqdimatı", "OTHER", "IN_STORE"],
];

function dayPlus(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function main() {
  for (const store of stores) {
    await prisma.store.upsert({ where: { name: store.name }, create: store, update: store });
  }
  console.log(`Mağazalar: ${stores.length}`);

  if ((await prisma.storeEvent.count()) > 0) {
    console.log("Tədbirlər cədvəli boş deyil, tədbirlərə toxunulmadı.");
  } else {
    const byName = new Map((await prisma.store.findMany()).map((s) => [s.name, s.id]));
    for (const [storeName, days, time, title, type, locationType] of events) {
      await prisma.storeEvent.create({ data: { storeId: byName.get(storeName)!, date: dayPlus(days), time, title, type, locationType } });
    }
    console.log(`Tədbirlər: ${events.length}`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});