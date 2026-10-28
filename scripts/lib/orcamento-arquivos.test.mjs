import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARQUIVOS_FIXOS, avaliarMargem, FOLGA_ARQUIVOS, MAX_FILES, medirDiretorio, projetarArquivos, tetoParoquias, VARIAVEL_EXCECAO_MARGEM } from './orcamento-arquivos.mjs';

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

test('build de 26/10 reconstruído: 1.900 paróquias + 1.640 cidades + fixos = 3.923', () => {
  assert.equal(projetarArquivos({ cidades: 1640, paroquias: 1900 }), 3923);
  assert.equal(ARQUIVOS_FIXOS, 383);
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
