// İstifadə (PowerShell): npm run seed:books
// Open Library-dən janrlar üzrə kitabları çəkib öz bazana yazır (internet lazımdır).
// Təkrar işlətmək təhlükəsizdir: eyni kitab (externalId) təkrar yaranmır, qiyməti və stoku dəyişmir.
// Əlavə: npm run seed:books -- --per=60   (hər janrdan neçə kitab, default 40)
import "dotenv/config";

process.env.NODE_ENV = process.env.NODE_ENV === "production" ? "production" : "test"; // Prisma sorğu loglarını söndürür
const { prisma } = await import("../src/lib/prisma");

const OL_BASE = process.env.OL_BASE ?? "https://openlibrary.org";
const perArg = process.argv.find((a) => a.startsWith("--per="));
const PER_GENRE = Math.min(100, Math.max(5, Number(perArg?.split("=")[1] ?? 40)));

// Front-dakı janr sorğuları ilə EYNİ olmalıdır (kitab bu teqlə tapılır)
const GENRES = [
  "fiction", "science fiction", "detective mystery", "history", "science", "psychology",
  "adventure", "children", "biography memoir", "love stories romance",
  "nonfiction", "literary fiction", "mystery", "romance", "classics", "fantasy",
];

type OLDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  subject?: string[];
  number_of_pages_median?: number;
};

// Front-dakı getBookPrice ilə eyni düstur: eyni kitab həmişə eyni qiyməti alır (10–70 AZN)
function priceCentsFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const steps = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
  return steps[hash % steps.length]! * 100;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchGenre(genre: string): Promise<OLDoc[]> {
  const url = new URL("/search.json", OL_BASE);
  url.searchParams.set("subject", genre);
  url.searchParams.set("limit", String(PER_GENRE * 2)); // coverı olmayanlar atılacaq
  url.searchParams.set("fields", "key,title,author_name,cover_i,first_publish_year,subject,number_of_pages_median");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { docs?: OLDoc[] };
      return data.docs ?? [];
    } catch (error) {
      console.log(`  ! "${genre}" cəhd ${attempt}/3 alınmadı: ${(error as Error).message}`);
      await sleep(1500 * attempt);
    }
  }
  return [];
}

async function main() {
  const maxYear = new Date().getFullYear() + 1;
  let created = 0;
  let skipped = 0;
  let tagged = 0;

  for (const genre of GENRES) {
    const docs = await fetchGenre(genre);
    let used = 0;
    for (const doc of docs) {
      if (used >= PER_GENRE) break;
      const externalId = doc.key?.replace("/works/", "");
      const author = doc.author_name?.[0]?.trim();
      const title = doc.title?.trim();
      if (!externalId || !title || !author || !doc.cover_i) continue;
      used++;

      const subjects = [...new Set([genre, ...(doc.subject ?? []).slice(0, 4)].map((s) => s.trim().toLowerCase().slice(0, 60)).filter(Boolean))].slice(0, 10);

      const existing = await prisma.book.findUnique({ where: { externalId } });
      if (existing) {
        // Eyni kitab başqa janrda da çıxarsa, yeni janr teqini əlavə edirik
        if (!existing.subjects.includes(genre) && existing.subjects.length < 10) {
          await prisma.book.update({ where: { id: existing.id }, data: { subjects: [...existing.subjects, genre].slice(0, 10) } });
          tagged++;
        } else skipped++;
        continue;
      }

      await prisma.book.create({
        data: {
          externalId,
          title: title.slice(0, 200),
          author: author.slice(0, 200),
          coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
          year: doc.first_publish_year && doc.first_publish_year >= 1000 && doc.first_publish_year <= maxYear ? doc.first_publish_year : null,
          pages: doc.number_of_pages_median && doc.number_of_pages_median > 0 && doc.number_of_pages_median <= 10000 ? doc.number_of_pages_median : null,
          subjects,
          priceCents: priceCentsFor(externalId),
          stock: 5 + Math.floor(Math.random() * 36), // 5–40 ədəd (admin sonra dəyişə bilər)
        },
      });
      created++;
    }
    console.log(`  ✓ ${genre}: ${used} kitab baxıldı`);
    await sleep(400); // Open Library-ni yormamaq üçün
  }

  const total = await prisma.book.count();
  console.log(`\nYeni: ${created}, artıq var idi: ${skipped}, janr teqi əlavə olundu: ${tagged}. Bazada cəmi ${total} kitab.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});