// Web Worker que guarda o banco SQLite do aparelho (persistido no OPFS do navegador).
// A interface conversa com ele por mensagens; nada de banco roda na thread da tela.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Store, type RawDB } from "./store";
import { seedDemo, demoDetails } from "../demo";

let store: Store;
let persistent = false;
let locked = false;  // o Mirante já está aberto em outra aba (o banco só abre em uma por vez)

/** Segura uma trava enquanto este worker existir. Ao recarregar a página, a aba antiga leva
 *  um instante para soltar a trava: espera até 5 s antes de concluir que há outra aba aberta. */
function holdLock(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise(ok => {
    navigator.locks.request("mirante-db", { signal: AbortSignal.timeout(5000) }, () => {
      ok(true);
      return new Promise(() => {});
    }).catch(() => ok(false));
  });
}

const ready = (async () => {
  const sqlite3 = await sqlite3InitModule();
  let db: unknown;
  try {
    if (!(await holdLock())) { locked = true; throw new Error("locked"); }
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "mirante-pool", directory: ".mirante" });
    db = new pool.OpfsSAHPoolDb("/mirante.db");
    persistent = true;
  } catch {
    db = new sqlite3.oo1.DB(":memory:", "c");  // navegador sem OPFS: funciona, mas não guarda entre aberturas
  }
  store = new Store(db as RawDB);
  store.init();
})();

const extra: Record<string, (...a: never[]) => unknown> = {
  status: () => ({ persistent, locked, demo: store.meta("demo") === "1", ...store.counts() }),
  seedDemo: () => { store.wipe(); return seedDemo(store); },
  /** Post completo. Na demonstração, inventa comentários e métricas na primeira abertura. */
  openPost: (id: string) => {
    const p = store.post(id);
    if (p && store.meta("demo") === "1" && !store.metrics(id).length) demoDetails(store, p);
    return p;
  },
};

self.onmessage = async (e: MessageEvent<{ id: number; method: string; args: unknown[] }>) => {
  const { id, method, args } = e.data;
  try {
    await ready;
    const fn = extra[method] ?? (store as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    if (typeof fn !== "function") throw new Error("método desconhecido: " + method);
    const result = await (fn as (...a: unknown[]) => unknown).apply(extra[method] ? null : store, args);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
