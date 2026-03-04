CREATE TABLE "DeductionPolicy" (
  "id" TEXT NOT NULL,
  "category" "DeductionCategory" NOT NULL,
  "effectiveFromLocalDate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeductionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeductionPolicy_category_key" ON "DeductionPolicy"("category");
CREATE INDEX "DeductionPolicy_category_idx" ON "DeductionPolicy"("category");
