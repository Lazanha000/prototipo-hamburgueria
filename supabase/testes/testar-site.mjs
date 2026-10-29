// Teste de ponta a ponta: o site de verdade no Chromium (Playwright), com CONFIG.api ligado
// e as chamadas ao Supabase respondidas pelo schema.sql num Postgres local (postgrest-falso.mjs).
// Rode DEPOIS do testar-banco.mjs (ele cria o banco). Uso:
//   PGHOST=/tmp PGPORT=5499 PGUSER=postgres PGDATABASE=teste_supabase node supabase/testes/testar-site.mjs

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sql, atender } from './postgrest-falso.mjs';
import { servirSite, SUPA } from './servidor.mjs';

process.env.PGDATABASE ||= 'teste_supabase';
const { chromium } = createRequire(import.meta.url)('playwright');
const admin = (c) => {
  const r = sql(c, { papel: 'postgres' });
  if (!r.ok) throw new Error(`${r.code} ${r.message}`);
  return r.saida;
};

const servidor = await servirSite();
const SITE = servidor.url;

const navegador = await chromium.launch();
let ok = 0;
const falhas = [];
async function teste(nome, fn) {
  try {
    await fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(nome);
    console.log(`  FALHOU  ${nome}\n        ${String(e.stack || e).split('\n').slice(0, 5).join('\n        ')}`);
  }
}

let n = 1;
async function novoContexto() {
  const ctx = await navegador.newContext({ serviceWorkers: 'block', locale: 'pt-BR', viewport: { width: 390, height: 844 } });
  const ip = `203.0.113.${n++}`;
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const r = atender(req.method(), req.url().slice(`${SUPA}/rest/v1/`.length), req.postData(), { ip });
    await route.fulfill({ status: r.status, body: r.corpo, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'whatsapp', contentType: 'text/plain' }));
  return ctx;
}

const erros = [];
const vigiar = (page) => {
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
};

// estado do banco para o teste: loja aberta o dia todo, preço do X-Burger mudado, X-Bacon esgotado
admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) select d, '00:00', '23:59:59' from generate_series(1, 7) d;
  update public.produtos set preco = 1990 where id = 'x-burger'; update public.produtos set disponivel = false where id = 'x-bacon';
  update public.loja set aberta_manual = true, bloquear_fechado = true`);

console.log('Site com Supabase:');
const ctx = await novoContexto();
const page = await ctx.newPage();
vigiar(page);
let codigo;
let link;

await teste('cardápio vem do banco (preço novo e item esgotado)', async () => {
  await page.goto(`${SITE}#cardapio`);
  const burger = page.locator('article.prod', { hasText: 'X-Burger' }).first();
  await burger.waitFor();
  assert.match(await burger.innerText(), /19,90/);
  const bacon = page.locator('article.prod', { hasText: 'X-Bacon' }).first();
  assert.match(await bacon.getAttribute('class'), /is-esgotado/);
});

await teste('pedido confirmado é registrado no banco com o preço do banco', async () => {
  await page.evaluate(() => localStorage.setItem('modelo:carrinho:v1', JSON.stringify([
    { produtoId: 'x-tudo', escolhas: {}, remover: ['Cebola'], obs: '', qtd: 1 },
    { produtoId: 'fritas', escolhas: { tamanho: ['m'] }, remover: [], obs: '', qtd: 1 },
  ])));
  await page.goto(`${SITE}#finalizar`);
  await page.reload();
  await page.locator('#f-nome').waitFor();
  // o preço muda no banco depois que o cliente abriu a página: vale o do banco
  admin(`update public.produtos set preco = 3000 where id = 'x-tudo'`);
  await page.locator('input[name="modo"][value="entrega"]').check();
  await page.fill('#f-nome', 'Cliente Teste');
  await page.fill('#f-telefone', '33988776655');
  await page.fill('#f-cep', '39800000');
  await page.fill('#f-cidade', 'Teófilo Otoni');
  await page.fill('#f-endereco', 'Rua das Flores');
  await page.fill('#f-numero', '42');
  await page.fill('#f-bairro', 'Centro');
  await page.locator('input[name="pagamento"][value="pix"]').check();
  await page.waitForTimeout(3200);   // a trava anti-robô recusa formulário preenchido em menos de 3 s
  await page.click('.btn-enviar');
  await page.getByRole('heading', { name: 'Pedido registrado na loja' }).waitFor({ timeout: 10000 });
  codigo = (await page.locator('#codigo-txt').innerText()).trim();
  assert.match(codigo, /^MO-[A-Z0-9]{5}$/);
  const linha = JSON.parse(admin(`select row_to_json(p) from public.pedidos p where codigo = '${codigo}'`));
  // X-Tudo 30,00 (preço novo) + Fritas média 22,00 + taxa 5,00
  assert.equal(linha.total, 5700);
  assert.equal(linha.cliente_nome, 'Cliente Teste');
  assert.match(await page.locator('#pix-h').innerText(), /57,00/);
  assert.match(await page.locator('.etapa.is-atual').innerText(), /Pedido recebido/);
  link = await page.evaluate(() => document.querySelector('.btn-zap')?.href || '');
  assert.match(decodeURIComponent(link), /Total: R\$\s57,00/);
});

await teste('"Atualizar status" mostra a etapa que a loja marcou', async () => {
  admin(`update public.pedidos set status = 'pronto' where codigo = '${codigo}'`);
  await page.click('[data-atualizar]');
  await page.locator('.etapa.is-atual', { hasText: 'Pronto' }).waitFor({ timeout: 5000 });
});

await teste('link de acompanhamento abre o pedido em outro aparelho', async () => {
  const token = admin(`select a.token from public.pedidos_acesso a join public.pedidos p on p.id = a.pedido_id where p.codigo = '${codigo}'`);
  const outro = await novoContexto();
  const p2 = await outro.newPage();
  vigiar(p2);
  await p2.goto(`${SITE}#pedido?c=${codigo}&t=${token}`);
  await p2.locator('.status-codigo', { hasText: codigo }).waitFor({ timeout: 5000 });
  assert.match(await p2.locator('.etapa.is-atual').innerText(), /Pronto/);
  await p2.goto(`${SITE}#pedido?c=${codigo}&t=${'B'.repeat(32)}`);
  await p2.reload();
  await p2.getByText(/não encontr/i).first().waitFor({ timeout: 5000 });
  await outro.close();
});

await teste('loja fechada pelo banco: site avisa e não deixa finalizar', async () => {
  admin(`update public.loja set aberta_manual = false`);
  const c3 = await novoContexto();
  const p3 = await c3.newPage();
  vigiar(p3);
  await p3.goto(SITE);
  await p3.evaluate(() => localStorage.setItem('modelo:carrinho:v1', JSON.stringify([{ produtoId: 'x-tudo', escolhas: {}, remover: [], obs: '', qtd: 1 }])));
  await p3.goto(`${SITE}#finalizar`);
  await p3.reload();
  await p3.getByRole('heading', { name: 'Loja fechada' }).waitFor({ timeout: 5000 });
  admin(`update public.loja set aberta_manual = true`);
  await c3.close();
});

await teste('nenhum erro no console', async () => {
  assert.deepEqual(erros, []);
});

await navegador.close();
servidor.fechar();
console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) process.exit(1);
