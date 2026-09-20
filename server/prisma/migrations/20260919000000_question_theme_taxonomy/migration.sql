-- Replace the legacy 14-theme taxonomy with the 10 product themes.
ALTER TYPE "Theme" RENAME TO "Theme_old";

CREATE TYPE "Theme" AS ENUM (
  'CULTURE_CLASSIQUE',
  'CULTURE_MODERNE',
  'CULTURE_GENERALE',
  'TRADITION',
  'GEOGRAPHIE',
  'HISTOIRE',
  'MUSIQUE',
  'SCIENCE',
  'NATURE',
  'SPORT'
);

CREATE FUNCTION "_map_question_theme"(value text) RETURNS "Theme"
LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT CASE value
    WHEN 'ARTS' THEN 'CULTURE_CLASSIQUE'
    WHEN 'CROYANCES' THEN 'CULTURE_CLASSIQUE'
    WHEN 'LITTERATURE' THEN 'CULTURE_CLASSIQUE'
    WHEN 'AUDIOVISUEL' THEN 'CULTURE_MODERNE'
    WHEN 'POP_CULTURE' THEN 'CULTURE_MODERNE'
    WHEN 'DIVERS' THEN 'CULTURE_GENERALE'
    WHEN 'SOCIETE' THEN 'CULTURE_GENERALE'
    WHEN 'TRADITIONS' THEN 'TRADITION'
    ELSE value
  END::"Theme"
$$;

CREATE FUNCTION "_map_question_theme_array"(items text[]) RETURNS "Theme"[]
LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT COALESCE(
    array_agg(DISTINCT "_map_question_theme"(item.value)),
    ARRAY[]::"Theme"[]
  )
  FROM unnest(items) AS item(value)
$$;

-- Several former bot skills can merge into one new skill. Average those values
-- before changing the enum so the composite primary key remains unique.
CREATE TEMP TABLE "_BotSkillThemeMigration" AS
SELECT
  "botId",
  "_map_question_theme"("theme"::text) AS "theme",
  round(avg("value"))::integer AS "value"
FROM "BotSkill"
GROUP BY "botId", "_map_question_theme"("theme"::text);

DELETE FROM "BotSkill";

ALTER TABLE "BotSkill"
  ALTER COLUMN "theme" TYPE "Theme"
  USING "_map_question_theme"("theme"::text);

INSERT INTO "BotSkill" ("botId", "theme", "value")
SELECT "botId", "theme", "value"
FROM "_BotSkillThemeMigration";

ALTER TABLE "Question"
  ALTER COLUMN "theme" TYPE "Theme"
  USING "_map_question_theme"("theme"::text);

ALTER TABLE "Room"
  ALTER COLUMN "bannedThemes" TYPE "Theme"[]
  USING "_map_question_theme_array"("bannedThemes"::text[]);

-- Player statistics are stored as JSON. Merge totals and correct answers when
-- multiple legacy themes now resolve to the same product theme.
UPDATE "PlayerStats" AS stats
SET "themeStats" = COALESCE(
  (
    SELECT jsonb_object_agg(
      grouped.theme,
      jsonb_build_object('total', grouped.total, 'correct', grouped.correct)
    )
    FROM (
      SELECT
        "_map_question_theme"(entry.key)::text AS theme,
        sum(COALESCE((entry.value->>'total')::integer, 0)) AS total,
        sum(COALESCE((entry.value->>'correct')::integer, 0)) AS correct
      FROM jsonb_each(stats."themeStats") AS entry
      GROUP BY "_map_question_theme"(entry.key)::text
    ) AS grouped
  ),
  '{}'::jsonb
);

DROP FUNCTION "_map_question_theme_array"(text[]);
DROP FUNCTION "_map_question_theme"(text);
DROP TYPE "Theme_old";