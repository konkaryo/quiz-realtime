-- Add room name column and room names table
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "name" TEXT;

CREATE TABLE IF NOT EXISTS "RoomName" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomName_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomName_name_key" ON "RoomName"("name");

-- Function to auto-assign room names on insert (Prisma Studio-safe)
CREATE OR REPLACE FUNCTION set_room_name()
RETURNS TRIGGER AS $$
DECLARE
  picked_name TEXT;
  owner_name TEXT;
BEGIN
  IF NEW."name" IS NOT NULL AND btrim(NEW."name") <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW."visibility" = 'PUBLIC' THEN
    SELECT "name" INTO picked_name
    FROM "RoomName"
    ORDER BY RANDOM()
    LIMIT 1;

    NEW."name" := COALESCE(picked_name, 'Salon public');
    RETURN NEW;
  END IF;

  IF NEW."visibility" = 'PRIVATE' THEN
    IF NEW."ownerId" IS NOT NULL THEN
      SELECT "displayName" INTO owner_name
      FROM "User"
      WHERE "id" = NEW."ownerId";
    END IF;

    NEW."name" := COALESCE(owner_name, 'Salle privée');
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "room_set_name" ON "Room";
CREATE TRIGGER "room_set_name"
BEFORE INSERT ON "Room"
FOR EACH ROW
EXECUTE FUNCTION set_room_name();