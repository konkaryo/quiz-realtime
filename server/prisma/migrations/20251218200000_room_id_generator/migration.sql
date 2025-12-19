-- Create room id generator function ensuring mixed digits and letters (excluding i, l, o)
CREATE OR REPLACE FUNCTION random_room_id()
RETURNS text AS $$
DECLARE
  alpha TEXT[] := ARRAY['a','b','c','d','e','f','g','h','j','k','m','n','p','q','r','s','t','u','v','w','x','y','z'];
  digits TEXT[] := ARRAY['0','1','2','3','4','5','6','7','8','9'];
  result TEXT := '';
  pick TEXT;
  idx INT;
BEGIN
  FOR i IN 0..15 LOOP
    IF random() < 0.5 THEN
      idx := floor(random() * array_length(digits, 1))::INT + 1;
      pick := digits[idx];
    ELSE
      idx := floor(random() * array_length(alpha, 1))::INT + 1;
      pick := alpha[idx];
    END IF;

    result := result || pick;

    IF (i + 1) % 4 = 0 AND i < 15 THEN
      result := result || '-';
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Apply as default for the Room id
ALTER TABLE "public"."Room" ALTER COLUMN "id" SET DEFAULT random_room_id();