-- Persist the metrics used by bot text-answer timing. Existing rows are
-- backfilled from the stored question and normalized accepted-answer data.
ALTER TABLE "Question"
ADD COLUMN "questionCharCount" INTEGER,
ADD COLUMN "defaultAnswerCharCount" INTEGER,
ADD COLUMN "shortestAnswerCharCount" INTEGER;

UPDATE "Question" AS q
SET
  "questionCharCount" = char_length(q."text"),
  "defaultAnswerCharCount" = (
    SELECT char_length(aa."norm")
    FROM "Choice" AS c
    JOIN "AcceptedAnswer" AS aa
      ON aa."questionId" = c."questionId" AND aa."text" = c."label"
    WHERE c."questionId" = q."id" AND c."isCorrect" = true
    LIMIT 1
  ),
  "shortestAnswerCharCount" = (
    SELECT min(char_length(aa."norm"))
    FROM "AcceptedAnswer" AS aa
    WHERE aa."questionId" = q."id" AND aa."norm" <> ''
  );

ALTER TABLE "Question"
ALTER COLUMN "questionCharCount" SET NOT NULL,
ALTER COLUMN "defaultAnswerCharCount" SET NOT NULL,
ALTER COLUMN "shortestAnswerCharCount" SET NOT NULL;