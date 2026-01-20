//server/prisma/seed.ts
import fs from "fs";
import path from "path";
import { importQuestions } from "../src/import/questions.ingest";
import { importBots } from "../src/import/bots.ingest";
import { importDailyChallenges } from "../src/import/daily-challenges.ingest";

async function main() {
  const questionsPath = process.env.QUESTIONS_CSV;
  const questionsCsv = questionsPath ? path.resolve(process.cwd(), questionsPath) : null;

  // ---- Questions ----
  if (questionsCsv && fs.existsSync(questionsCsv)) {
    console.log(`[seed] Extraction des questions depuis : ${questionsCsv}`);
    await importQuestions(questionsCsv);
    console.log(`[seed] Extraction des questions : ok`);
  } else {
    console.warn(`[seed] Erreur - Fichier questions`);
  }

  // ---- Bots ----
  const botsPath = process.env.BOTS_CSV;
  const botsCsv = botsPath ? path.resolve(process.cwd(), botsPath) : null;

  if (botsCsv && fs.existsSync(botsCsv)) {
    try {
      console.log(`[seed] Extraction des bots depuis : ${botsCsv}`);
      await importBots(botsCsv);
      console.log("[seed] Extraction des bots : OK");
    } catch (e: any) {
      console.warn("[seed] Erreur - Bot :", e?.message || e);
    }
  } else {
    console.warn("[seed] Erreur - Fichier bots");
  }

  // ---- Daily challenges ----
  const dailyCsvEnv = process.env.DAILY_CSV;
  const dailyCsv = dailyCsvEnv
    ? path.resolve(process.cwd(), dailyCsvEnv)
    : path.resolve(process.cwd(), "./import/daily_challenge.csv");

  if (fs.existsSync(dailyCsv)) {
    try {
      console.log(`[seed] Import daily challenge depuis ${dailyCsv}`);
      await importDailyChallenges(dailyCsv);
    } catch (e: any) {
      console.warn("[seed] daily challenge CSV ignoré:", e?.message || e);
    }
  } else {
    console.warn("[seed] Aucun daily_challenge.csv trouvé — import daily ignoré.");
  }

  console.log("[seed] Terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
