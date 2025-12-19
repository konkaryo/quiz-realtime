// server/src/import/room-names.ingest.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CsvRow = z.object({
  personnalite: z.string().min(1),
});

async function parseRoomNamesCsv(filePath: string): Promise<string[]> {
  if (!fs.existsSync(filePath)) return [];
  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, bom: true }))
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve())
      .on("error", (e) => reject(e));
  });

  const names: string[] = [];
  for (const [idx, raw] of rows.entries()) {
    const out = CsvRow.safeParse(raw);
    if (!out.success) {
      const msg = out.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`room_names.csv: ligne ${idx + 2} invalide: ${msg}`);
    }
    const name = out.data.personnalite.trim();
    if (name) names.push(name);
  }

  return names;
}

export async function importRoomNames(
  csvAbsPath = path.resolve(__dirname, "../import/room_names.csv"),
) {
  const names = await parseRoomNamesCsv(csvAbsPath);
  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));

  if (uniqueNames.length === 0) {
    console.log("[room-names] Aucun nom à importer (fichier manquant ou vide).");
    return { inserted: 0 };
  }

  const result = await prisma.roomName.createMany({
    data: uniqueNames.map((name) => ({ name })),
    skipDuplicates: true,
  });

  console.log(`[room-names] Import OK — ${result.count} noms ajoutés.`);
  return { inserted: result.count };
}

export default importRoomNames;