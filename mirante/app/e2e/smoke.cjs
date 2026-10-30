// Teste de ponta a ponta: abre o app, carrega a demonstração e passa por todas as telas.
// Uso: node e2e/smoke.cjs http://localhost:4173 pasta-das-fotos
const { chromium } = require("playwright");
const assert = require("assert");
(async () => {
  const [base = "http://localhost:4173", shots = "e2e/shots"] = process.argv.slice(2);
  require("fs").mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", d => d.accept("Amigos"));

  await page.goto(base);
  await page.getByText("Bem-vindo ao Mirante").waitFor();
  await page.screenshot({ path: `${shots}/0-boas-vindas.png` });
  await page.getByRole("button", { name: "Ver com dados de demonstração" }).click();
  await page.locator("li.v").first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${shots}/1-feed.png` });

  // ordenação: clique 1 = mais, clique 2 = menos; combinar
  const views = page.getByRole("button", { name: /Visualizações/ });
  await views.click();
  await page.getByRole("button", { name: /Mais vistos/ }).waitFor();
  await page.getByRole("button", { name: /Mais vistos/ }).click();
  await page.getByRole("button", { name: /Menos vistos/ }).waitFor();
  await page.getByRole("button", { name: /Menos vistos/ }).click();
  await page.getByRole("button", { name: /Mais vistos|Menos vistos/ }).waitFor({ state: "detached" });
  await views.click();
  await page.locator(".sortbar select").first().waitFor();
  await page.screenshot({ path: `${shots}/2-ordem-combinada.png` });

  // playlist
  await page.locator(".side .tags button.t", { hasText: "Cozinha" }).click();
  await page.getByRole("heading", { name: "Cozinha" }).waitFor();

  // post completo, comentários e desempenho
  await page.locator("li.v .cap").first().click();
  await page.getByRole("dialog").getByRole("tab", { name: "Comentários" }).waitFor();
  await page.locator(".cs li").first().waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Mais recentes", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mais recentes", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mais antigos", exact: true }).waitFor();
  await page.screenshot({ path: `${shots}/3-post.png` });
  await page.getByRole("tab", { name: "Desempenho" }).click();
  await page.getByText(/do normal deste perfil/).waitFor();
  await page.screenshot({ path: `${shots}/4-desempenho.png` });
  await page.keyboard.press("Escape");

  // stories
  await page.locator(".strip .ring").first().click();
  await page.locator(".viewer .frame").waitFor();
  await page.screenshot({ path: `${shots}/5-story.png` });
  await page.keyboard.press("Escape");

  // pesquisa sem acento, por prefixo
  await page.getByRole("button", { name: "Buscar" }).first().click();
  await page.locator("#q").fill("receita avo");
  await page.getByText(/Achei na legenda/).first().waitFor();
  const ms = await page.locator(".status .soft").first().textContent();
  console.log("pesquisa:", ms);
  await page.screenshot({ path: `${shots}/6-busca.png` });

  // perfis: colar vários
  await page.getByRole("button", { name: "Perfis" }).first().click();
  await page.locator("#paste").fill("https://www.instagram.com/perfil.novo/\n@outro_perfil\neu@gmail.com");
  await page.getByRole("button", { name: "Adicionar perfis" }).click();
  await page.getByText("@perfil.novo").first().waitFor();
  await page.getByText(/2 perfis adicionados/).waitFor();
  await page.screenshot({ path: `${shots}/7-perfis.png` });

  // celular, escuro
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true });
  m.on("pageerror", e => errors.push(e.message));
  await m.goto(base + "#inicio");
  await m.getByRole("button", { name: "Ver com dados de demonstração" }).click();
  await m.locator("li.v").first().waitFor({ timeout: 20000 });
  await m.screenshot({ path: `${shots}/8-celular-escuro.png` });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, "rolagem horizontal no celular");
  await m.locator("li.v .cap").first().click();
  await m.getByRole("tab", { name: "Comentários" }).waitFor();
  await m.screenshot({ path: `${shots}/9-celular-post.png` });

  // persistência: recarrega e os dados continuam
  await page.goto(base + "#inicio"); await page.reload();
  await page.locator("li.v").first().waitFor({ timeout: 20000 });

  await browser.close();
  assert.deepStrictEqual(errors, [], "erros no console: " + errors.join(" | "));
  console.log("OK");
})().catch(e => { console.error(e); process.exit(1); });
