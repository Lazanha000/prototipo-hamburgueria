// Imita as poucas rotas da API do Supabase (PostgREST) que o site usa, rodando o SQL
// num Postgres local pelo psql. Serve para testar schema.sql + js/services/*.js juntos.
// Conexão: variáveis PGHOST, PGPORT, PGUSER, PGDATABASE (ver PENDENCIAS.md).

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const lit = (s) => {
  const tag = `$q${randomBytes(4).toString('hex')}$`;
  return `${tag}${s}${tag}`;
};

// Roda SQL como um papel (anon/authenticated/postgres). Devolve { ok, saida } ou { ok:false, code, message }.
export function sql(comando, { papel = 'anon', uid = null, headers = null } = {}) {
  const partes = ['\\set VERBOSITY verbose', 'begin;'];
  if (papel !== 'postgres') partes.push(`set local role ${papel};`);
  if (uid) partes.push(`select set_config('teste.uid', ${lit(uid)}, true) is null;`);
  if (headers) partes.push(`select set_config('request.headers', ${lit(JSON.stringify(headers))}, true) is null;`);
  partes.push(comando.trim().replace(/;?$/, ';'), 'commit;');
  const r = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: partes.join('\n'), encoding: 'utf8' });
  if (r.status !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}): (.*)/.exec(r.stderr || '');
    return { ok: false, code: m?.[1] || 'XX000', message: m?.[2] || r.stderr };
  }
  // as linhas "f" dos set_config acima vêm antes; o resultado é a última linha
  const linhas = r.stdout.split('\n').filter((l) => l !== '');
  return { ok: true, saida: linhas.slice(uid ? 1 : 0).slice(headers ? 1 : 0).join('\n') };
}

const sel = (cols, de) => `select coalesce(json_agg(t), '[]') from (select ${cols} from ${de}) t`;
const GETS = [
  [/^categorias\?/, sel('id, nome, ordem, ativo', 'public.categorias where ativo')],
  [/^produtos\?/, sel(`id, categoria_id, nome, descricao, preco, imagem, arte, destaque, disponivel, ativo, removiveis, ordem,
      (select coalesce(json_agg(g), '[]') from (select gg.chave, gg.nome, gg.tipo, gg.obrigatorio, gg.max, gg.ordem,
        (select coalesce(json_agg(o), '[]') from (select chave, nome, preco, ativo, ordem from public.opcoes where grupo_id = gg.id) o) as opcoes
        from public.grupos_opcao gg where gg.produto_id = pp.id) g) as grupos_opcao`, 'public.produtos pp where ativo')],
  [/^loja\?/, sel('*', 'public.loja where id = 1')],
  [/^bairros\?/, sel('nome, taxa, ativo', 'public.bairros where ativo')],
  [/^horarios\?/, sel('dia, abre, fecha', 'public.horarios')],
];

const resposta = (status, corpo) => ({ status, corpo: corpo === undefined ? '' : JSON.stringify(corpo) });
const statusDoErro = (code) => (code === 'P0001' ? 400 : code === '42501' ? 401 : code.startsWith('22') ? 400 : 500);

// Atende uma requisição. caminho = parte depois de /rest/v1/
export function atender(metodo, caminho, corpo, { ip = '203.0.113.7' } = {}) {
  const headers = { 'x-forwarded-for': `${ip}, 10.0.0.1` };
  if (metodo === 'POST' && caminho.startsWith('rpc/')) {
    const nome = caminho.slice(4);
    if (!/^[a-z_]+$/.test(nome)) return resposta(404, { message: 'rota' });
    const args = Object.entries(JSON.parse(corpo || '{}'))
      .map(([k, v]) => `${k} => ${v === null ? 'null' : lit(typeof v === 'string' ? v : JSON.stringify(v))}`);
    const r = sql(`select coalesce(public.${nome}(${args.join(', ')})::text, 'null')`, { headers });
    if (!r.ok) return resposta(statusDoErro(r.code), { code: r.code, message: r.message, details: null, hint: null });
    return { status: 200, corpo: r.saida };
  }
  if (metodo === 'GET') {
    const achado = GETS.find(([re]) => re.test(caminho));
    if (!achado) return resposta(404, { message: 'rota não imitada' });
    const r = sql(achado[1]);
    if (!r.ok) return resposta(statusDoErro(r.code), { code: r.code, message: r.message });
    return { status: 200, corpo: r.saida };
  }
  return resposta(405, { message: 'método' });
}

// fetch falso para usar direto nos módulos (criarPedido, consultarPedido, buscarDoBanco)
export function fetchFalso(opcoes) {
  return async (url, init = {}) => {
    const caminho = String(url).replace(/^https?:\/\/[^/]+\/rest\/v1\//, '');
    const r = atender(init.method || 'GET', caminho, init.body, opcoes);
    return new Response(r.corpo || null, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
}
