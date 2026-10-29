import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
// Porta sem serviço: a busca do sitemap falha na hora, como uma API fora do ar.
const API_FORA = 'http://127.0.0.1:9';

const par = (uf, cidade, slug) => ({
  uf,
  cidadeSlug: cidade,
  slug,
  igreja: { statusConfianca: 2, missas: [{ diaSemana: 0 }], alteracao: '2026-01-01', endereco: { cep: '00000000' } },
});
const PAROQUIAS = [par('sp', 'sao-paulo', 'a'), par('sp', 'campinas', 'b')];

/** Raiz descartável com cópia dos scripts e cache do prebuild (o script resolve ROOT a partir de si). */
function raiz({ protecao } = {}) {
  const r = mkdtempSync(join(tmpdir(), 'sitemap-'));
  cpSync(SCRIPTS, join(r, 'scripts'), { recursive: true });
  mkdirSync(join(r, '.prerender-cache'), { recursive: true });
  writeFileSync(join(r, '.prerender-cache', 'paroquias.json'), JSON.stringify(PAROQUIAS));
  writeFileSync(join(r, '.prerender-cache', 'cidades.json'), JSON.stringify([{ uf: 'sp', cidadeSlug: 'sao-paulo' }, { uf: 'sp', cidadeSlug: 'campinas' }]));
  const arquivo = join(r, 'scripts', 'data', 'prerender-protecao.json');
  if (protecao === null) rmSync(arquivo, { force: true });
  else if (protecao !== undefined) writeFileSync(arquivo, JSON.stringify(protecao));
  return r;
}

function rodar(r, env) {
  return spawnSync(process.execPath, [join(r, 'scripts', 'gerar-sitemap.mjs'), 'prod'], {
    cwd: r,
    env: { ...process.env, API_URL: API_FORA, ...env },
    encoding: 'utf-8',
  });
}

test('gerar-sitemap: API fora + critério válido → segue (exit 0) e grava o registro', () => {
  const r = raiz();
  const res = rodar(r, { PRERENDER_PAROQUIAS_CRITERIO: 'demanda' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout + res.stderr, /falha ao buscar/);
  const registro = JSON.parse(readFileSync(join(r, '.prerender-cache', 'criterio-prerender.json'), 'utf-8'));
  assert.equal(registro.criterio, 'demanda');
  assert.equal(registro.paroquias, 2);
});

test('gerar-sitemap: proteção divergente da base → um único erro claro, sem stack trace nem registro', () => {
  const protecao = {
    versao: 1,
    geradoEm: '2026-10-28',
    fontes: {
      sitemap: { url: 'https://buscamissa.com.br/sitemap.xml', data: '2026-10-28' },
      searchConsole: { inicio: '2026-07-30', fim: '2026-10-27' },
    },
    cidadesComDemanda: [],
    atuais: ['xx/sumiu/1', 'xx/sumiu/2'],
    protegidas: [{ chave: 'xx/sumiu/1', cliques: 5 }],
  };
  const r = raiz({ protecao });
  const res = rodar(r, { PRERENDER_PAROQUIAS_CRITERIO: 'v8' });
  const saida = res.stdout + res.stderr;
  assert.equal(res.status, 1);
  assert.equal((saida.match(/divergente da base/g) ?? []).length, 1, saida);
  assert.doesNotMatch(saida, /falha ao buscar/);
  assert.doesNotMatch(saida, /\n\s+at /);
  assert.equal(existsSync(join(r, '.prerender-cache', 'criterio-prerender.json')), false);
});

test('gerar-sitemap: v8 exigido sem arquivo de proteção → um único erro claro', () => {
  const res = rodar(raiz({ protecao: null }), { PRERENDER_PAROQUIAS_CRITERIO: 'v8' });
  const saida = res.stdout + res.stderr;
  assert.equal(res.status, 1);
  assert.equal((saida.match(/exige scripts\/data\/prerender-protecao\.json/g) ?? []).length, 1, saida);
  assert.doesNotMatch(saida, /falha ao buscar/);
  assert.doesNotMatch(saida, /\n\s+at /);
});
