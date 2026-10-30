// Liga a coleta ao app: roda ao abrir, de tempos em tempos enquanto o app está na tela, e a pedido.
import { db } from "../db/client";
import { collector as cs, refresh, ui } from "../state.svelte";
import { Collector, type Db } from "./collector";
import { isNative, nativeNet } from "./net";

export const canCollect = isNative();
let lastTry = 0;

export async function collect(force = false) {
  if (!canCollect || cs.running) return;
  cs.running = true; cs.done = 0; cs.total = 0; cs.message = "";
  lastTry = Date.now();
  let pending = 0;
  const soon = () => { if (!pending) pending = window.setTimeout(() => { pending = 0; refresh(); }, 600); };  // posts vão aparecendo, sem piscar
  try {
    const c = new Collector(db as unknown as Db, nativeNet, {
      onProgress: p => { cs.done = p.done; cs.total = p.total; cs.current = p.handle; },
      onChange: soon,
    });
    const r = await c.run(force);
    cs.state = r.state === "idle" ? "ok" : r.state; cs.message = r.message; cs.until = r.until ?? 0; cs.last = Date.now();
    if (r.state === "ok") ui.lastSync = Date.now();
  } catch (e) {
    cs.message = "Tive um erro e tento de novo mais tarde: " + ((e as Error).message || "desconhecido");
  } finally {
    cs.running = false; refresh();
  }
}

/** Chamar uma vez ao abrir o app. Devolve a função que desliga tudo. */
export function startCollecting(): () => void {
  if (!canCollect) return () => {};
  collect();
  const tick = () => { if (document.visibilityState === "visible" && Date.now() - lastTry > 10 * 60_000) collect(); };
  const id = window.setInterval(tick, 60_000);
  document.addEventListener("visibilitychange", tick);
  return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
}
