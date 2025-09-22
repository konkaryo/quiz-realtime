"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spendEnergy = spendEnergy;
exports.addEnergy = addEnergy;
exports.getEnergy = getEnergy;
exports.scoreMultiplier = scoreMultiplier;
/* ---------------------------------------------------------------------------------------- */
async function spendEnergy(prisma, client, cost) {
    const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
    if (!pg)
        return { ok: false };
    if (pg.energy < cost) {
        return { ok: false };
    }
    const newEnergy = pg.energy - cost;
    await prisma.playerGame.update({ where: { id: client.playerGameId }, data: { energy: newEnergy } });
    return { ok: true, energy: newEnergy };
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function addEnergy(prisma, client, gain) {
    const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
    if (!pg) {
        return { ok: false };
    }
    ;
    const MAX_ENERGY = Number(process.env.MAX_ENERGY || 100);
    const newEnergy = Math.max(0, Math.min(MAX_ENERGY, pg.energy + gain));
    return { ok: true, energy: newEnergy };
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function getEnergy(prisma, client) {
    const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
    if (!pg)
        return { ok: false };
    return { ok: true, energy: pg.energy };
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
function scoreMultiplier(energy) {
    const MAX_ENERGY = Number(process.env.MAX_ENERGY || 100);
    const steps = Math.floor(Math.max(0, Math.min(MAX_ENERGY, energy)) / 10);
    return 1 + steps * 0.1;
}
/* ---------------------------------------------------------------------------------------- */ 
