// Ponte entre a tela e o Web Worker do banco. Cada chamada vira uma Promise.
import type { Store } from "./store";
import DbWorker from "./db.worker?worker";

type Methods = {
  [K in keyof Store as Store[K] extends (...a: never[]) => unknown ? K : never]: Store[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never;
};
export interface Extra {
  status(): Promise<{ persistent: boolean; locked: boolean; demo: boolean; profiles: number; posts: number; saved: number; pending: number }>;
  seedDemo(): Promise<{ profiles: number; posts: number; stories: number }>;
  openPost: Methods["post"];
}

const worker = new DbWorker();
let seq = 0;
const waiting = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
  const w = waiting.get(e.data.id);
  if (!w) return;
  waiting.delete(e.data.id);
  if (e.data.error) w.fail(new Error(e.data.error)); else w.ok(e.data.result);
};

export const db = new Proxy({} as Methods & Extra, {
  get: (_, method: string) => (...args: unknown[]) =>
    new Promise((ok, fail) => {
      const id = ++seq;
      waiting.set(id, { ok, fail });
      worker.postMessage({ id, method, args });
    }),
});
