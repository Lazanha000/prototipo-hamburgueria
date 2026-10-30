<script lang="ts">
  import { db } from "../db/client";
  import { ui, say, refresh, collector as cs } from "../state.svelte";
  import { collect, canCollect } from "../ig/runtime";
  import { loadConfig, saveConfig, connect, session, sendMagicLink, syncNow, command, commandResult, workerStatus, client } from "../sync";
  import { ago, plural } from "../format";

  let cfg = $state(loadConfig() ?? { url: "", key: "" });
  let email = $state("");
  let user = $state<string | null>(null);
  let status = $state<Awaited<ReturnType<typeof workerStatus>>>(null);
  let counts = $state<{ profiles: number; posts: number; pending: number } | null>(null);
  let ig = $state({ username: "", password: "", code: "", waiting: false, needCode: false, loginId: 0 });
  let interval = $state("180");
  $effect(() => { db.meta("ig:interval_min").then(v => { if (v) interval = v; }); });
  async function setInterval_(v: string) { interval = v; await db.setMeta("ig:interval_min", v); say("Combinado: confiro os perfis a cada " + (Number(v) / 60) + " h."); }
  async function resetPause() { await db.setMeta("ig:blocked_until", "0"); await db.setMeta("ig:strikes", "0"); cs.state = "ok"; say("Pausa desfeita. Tento de novo, com calma."); collect(true); }
  let theme = $state(localStorage.getItem("mirante:theme") || "auto");

  $effect(() => { void ui.tick; db.status().then(s => (counts = s)); });
  $effect(() => {
    if (!ui.connected) return;
    session().then(s => (user = s?.user.email ?? null));
    const load = () => workerStatus().then(s => (status = s)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  });

  function applyTheme(v: string) {
    theme = v;
    try { localStorage.setItem("mirante:theme", v); } catch { /* sem armazenamento */ }
    if (v === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = v;
  }
  async function saveConn() {
    const c = cfg.url.trim() && cfg.key.trim() ? { url: cfg.url.trim().replace(/\/$/, ""), key: cfg.key.trim() } : null;
    saveConfig(c);
    ui.connected = !!connect(c);
    say(c ? "Supabase configurado. Agora entre com o seu e-mail." : "Supabase desligado. O app continua com o que está no aparelho.");
  }
  async function magic() {
    try { await sendMagicLink(email.trim()); say("Mandei um link para o seu e-mail. Abra-o neste aparelho."); }
    catch (e) { say("Não consegui mandar o link: " + (e as Error).message); }
  }
  async function signOut() { await client()?.auth.signOut(); user = null; ui.signedIn = false; }
  async function sync() {
    ui.syncing = true;
    try { const r = await syncNow(); ui.lastSync = Date.now(); refresh(); say(`Sincronizado: ${r.pulled} novidades, ${r.pushed} mudanças enviadas.`); }
    catch (e) { say("A sincronização falhou: " + (e as Error).message); }
    ui.syncing = false;
  }
  async function wait(id: number) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const r = await commandResult(id);
      if (!r || r.status === "pending" || r.status === "running") continue;
      return r;
    }
    return { status: "timeout", result: null };
  }
  async function igLogin() {
    if (!ig.username || !ig.password) return;
    ig.waiting = true;
    try {
      const c = await command("ig_login", { username: ig.username.trim().replace(/^@/, ""), password: ig.password });
      ig.password = "";
      const r = await wait(c.id);
      if (r.status === "needs_code") { ig.needCode = true; ig.loginId = c.id; say("O Instagram pediu um código de verificação. Veja o SMS ou o app autenticador."); }
      else if (r.status === "done") say("Conta conectada. A coleta começa em instantes.");
      else say("Não deu certo: " + ((r.result?.message as string) || "o trabalhador não respondeu. Ele está ligado?"));
    } catch (e) { say("Erro: " + (e as Error).message); }
    ig.waiting = false;
  }
  async function igCode() {
    ig.waiting = true;
    try {
      const c = await command("ig_code", { code: ig.code.trim(), login_id: ig.loginId });
      const r = await wait(c.id);
      if (r.status === "done") { ig.needCode = false; ig.code = ""; say("Conta conectada. A coleta começa em instantes."); }
      else say("Código não aceito: " + ((r.result?.message as string) || "tente de novo."));
    } catch (e) { say("Erro: " + (e as Error).message); }
    ig.waiting = false;
  }
  async function refreshNow() {
    try { await command("refresh"); say("Pedi uma atualização. Em alguns minutos as novidades aparecem."); } catch (e) { say("Erro: " + (e as Error).message); }
  }
  async function demo() {
    if (counts?.profiles && !ui.demo && !confirm("Isso apaga os dados deste aparelho e põe dados de demonstração. Continuar?")) return;
    const r = await db.seedDemo();
    ui.demo = true; refresh();
    say(`Demonstração pronta: ${r.profiles} perfis e ${r.posts} posts inventados.`);
  }
  async function wipe() {
    if (!confirm("Apagar tudo o que está guardado neste aparelho? O que está na nuvem não é apagado.")) return;
    await db.wipe(); await db.setMeta("demo", "0");
    ui.demo = false; refresh(); say("Aparelho limpo.");
  }
</script>

<h2>Ajustes</h2>

<section>
  <h3>Coleta neste aparelho</h3>
  {#if canCollect}
    <p class="soft">O app confere os perfis sozinho, usando a sua internet (sem servidor e sem custo). Ele trabalha enquanto está aberto: fechado, o Android não deixa. Posts normais não se perdem; só se o app ficar dias fechado, ele traz apenas os 12 mais recentes de cada perfil.</p>
    <div class="row" role="radiogroup" aria-label="Frequência">
      <span class="soft">Conferir a cada</span>
      {#each [["60", "1 h"], ["180", "3 h"], ["360", "6 h"], ["720", "12 h"]] as [v, l] (v)}
        <label class="pill"><input type="radio" name="every" checked={interval === v} onchange={() => setInterval_(v)} /><span>{l}</span></label>
      {/each}
    </div>
    <div class="row">
      <button class="btn primary" onclick={() => collect(true)} disabled={cs.running}>{cs.running ? "Verificando…" : "Atualizar agora"}</button>
      {#if cs.state === "blocked"}<button class="btn" onclick={resetPause}>Tentar já, sem esperar a pausa</button>{/if}
    </div>
    {#if cs.message}<p class="soft">{cs.message}</p>{/if}
    <p class="soft small">Limites desta versão: só perfis públicos, até 12 posts recentes por perfil, sem stories e sem o texto dos comentários (isso pede uma conta do Instagram conectada, que vem depois).</p>
  {:else}
    <p class="soft">A coleta de posts acontece no app do Android. Aqui no navegador você vê a demonstração e o que vier de outro aparelho pela sincronização.</p>
  {/if}
</section>

<details class="adv">
  <summary>Avançado: sincronizar com outros aparelhos (opcional, grátis)</summary>
<section>
  <h3>Nuvem (Supabase)</h3>
  <p class="soft">É o que deixa o celular funcionar sem o PC: o trabalhador grava lá e o app copia para o aparelho.</p>
  <div class="grid">
    <label class="field">Endereço do projeto <input bind:value={cfg.url} placeholder="https://xxxx.supabase.co" autocomplete="off" /></label>
    <label class="field">Chave pública (anon / publishable) <input bind:value={cfg.key} placeholder="eyJhbGciOi… ou sb_publishable_…" autocomplete="off" /></label>
  </div>
  <div class="row"><button class="btn primary" onclick={saveConn}>Salvar</button>{#if ui.connected}<span class="ok">✓ configurado</span>{/if}</div>

  {#if ui.connected}
    {#if user}
      <p>Entrou como <b>{user}</b>. <button class="linkish" onclick={signOut}>Sair</button></p>
      <div class="row">
        <button class="btn" onclick={sync} disabled={ui.syncing}>{ui.syncing ? "Sincronizando…" : "Sincronizar agora"}</button>
        <span class="soft">{ui.lastSync ? `última vez ${ago(ui.lastSync)}` : ""}{counts?.pending ? ` · ${plural(counts.pending, "mudança esperando envio", "mudanças esperando envio")}` : ""}</span>
      </div>
    {:else}
      <div class="row">
        <label class="field grow">Seu e-mail <input type="email" bind:value={email} placeholder="voce@exemplo.com" autocomplete="email" /></label>
        <button class="btn primary" onclick={magic} disabled={!email.includes("@")}>Mandar link de entrada</button>
      </div>
    {/if}
  {/if}
</section>

{#if ui.connected && user}
  <section>
    <h3>Conta secundária do Instagram</h3>
    <p class="soft">É ela que o trabalhador usa para ler posts, stories e comentários. Nunca use a sua conta principal. A senha vai direto para o trabalhador e não fica guardada; ele guarda só a sessão, criptografada.</p>
    {#if status}
      <p class="state">
        {#if status.session_ok}<span class="ok">● conectada como @{status.ig_user}</span>{:else}<span class="warn">● sem conta conectada</span>{/if}
        · {status.message || status.state}
        {#if status.last_run_at} · última coleta {ago(status.last_run_at)}{/if}
        {#if status.paused_until && status.paused_until > Date.now()} · pausado até {new Date(status.paused_until).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{/if}
      </p>
    {:else}
      <p class="warn">O trabalhador ainda não deu sinal de vida. Ele precisa estar rodando no servidor (veja o guia de instalação).</p>
    {/if}
    {#if ig.needCode}
      <div class="row">
        <label class="field">Código de verificação <input bind:value={ig.code} inputmode="numeric" autocomplete="one-time-code" /></label>
        <button class="btn primary" onclick={igCode} disabled={ig.waiting || !ig.code}>{ig.waiting ? "Conferindo…" : "Enviar código"}</button>
      </div>
    {:else}
      <div class="grid">
        <label class="field">Usuário <input bind:value={ig.username} autocomplete="off" placeholder="conta.secundaria" /></label>
        <label class="field">Senha <input type="password" bind:value={ig.password} autocomplete="off" /></label>
      </div>
      <div class="row">
        <button class="btn primary" onclick={igLogin} disabled={ig.waiting}>{ig.waiting ? "Entrando… (pode levar 1 min)" : status?.session_ok ? "Trocar de conta" : "Conectar conta"}</button>
        <button class="btn" onclick={refreshNow}>Atualizar agora</button>
      </div>
    {/if}
  </section>
{/if}

</details>

<section>
  <h3>Aparência</h3>
  <div class="row" role="radiogroup" aria-label="Tema">
    {#each [["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]] as [v, l] (v)}
      <label class="pill"><input type="radio" name="theme" checked={theme === v} onchange={() => applyTheme(v)} /><span>{l}</span></label>
    {/each}
  </div>
</section>

<section>
  <h3>Neste aparelho</h3>
  <p class="soft">{counts ? `${plural(counts.profiles, "perfil", "perfis")}, ${plural(counts.posts, "post", "posts")} guardados.` : ""}
    {ui.persistent ? "Os dados ficam guardados mesmo fechando o app." : "Este navegador não permite guardar o banco: os dados somem ao fechar a aba."}</p>
  <div class="row">
    <button class="btn" onclick={demo}>{ui.demo ? "Recriar demonstração" : "Ver com dados de demonstração"}</button>
    <button class="btn quiet" onclick={wipe}>Apagar dados deste aparelho</button>
  </div>
</section>

<style>
  section { padding: 18px 0; border-top: 1px solid var(--line); }
  h3 { margin: 0 0 4px; font-size: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px 16px; margin: 10px 0; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin: 10px 0; }
  .grow { flex: 1; min-width: 220px; }
  .ok { color: var(--green); font-weight: 700; }
  .warn { color: var(--danger); }
  .state { font-size: 15px; }
  .small { font-size: 14px; }
  .adv { margin: 8px 0; border-top: 1px solid var(--line); padding-top: 14px; }
  .adv > summary { cursor: pointer; color: var(--soft); width: max-content; }
</style>
