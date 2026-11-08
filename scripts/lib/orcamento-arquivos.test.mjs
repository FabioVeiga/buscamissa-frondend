import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARQUIVOS_FIXOS, avaliarMargem, FOLGA_ARQUIVOS, margemNaReversao, MAX_FILES, medirDiretorio, medirFixos, projetarArquivos, tetoParoquias, VARIAVEL_EXCECAO_MARGEM } from './orcamento-arquivos.mjs';

test('medirDiretorio conta como o build: um index.html por rota, mais os assets', () => {
  // dist/<app>/browser sintético: 3 assets + 2 páginas de cidade + 3 de paróquia.
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  for (const f of ['main.js', 'styles.css', 'favicon.ico']) writeFileSync(join(dir, f), 'x');
  for (const rota of ['missas/sp/campinas', 'missas/sp/sao-paulo', 'paroquia/sp/campinas/a', 'paroquia/sp/campinas/b', 'paroquia/sp/sao-paulo/c']) {
    mkdirSync(join(dir, rota), { recursive: true });
    writeFileSync(join(dir, rota, 'index.html'), '<html></html>');
  }
  const { arquivos } = medirDiretorio(dir);
  assert.equal(arquivos, projetarArquivos({ cidades: 2, paroquias: 3, fixos: 3 }));
});

test('build de 26/10 reconstruído com os fixos da época: 1.900 + 1.640 + 383 = 3.923', () => {
  assert.equal(projetarArquivos({ cidades: 1640, paroquias: 1900, fixos: 383 }), 3923);
});

test('build de produção de 03/11 (PR #275): 1.734 paróquias + 1.933 cidades + 384 fixos = 4.051', () => {
  assert.equal(projetarArquivos({ cidades: 1933, paroquias: 1734, fixos: 384 }), 4051);
});

test('build de produção de 08/11 (PR #287): 1.661 paróquias + 2.005 cidades + 386 fixos = 4.052', () => {
  assert.equal(ARQUIVOS_FIXOS, 386);
  assert.equal(projetarArquivos({ cidades: 2005, paroquias: 1661 }), 4052);
});

test('com 386 fixos e os dados de 08/11, o teto volta a deixar exatamente a folga', () => {
  // Com 384 a seleção pegou 1.661 paróquias e o dist real (386 fixos) ficou com margem 148.
  assert.equal(tetoParoquias({ cidades: 2005, fixos: 384 }), 1661);
  assert.equal(avaliarMargem({ arquivos: 4052, env: {} }).ok, false);
  const teto = tetoParoquias({ cidades: 2005 });
  assert.equal(teto, 1659);
  const arquivos = projetarArquivos({ cidades: 2005, paroquias: teto });
  assert.deepEqual(avaliarMargem({ arquivos, env: {} }), { ok: true, margem: FOLGA_ARQUIVOS });
});

test('com 384 fixos e os dados de 03/11, o teto volta a deixar exatamente a folga', () => {
  // Com 383 a seleção pegou 1.734 paróquias e o dist real (384 fixos) ficou com margem 149.
  assert.equal(tetoParoquias({ cidades: 1933, fixos: 383 }), 1734);
  assert.equal(avaliarMargem({ arquivos: 4051, env: {} }).ok, false);
  const teto = tetoParoquias({ cidades: 1933, fixos: 384 });
  assert.equal(teto, 1733);
  const arquivos = projetarArquivos({ cidades: 1933, paroquias: teto, fixos: 384 });
  assert.deepEqual(avaliarMargem({ arquivos, env: {} }), { ok: true, margem: FOLGA_ARQUIVOS });
});

test('margem: exatamente 150 passa, 149 falha, acima de MAX_FILES falha', () => {
  assert.equal(avaliarMargem({ arquivos: MAX_FILES - FOLGA_ARQUIVOS, env: {} }).ok, true);
  assert.equal(avaliarMargem({ arquivos: MAX_FILES - FOLGA_ARQUIVOS + 1, env: {} }).ok, false);
  assert.equal(avaliarMargem({ arquivos: MAX_FILES + 1, env: {} }).ok, false);
});

function distSintetico({ assets, cidades, paroquias, extras = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-fixos-'));
  for (let i = 0; i < assets; i++) writeFileSync(join(dir, `chunk-${i}.js`), 'x');
  const pagina = (rota) => {
    mkdirSync(join(dir, rota), { recursive: true });
    writeFileSync(join(dir, rota, 'index.html'), '<html></html>');
  };
  for (let i = 0; i < cidades; i++) pagina(`missas/sp/cidade-${i}`);
  for (let i = 0; i < paroquias; i++) pagina(`paroquia/sp/cidade-0/paroquia-${i}`);
  for (const rota of extras) pagina(rota);
  return dir;
}

test('medirFixos separa cidade e paróquia do resto (hubs, estáticas, assets)', () => {
  // Fixos: 4 assets + /missas/sp (hub UF) + /missa-domingo/sp + /cidades + index.html da raiz = 8.
  const dir = distSintetico({ assets: 4, cidades: 3, paroquias: 5, extras: ['missas/sp', 'missa-domingo/sp', 'cidades', '.'] });
  assert.deepEqual(medirFixos(dir), { arquivos: 16, cidades: 3, paroquias: 5, fixos: 8 });
});

test('medirFixos: um chunk a mais no pós-build vira um fixo a mais, não página', () => {
  const antes = medirFixos(distSintetico({ assets: 4, cidades: 2, paroquias: 2 }));
  const depois = medirFixos(distSintetico({ assets: 5, cidades: 2, paroquias: 2 }));
  assert.equal(depois.fixos - antes.fixos, 1);
  assert.equal(depois.cidades, antes.cidades);
  assert.equal(depois.paroquias, antes.paroquias);
});

test('medirFixos: página fora do formato (folha /missa-{dia}/{uf}/{cidade}, nível extra) conta como fixo', () => {
  const dir = distSintetico({ assets: 0, cidades: 1, paroquias: 1, extras: ['missa-sabado/mg/uberaba', 'missas/sp/cidade-0/extra'] });
  assert.deepEqual(medirFixos(dir), { arquivos: 4, cidades: 1, paroquias: 1, fixos: 2 });
});

test('teto pode ficar sem espaço: zero ou negativo, quem chama decide falhar', () => {
  assert.equal(tetoParoquias({ cidades: MAX_FILES - FOLGA_ARQUIVOS - ARQUIVOS_FIXOS }), 0);
  assert.ok(tetoParoquias({ cidades: MAX_FILES }) < 0);
});

test('margem real: passa com folga, falha abaixo sem exceção', () => {
  assert.deepEqual(avaliarMargem({ arquivos: MAX_FILES - FOLGA_ARQUIVOS, env: {} }), { ok: true, margem: FOLGA_ARQUIVOS });
  const r = avaliarMargem({ arquivos: 4089, env: {} });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /margem real de 111 arquivos abaixo da folga de 150/);
});

test('margem real: exceção explícita aceita só margem ≥ mínimo e valor válido', () => {
  const env = (v) => ({ [VARIAVEL_EXCECAO_MARGEM]: v });
  assert.deepEqual(avaliarMargem({ arquivos: 4089, env: env('100') }), { ok: true, margem: 111, excecao: 100 });
  assert.match(avaliarMargem({ arquivos: 4089, env: env('120') }).motivo, /abaixo até da exceção/);
  for (const ruim of ['abc', '-1', '150', '10.5']) {
    assert.match(avaliarMargem({ arquivos: 4089, env: env(ruim) }).motivo, /inválido/);
  }
});

test('reversão de produção (build V8 de 29/10: 4.050 arquivos, 1.821 paróquias): margem 71', () => {
  const margem = margemNaReversao({ arquivosV8: 4050, paroquiasV8: 1821, paroquiasReversao: 1900 });
  assert.equal(margem, 71);
  // Mesma conta pelo caminho do guard: o dist da reversão tem 79 páginas a mais.
  const arquivos = 4050 + (1900 - 1821);
  assert.equal(avaliarMargem({ arquivos, env: {} }).margem, margem);
  // A exceção passa até o valor da margem e falha acima; o 100 do doc antigo falharia.
  assert.equal(avaliarMargem({ arquivos, env: { [VARIAVEL_EXCECAO_MARGEM]: '70' } }).ok, true);
  assert.equal(avaliarMargem({ arquivos, env: { [VARIAVEL_EXCECAO_MARGEM]: String(margem) } }).ok, true);
  assert.equal(avaliarMargem({ arquivos, env: { [VARIAVEL_EXCECAO_MARGEM]: String(margem + 1) } }).ok, false);
  assert.equal(avaliarMargem({ arquivos, env: { [VARIAVEL_EXCECAO_MARGEM]: '100' } }).ok, false);
});

test('reversão: cada cidade nova na base tira 1 da margem', () => {
  // Build V8 com +1 cidade: o teto dinâmico corta 1 paróquia e o dist fica do mesmo tamanho.
  const antes = margemNaReversao({ arquivosV8: 4050, paroquiasV8: 1821, paroquiasReversao: 1900 });
  const depois = margemNaReversao({ arquivosV8: 4050, paroquiasV8: 1820, paroquiasReversao: 1900 });
  assert.equal(depois, antes - 1);
});
