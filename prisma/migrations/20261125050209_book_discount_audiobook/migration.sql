-- AlterTable
ALTER TABLE "books" ADD COLUMN     "discount_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_audiobook" BOOLEAN NOT NULL DEFAULT false;
