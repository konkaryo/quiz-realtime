// sfx.ts — précharge en RAM et rejoue instantanément
let ctx: AudioContext | null = null;
let correctBuf: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

const opusUrl = new URL("./assets/sfx/correct.opus", import.meta.url).href;
const mp3Url  = new URL("./assets/sfx/correct.mp3",  import.meta.url).href;

async function loadBuffer(url: string) {
  const res = await fetch(url, { cache: "force-cache" });
  const arr = await res.arrayBuffer();
  return (ctx as AudioContext).decodeAudioData(arr);
}

/** À appeler UNE FOIS après la 1re interaction utilisateur (règles autoplay). */
export async function initSfx() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  if (loading) return loading;

  loading = (async () => {
    try {
      correctBuf = await loadBuffer(opusUrl);
    } catch {
      // Safari fallback
      correctBuf = await loadBuffer(mp3Url);
    }
  })();

  return loading;
}

/** Joue le son "bonne réponse" (si chargé). */
export function playCorrect() {
  if (!ctx || !correctBuf) return;
  // Reprise si l’OS a suspendu le contexte
  if (ctx.state === "suspended") ctx.resume();

  const src = ctx.createBufferSource();
  src.buffer = correctBuf;

  // (optionnel) gain si tu veux ajuster le volume
  const gain = ctx.createGain();
  gain.gain.value = 1;

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
}
