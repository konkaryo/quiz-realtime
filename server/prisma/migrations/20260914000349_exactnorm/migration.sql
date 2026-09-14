-- CreateTable
CREATE TABLE "ExactAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "norm" TEXT NOT NULL,

    CONSTRAINT "ExactAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExactAnswer_questionId_norm_key" ON "ExactAnswer"("questionId", "norm");

-- AddForeignKey
ALTER TABLE "ExactAnswer" ADD CONSTRAINT "ExactAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
