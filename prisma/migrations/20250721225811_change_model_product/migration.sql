-- AlterTable
ALTER TABLE "products" ADD COLUMN     "bestSeller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "popularityScore" INTEGER NOT NULL DEFAULT 0;
