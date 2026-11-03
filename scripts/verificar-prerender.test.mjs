import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));

/** Raiz descartável com uma cópia dos scripts (o guard resolve ROOT a partir de si). */
function raizComCache() {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-'));
  cpSync(SCRIPTS, join(raiz, 'scripts'), { recursive: true });
  // A cópia traz o arquivo de proteção versionado; o cenário testado é a ausência dele.
  rmSync(join(raiz, 'scripts', 'data', 'prerender-protecao.json'), { force: true });
  mkdirSync(join(raiz, '.prerender-cache'), { recursive: true });
  writeFileSync(join(raiz, '.prerender-cache', 'paroquias.json'), '[]');
  return raiz;
}

function rodarGuard(raiz, env) {
  return spawnSync(process.execPath, [join(raiz, 'scripts', 'verificar-prerender.mjs')], {
    cwd: raiz,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
  });
}

for (const [caso, valor, motivo] of [
  ['v8 sem arquivo de proteção', 'v8', /exige scripts\/data\/prerender-protecao\.json/],
  ['valor desconhecido na variável', 'xyz', /"xyz" inválido/],
]) {
  test(`verificar-prerender: ${caso} falha com mensagem formatada, sem stack trace`, () => {
    const r = rodarGuard(raizComCache(), { PRERENDER_PAROQUIAS_CRITERIO: valor });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /❌ \[criterio\] configuração do prerender de paróquias inválida/);
    assert.match(r.stderr, motivo);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  });
}
