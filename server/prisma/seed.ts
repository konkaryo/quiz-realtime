// server/scripts/seed.ts
import fs from "fs";
import path from "path";
import { loadQuestionCSV } from "../src/ingest";
import { importBots } from "../src/import/bots.ingest"; // ⬅️ corrige ici

async function main() {
  // ---- Questions (optionnel) ----
  const csvEnv = process.env.SEED_CSV;
  const questionsCsv = csvEnv ? path.resolve(process.cwd(), csvEnv) : null;

  if (questionsCsv && fs.existsSync(questionsCsv)) {
    console.log(`[seed] Import questions depuis ${questionsCsv}`);
    await loadQuestionCSV(questionsCsv);
  } else {
    console.warn(
      `[seed] Pas d'import questions (SEED_CSV ${
        csvEnv ? "défini mais fichier introuvable" : "non défini"
      }).`
    );
  }

  // ---- Bots (optionnel) ----
  // chemin par défaut : server/import/bots.csv depuis la racine du projet
  const botsCsv = path.resolve(process.cwd(), "./import/bots.csv");

  if (fs.existsSync(botsCsv)) {
    try {
      console.log(`[seed] Import bots depuis ${botsCsv}`);
      await importBots(botsCsv); // ⬅️ et ici
      console.log("[seed] bots OK");
    } catch (e: any) {
      console.warn("[seed] bots CSV ignoré:", e?.message || e);
    }
  } else {
    console.warn("[seed] Aucun bots.csv trouvé (server/import/bots.csv) — import bots ignoré.");
  }

  console.log("[seed] Terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
