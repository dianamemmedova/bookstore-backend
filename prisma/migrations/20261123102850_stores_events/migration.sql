-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('AUTHOR', 'KIDS', 'OTHER');

-- CreateEnum
CREATE TYPE "EventLocation" AS ENUM ('IN_STORE', 'VIRTUAL');

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_events" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "location_type" "EventLocation" NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_name_key" ON "stores"("name");

-- CreateIndex
CREATE INDEX "store_events_date_time_idx" ON "store_events"("date", "time");

-- CreateIndex
CREATE INDEX "store_events_store_id_idx" ON "store_events"("store_id");

-- AddForeignKey
ALTER TABLE "store_events" ADD CONSTRAINT "store_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
