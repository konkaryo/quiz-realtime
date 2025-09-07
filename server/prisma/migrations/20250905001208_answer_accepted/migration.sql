-- CreateTable
CREATE TABLE "public"."AcceptedAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "norm" TEXT NOT NULL,

    CONSTRAINT "AcceptedAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedAnswer_questionId_norm_key" ON "public"."AcceptedAnswer"("questionId", "norm");

-- AddForeignKey
ALTER TABLE "public"."AcceptedAnswer" ADD CONSTRAINT "AcceptedAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
