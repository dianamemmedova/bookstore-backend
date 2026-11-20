-- CreateTable
CREATE TABLE "books" (
    "id" SERIAL NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "year" INTEGER,
    "pages" INTEGER,
    "subjects" TEXT[],
    "price_cents" INTEGER NOT NULL,
    "stock" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "books_external_id_key" ON "books"("external_id");
