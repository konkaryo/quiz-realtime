import { loadQuestionCSV } from "../src/ingest";

async function main() {

  const CSV_PATH = process.env.SEED_CSV;

  if(CSV_PATH){  
    console.log(`[seed] Import depuis ${CSV_PATH}`);
    await loadQuestionCSV(CSV_PATH);
  }

  else { throw new Error(`${CSV_PATH} is not defined in .env`); }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });