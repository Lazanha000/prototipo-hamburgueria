// Estado da tela. As preferências ficam guardadas no aparelho (localStorage), por conveniência.
import type { SortKey, Mode, Group } from "./db/sorting";
import type { FeedParams } from "./db/store";

export type Route = "inicio" | "buscar" | "perfis" | "ajustes";
export type Period = "all" | "1" | "7" | "30" | "90" | "365";

interface Prefs {
  tagIds: string[]; sort: SortKey[]; mode: Mode; group: Group; kinds: string[]; period: Period;
  onlyUnseen: boolean; onlySaved: boolean; showHidden: boolean; minViews: number; view: "list" | "grid";
  sortByTag: Record<string, { sort: SortKey[]; mode: Mode; group: Group }>;
  recent: string[];
  searchSort: SortKey[]; searchMode: Mode;
}
const DEFAULTS: Prefs = {
  tagIds: [], sort: [{ crit: "date", dir: "desc", weight: 1 }], mode: "balanced", group: "", kinds: [], period: "all",
  onlyUnseen: false, onlySaved: false, showHidden: false, minViews: 0, view: "list", sortByTag: {}, recent: [], searchSort: [{ crit: "relevance", dir: "desc", weight: 1 }], searchMode: "balanced",
};
function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("mirante:prefs") || "{}") }; } catch { return { ...DEFAULTS }; }
}

export const prefs = $state<Prefs>(load());
export const ui = $state({
  route: "inicio" as Route,
  q: "",
  openPost: null as string | null,
  story: null as null | { ring: number; idx: number },
  tick: 0,            // muda quando os dados mudam: as telas consultam de novo
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  lastSync: 0,
  demo: false,
  connected: false,
  signedIn: false,
  persistent: true,
  locked: false,
});

export function savePrefs() {
  try { localStorage.setItem("mirante:prefs", JSON.stringify(prefs)); } catch { /* armazenamento bloqueado */ }
}
export const refresh = () => { ui.tick++; };

/** A pesquisa procura em todos os perfis, sem os filtros do Início, e tem a sua própria ordem. */
export function searchParams(q: string): FeedParams {
  return { q, sort: prefs.searchSort.map(k => ({ ...k })), mode: prefs.searchMode, group: "", showHidden: prefs.showHidden };
}

export function feedParams(extra: Partial<FeedParams> = {}): FeedParams {
  const since = prefs.period === "all" ? undefined : Date.now() - Number(prefs.period) * 864e5;
  return {
    tagIds: [...prefs.tagIds], kinds: [...prefs.kinds], since,
    onlyUnseen: prefs.onlyUnseen, onlySaved: prefs.onlySaved, showHidden: prefs.showHidden, minViews: prefs.minViews || 0,
    sort: prefs.sort.map(k => ({ ...k })), mode: prefs.mode, group: prefs.group,
    ...extra,
  };
}

/** Cada playlist lembra a sua ordenação. */
export function selectTags(ids: string[]) {
  const key = ids.length === 1 ? ids[0] : "";
  if (prefs.tagIds.length === 1) prefs.sortByTag[prefs.tagIds[0]] = { sort: prefs.sort, mode: prefs.mode, group: prefs.group };
  else prefs.sortByTag[""] = { sort: prefs.sort, mode: prefs.mode, group: prefs.group };
  prefs.tagIds = ids;
  const remembered = prefs.sortByTag[key];
  if (remembered) { prefs.sort = remembered.sort; prefs.mode = remembered.mode; prefs.group = remembered.group; }
  savePrefs();
}

let toastTimer: ReturnType<typeof setTimeout>;
export const toast = $state({ msg: "", action: null as null | { label: string; run: () => void } });
export function say(msg: string, action: { label: string; run: () => void } | null = null) {
  toast.msg = msg; toast.action = action;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.msg = ""; toast.action = null; }, action ? 6500 : 4200);
}

export function go(route: Route) {
  ui.route = route;
  if (location.hash.slice(1) !== route) history.replaceState(null, "", "#" + route);
}
