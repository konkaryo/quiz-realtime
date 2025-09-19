import { PrismaClient } from "@prisma/client"; 
import type { Client, EnergyCheck } from "../../types";

/* ---------------------------------------------------------------------------------------- */
export async function spendEnergy(prisma: PrismaClient, client: Client, cost: number) : Promise<EnergyCheck> {
    const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
    if (!pg) return { ok: false };

    if (pg.energy < cost) { return { ok: false }; }

    const newEnergy = pg.energy - cost;

    await prisma.playerGame.update({ where: { id: client.playerGameId }, data: { energy: newEnergy } });
    return { ok: true, energy: newEnergy };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export async function addEnergy(prisma: PrismaClient, client: Client, gain: number) : Promise<EnergyCheck> {
    const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
    if (!pg) { return { ok: false }; };

    const MAX_ENERGY = Number(process.env.MAX_ENERGY || 100);
    const newEnergy = Math.max(0, Math.min(MAX_ENERGY, pg.energy + gain))
        
    return { ok: true, energy: newEnergy };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export async function getEnergy(prisma: PrismaClient, client: Client) : Promise<EnergyCheck> {
    const pg = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { energy: true } });
    if (!pg) return { ok: false };

    return { ok: true, energy: pg.energy };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function scoreMultiplier(energy: number) {
    const MAX_ENERGY  = Number(process.env.MAX_ENERGY || 100);
    const steps       = Math.floor(Math.max(0, Math.min(MAX_ENERGY, energy)) / 10);
    return 1 + steps * 0.1;
}
/* ---------------------------------------------------------------------------------------- */