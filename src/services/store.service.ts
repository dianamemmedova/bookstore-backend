import type { Prisma, Store, StoreEvent } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { isPrismaError, PrismaErrorCode } from "../lib/prisma-errors";
import { ConflictError, NotFoundError } from "../lib/errors";
import type { CreateEventInput, CreateStoreInput, ListEventsQuery, UpdateEventInput, UpdateStoreInput } from "../schemas/store.schema";

function presentStore(store: Store) {
  return { id: store.id, name: store.name, address: store.address, lat: store.lat, lng: store.lng, phone: store.phone, hours: store.hours };
}

type EventWithStore = StoreEvent & { store: { name: string } };

function presentEvent(event: EventWithStore) {
  return {
    id: event.id,
    storeId: event.storeId,
    storeName: event.store.name,
    title: event.title,
    type: event.type,
    locationType: event.locationType,
    date: event.date.toISOString().slice(0, 10),
    time: event.time,
  };
}

const withStore = { store: { select: { name: true } } } satisfies Prisma.StoreEventInclude;
const nameTaken = () => new ConflictError("Bu adda mağaza artıq mövcuddur", "STORE_NAME_TAKEN");
const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

// --- Mağazalar (açıq oxuma) ---

export async function listStores() {
  const stores = await prisma.store.findMany({ orderBy: { id: "asc" } });
  return { items: stores.map(presentStore) };
}

export async function getStore(id: number) {
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) throw new NotFoundError("Mağaza");
  return presentStore(store);
}

// --- Tədbirlər (açıq oxuma) ---

export async function listEvents(query: ListEventsQuery) {
  const where: Prisma.StoreEventWhereInput = {
    ...(query.storeId !== undefined && { storeId: query.storeId }),
    ...(query.type && { type: { in: query.type } }),
    ...(query.locationType && { locationType: { in: query.locationType } }),
    ...((query.from || query.to) && {
      date: { ...(query.from && { gte: toDate(query.from) }), ...(query.to && { lte: toDate(query.to) }) },
    }),
  };
  const orderBy: Prisma.StoreEventOrderByWithRelationInput[] =
    query.sort === "store" ? [{ store: { name: "asc" } }, { date: "asc" }, { time: "asc" }] : [{ date: "asc" }, { time: "asc" }, { id: "asc" }];

  const [rows, total] = await Promise.all([
    prisma.storeEvent.findMany({ where, include: withStore, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.storeEvent.count({ where }),
  ]);
  return { items: rows.map(presentEvent), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
}

export async function getEvent(id: number) {
  const event = await prisma.storeEvent.findUnique({ where: { id }, include: withStore });
  if (!event) throw new NotFoundError("Tədbir");
  return presentEvent(event);
}

// --- Admin: mağazalar ---

export async function createStore(input: CreateStoreInput) {
  try {
    return presentStore(await prisma.store.create({ data: input }));
  } catch (error) {
    if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) throw nameTaken();
    throw error;
  }
}

export async function updateStore(id: number, input: UpdateStoreInput) {
  try {
    // Mağaza yoxdursa Prisma P2025 atır, error handler onu 404-ə çevirir
    return presentStore(await prisma.store.update({ where: { id }, data: input }));
  } catch (error) {
    if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) throw nameTaken();
    throw error;
  }
}

export async function deleteStore(id: number) {
  // Tədbirlər cascade ilə silinir
  const result = await prisma.store.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Mağaza");
}

// --- Admin: tədbirlər ---

async function requireStore(storeId: number) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw new NotFoundError("Mağaza");
}

export async function createEvent(input: CreateEventInput) {
  await requireStore(input.storeId);
  const event = await prisma.storeEvent.create({ data: { ...input, date: toDate(input.date) }, include: withStore });
  return presentEvent(event);
}

export async function updateEvent(id: number, input: UpdateEventInput) {
  if (input.storeId !== undefined) await requireStore(input.storeId);
  const { date, ...rest } = input;
  const event = await prisma.storeEvent.update({
    where: { id },
    data: { ...rest, ...(date !== undefined && { date: toDate(date) }) },
    include: withStore,
  });
  return presentEvent(event);
}

export async function deleteEvent(id: number) {
  const result = await prisma.storeEvent.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Tədbir");
}