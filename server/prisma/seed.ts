import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function code(n=4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

async function main() {
  const gameCode = code();
  const game = await prisma.game.create({
    data: {
      code: gameCode,
      state: "lobby",
      questions: {
        create: [
          {
            text: "What is 2 + 2?",
            order: 1,
            correctId: "",
            choices: { create: [{label:"3"},{label:"4"},{label:"5"},{label:"22"}] }
          },
          {
            text: "Capital of France?",
            order: 2,
            correctId: "",
            choices: { create: [{label:"Paris"},{label:"Lyon"},{label:"Berlin"},{label:"Madrid"}] }
          }
        ]
      }
    },
    include: { questions: { include: { choices: true } } }
  });

  const q1 = game.questions.find(q => q.order === 1)!;
  const q2 = game.questions.find(q => q.order === 2)!;

  await prisma.question.update({
    where: { id: q1.id },
    data: { correctId: q1.choices.find(c => c.label === "4")!.id }
  });
  await prisma.question.update({
    where: { id: q2.id },
    data: { correctId: q2.choices.find(c => c.label === "Paris")!.id }
  });

  console.log(`Seeded game with code: ${game.code}`);
}

main().finally(()=>prisma.$disconnect());
