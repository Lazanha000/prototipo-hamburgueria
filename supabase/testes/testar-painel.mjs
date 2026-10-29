// Teste de ponta a ponta do painel (admin.html) no Chromium (Playwright):
// login pelo Auth, pedidos pela API com a RLS do schema.sql (Postgres local, postgrest-falso.mjs)
// e a Realtime imitada por um WebSocket falso (routeWebSocket do Playwright).
// Rode DEPOIS do testar-banco.mjs (ele cria o banco). Uso:
//   PGHOST=/tmp PGPORT=5499 PGUSER=postgres PGDATABASE=teste_supabase node supabase/testes/testar-painel.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { sql, atender, atenderAuth, uidDoToken, auth } from './postgrest-falso.mjs';
import { servirSite, SUPA } from './servidor.mjs';

process.env.PGDATABASE ||= 'teste_supabase';
const { chromium } = createRequire(import.meta.url)('playwright');
const admin = (c) => {
  const r = sql(c, { papel: 'postgres' });
  if (!r.ok) throw new Error(`${r.code} ${r.message}\n${c}`);
  return r.saida;
};

const servidor = await servirSite();
const PAINEL = `${servidor.url}admin.html`;
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

// ---------- banco: loja aberta o dia todo, uma pessoa da equipe e uma de fora ----------
admin(`delete from public.horarios; insert into public.horarios (dia, abre, fecha) select d, '00:00', '23:59:59' from generate_series(1, 7) d;
  update public.loja set aberta_manual = true, bloquear_fechado = true; update public.produtos set disponivel = true;
  delete from public.pedidos;
  delete from public.equipe where user_id in (select id from auth.users where email in ('cozinha@teste', 'intruso@teste'));
  delete from auth.users where email in ('cozinha@teste', 'intruso@teste')`);
const uidCozinha = admin(`insert into auth.users (email, senha) values ('cozinha@teste', 'senha-boa-123') returning id`);
admin(`insert into auth.users (email, senha) values ('intruso@teste', 'senha-boa-123')`);
admin(`insert into public.equipe (user_id, nome) values ('${uidCozinha}', 'Cozinha')`);

let telN = 0;
let ipN = 1;
// pedido feito pelo site (função criar_pedido, como visitante)
function novoPedido(extra = {}) {
  const dados = {
    modo: 'retirada',
    cliente: { nome: 'Joana Prado', telefone: `3398765${String(telN++).padStart(4, '0')}` },
    pagamento: { forma: 'pix' },
    itens: [{ produtoId: 'x-tudo', qtd: 2, escolhas: {}, remover: ['Cebola'], obs: 'bem passado' }],
    ...extra,
  };
  const r = atender('POST', 'rpc/criar_pedido', JSON.stringify({ dados, chave: crypto.randomUUID() }), { ip: `198.18.0.${ipN++}` });
  assert.equal(r.status, 200, r.corpo);
  return JSON.parse(r.corpo);
}
const linhaPedido = (codigo) => JSON.parse(admin(`select row_to_json(p) from public.pedidos p where codigo = '${codigo}'`));

// ---------- Realtime falsa: entra no canal com o token; manda as mudanças só para a equipe ----------
const canais = new Set();
function emitir(type, record) {
  for (const c of canais) {
    if (!c.uid || admin(`select count(*) from public.equipe where user_id = '${c.uid}'`) !== '1') continue;
    c.ws.send(JSON.stringify({ topic: c.topic, event: 'postgres_changes', ref: null,
      payload: { data: { type, record, schema: 'public', table: 'pedidos', commit_timestamp: new Date().toISOString() }, ids: [1] } }));
  }
}

const erros = [];
async function novoContexto({ tempoReal = true } = {}) {
  const ctx = await navegador.newContext({ serviceWorkers: 'block', locale: 'pt-BR', viewport: { width: 1100, height: 900 } });
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    const token = (req.headers().authorization || '').replace(/^Bearer /, '') || null;
    const caminho = req.url().slice(SUPA.length);
    const r = caminho.startsWith('/auth/v1/')
      ? atenderAuth(req.method(), caminho.slice('/auth/v1/'.length), req.postData(), token)
      : atender(req.method(), caminho.slice('/rest/v1/'.length), req.postData(), { token });
    await route.fulfill({ status: r.status, body: r.corpo, contentType: 'application/json', headers: cors });
  });
  await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    if (!tempoReal) { ws.close(); return; }
    const canal = { ws, uid: null, topic: null };
    ws.onMessage((txt) => {
      const m = JSON.parse(txt);
      const responder = (status) => ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status, response: {} } }));
      if (m.topic === 'phoenix' && m.event === 'heartbeat') responder('ok');
      else if (m.event === 'phx_join') {
        canal.uid = uidDoToken(m.payload?.access_token);
        canal.topic = m.topic;
        responder(canal.uid ? 'ok' : 'error');
        if (canal.uid) canais.add(canal);
      } else if (m.event === 'access_token') canal.uid = uidDoToken(m.payload?.access_token) || canal.uid;
    });
    ws.onClose(() => canais.delete(canal));
  });
  return ctx;
}
const vigiar = (page) => {
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => {
    // 400 do login com senha errada e 403/401 de propósito aparecem como erro de rede no console: não contam
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 40[0-4]/.test(m.text())) erros.push(m.text());
  });
};
async function entrar(page, email = 'cozinha@teste', senha = 'senha-boa-123') {
  await page.goto(PAINEL);
  await page.fill('#pn-email', email);
  await page.fill('#pn-senha', senha);
  await page.click('#pn-form-login button[type=submit]');
}
const cartao = (page, codigo) => page.locator('.pn-pedido', { hasText: codigo });

console.log('Painel:');

await teste('sem banco configurado: explica o que falta', async () => {
  const ctx = await novoContexto();
  const original = await readFile(new URL('../../js/config.js', import.meta.url), 'utf8');
  await ctx.route('**/js/config.js', (route) => route.fulfill({ body: original, contentType: 'text/javascript' }));
  const page = await ctx.newPage();
  vigiar(page);
  await page.goto(PAINEL);
  await page.getByText(/precisa do banco de pedidos ligado/).waitFor();
  await ctx.close();
});

const ctx = await novoContexto();
const page = await ctx.newPage();
vigiar(page);
page.on('dialog', (d) => d.accept());
const pedidoA = novoPedido({
  modo: 'entrega',
  entrega: { cep: '39800000', cidade: 'Teófilo Otoni', endereco: 'Rua das Flores', numero: '42', complemento: 'casa 2', bairro: 'Centro' },
  pagamento: { forma: 'dinheiro', trocoPara: 10000 },
  obs: 'Interfone quebrado',
});

await teste('senha errada não entra', async () => {
  await entrar(page, 'cozinha@teste', 'errada');
  await page.locator('#pn-login-erro', { hasText: 'E-mail ou senha errados.' }).waitFor();
});

await teste('usuário fora da equipe não entra', async () => {
  await entrar(page, 'intruso@teste');
  await page.locator('#pn-login-erro', { hasText: /não tem acesso ao painel/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('modelo:painel:v1')), null);
});

await teste('equipe entra e vê o pedido em andamento com tudo da cozinha e da entrega', async () => {
  await entrar(page);
  const c = cartao(page, pedidoA.codigo);
  await c.waitFor();
  const txt = (await c.innerText()).replace(/\u00a0/g, ' ');
  for (const trecho of ['Joana Prado', 'Rua das Flores, 42', 'casa 2', 'Centro, Teófilo Otoni', '2x', 'X-Tudo', 'Sem cebola',
    'Obs.: bem passado', 'Interfone quebrado', 'Dinheiro', 'Troco para R$ 100,00']) assert.ok(txt.includes(trecho), `faltou "${trecho}" em:\n${txt}`);
  // troco = 100,00 - total que o BANCO calculou
  const troco = (10000 - linhaPedido(pedidoA.codigo).total) / 100;
  assert.ok(txt.includes(`levar R$ ${troco.toFixed(2).replace('.', ',')}`), txt);
  await page.locator('#pn-conexao', { hasText: 'Ao vivo' }).waitFor();
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  assert.equal(await page.locator('#pn-cont').innerText(), '1');
});

let pedidoB;
await teste('pedido novo chega sozinho (tempo real), com destaque e aviso no título', async () => {
  pedidoB = novoPedido();
  emitir('INSERT', { id: linhaPedido(pedidoB.codigo).id, status: 'recebido' });
  const c = cartao(page, pedidoB.codigo);
  await c.waitFor({ timeout: 5000 });
  assert.match(await c.getAttribute('class'), /is-novo/);
  assert.match(await page.title(), /^\(1\) Pedido novo!/);
  assert.equal(await page.locator('#pn-cont').innerText(), '2');
});

await teste('andamento da entrega: preparo, pronto, saiu, entregue (gravado no banco)', async () => {
  const c = cartao(page, pedidoA.codigo);
  for (const [botao, status] of [['Começar preparo', 'preparo'], ['Marcar pronto', 'pronto'], ['Saiu para entrega', 'saiu'], ['Marcar entregue', 'entregue']]) {
    await c.getByRole('button', { name: botao }).click();
    await page.waitForFunction(([cod, st]) => {
      const el = [...document.querySelectorAll('.pn-pedido')].find((x) => x.textContent.includes(cod));
      return !el || el.classList.contains(`is-${st}`);
    }, [pedidoA.codigo, status]);
    assert.equal(linhaPedido(pedidoA.codigo).status, status);
  }
  await c.waitFor({ state: 'detached' });   // saiu da lista "em andamento"
  await page.getByRole('button', { name: /Concluídos/ }).click();
  await cartao(page, pedidoA.codigo).locator('.pn-tag--entregue').waitFor();
  await page.getByRole('button', { name: 'Em andamento' }).click();
});

await teste('retirada pula "saiu para entrega"; pagamento confirmado e desfeito', async () => {
  const c = cartao(page, pedidoB.codigo);
  await c.getByRole('button', { name: 'Começar preparo' }).click();
  await c.getByRole('button', { name: 'Marcar pronto' }).waitFor();
  assert.equal(await page.title(), 'Painel · Modelo Burguer');   // mexeu: deixou de ser "novo"
  await c.getByRole('button', { name: 'Marcar pronto' }).click();
  await c.getByRole('button', { name: 'Cliente retirou' }).waitFor();
  assert.equal(await c.locator('select option[value="saiu"]').count(), 0);
  await c.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await c.getByRole('button', { name: 'Desfazer pagamento' }).waitFor();
  assert.equal(linhaPedido(pedidoB.codigo).pagamento_status, 'confirmado');
  await c.getByRole('button', { name: 'Desfazer pagamento' }).click();
  await c.getByRole('button', { name: 'Confirmar pagamento' }).waitFor();
  assert.equal(linhaPedido(pedidoB.codigo).pagamento_status, 'pendente');
});

await teste('cancelar pelo seletor de status (com confirmação)', async () => {
  await cartao(page, pedidoB.codigo).locator('select[data-mudar]').selectOption('cancelado');
  await cartao(page, pedidoB.codigo).waitFor({ state: 'detached' });
  assert.equal(linhaPedido(pedidoB.codigo).status, 'cancelado');
});

await teste('mudança feita em outro aparelho aparece pelo tempo real', async () => {
  const c = novoPedido();
  emitir('INSERT', { id: linhaPedido(c.codigo).id });
  await cartao(page, c.codigo).waitFor();
  admin(`update public.pedidos set status = 'preparo' where codigo = '${c.codigo}'`);
  emitir('UPDATE', { id: linhaPedido(c.codigo).id, status: 'preparo' });
  await cartao(page, c.codigo).locator('.pn-tag--preparo').waitFor({ timeout: 5000 });
});

await teste('item esgotado e de volta (gravado no banco)', async () => {
  await page.getByRole('tab', { name: 'Cardápio' }).click();
  const chave = page.getByRole('switch', { name: /^X-Bacon:/ });
  await chave.click();
  await page.getByRole('switch', { name: 'X-Bacon: esgotado', exact: true }).waitFor();
  assert.equal(admin(`select disponivel from public.produtos where id = 'x-bacon'`), 'f');
  await page.getByRole('switch', { name: 'X-Bacon: esgotado', exact: true }).click();
  await page.getByRole('switch', { name: 'X-Bacon: disponível', exact: true }).waitFor();
  assert.equal(admin(`select disponivel from public.produtos where id = 'x-bacon'`), 't');
  await page.getByRole('tab', { name: /Pedidos/ }).click();
});

await teste('fechar e reabrir a loja (gravado no banco)', async () => {
  await page.getByRole('button', { name: 'Fechar agora' }).click();
  await page.locator('#pn-loja', { hasText: 'Loja fechada agora' }).waitFor();
  assert.equal(admin(`select aberta_manual from public.loja`), 'f');
  await page.getByRole('button', { name: 'Reabrir a loja' }).click();
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  assert.equal(admin(`select aberta_manual from public.loja`), 't');
});

await teste('recarregar a página mantém a sessão; "Sair" apaga', async () => {
  await page.reload();
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.locator('#pn-login-erro', { hasText: 'Você saiu do painel.' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('modelo:painel:v1')), null);
  await page.reload();
  await page.locator('#pn-email').waitFor();
});

await teste('token perto de vencer é renovado uma vez só, mesmo com várias consultas juntas', async () => {
  auth.duracao = 30;   // menos que a margem de 1 min: a primeira consulta já renova
  const antes = auth.renovadas;
  await entrar(page);
  await page.locator('#pn-loja', { hasText: 'Loja aberta' }).waitFor();
  await page.locator('.pn-pedido').first().waitFor();
  auth.duracao = 3600;
  assert.ok(auth.renovadas > antes, 'não renovou');
  assert.equal(await page.locator('#pn-email').count(), 0);   // continua logado
});

await teste('sem tempo real: avisa e continua atualizando sozinho', async () => {
  const c2 = await novoContexto({ tempoReal: false });
  const p2 = await c2.newPage();
  vigiar(p2);
  await entrar(p2);
  await p2.locator('#pn-conexao', { hasText: 'Sem tempo real' }).waitFor({ timeout: 5000 });
  const novo = novoPedido();
  await cartao(p2, novo.codigo).waitFor({ timeout: 25000 });
  await c2.close();
});

await teste('nenhum erro no console', async () => {
  assert.deepEqual(erros, []);
});

await navegador.close();
servidor.fechar();
console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) process.exit(1);
