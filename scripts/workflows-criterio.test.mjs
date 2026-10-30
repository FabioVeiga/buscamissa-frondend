import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Contrato de docs/prerender-paroquias-criterio.md: cada workflow lê as variáveis do SEU
// ambiente — nenhuma variável de repositório compartilhada entre staging e produção.
const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
const ler = (nome) => readFileSync(join(WORKFLOWS, nome), 'utf-8');
const PRODUCAO = ler('azure-static-web-apps-gentle-moss-0416a7b0f.yml');
const STAGING = ler('azure-static-web-apps-proud-glacier-006788b0f.yml');

test('produção: critério e exceção vêm das variáveis _PRODUCAO, sem valor fixo (padrão do código)', () => {
  assert.match(PRODUCAO, /PRERENDER_PAROQUIAS_CRITERIO: \$\{\{ vars\.PRERENDER_PAROQUIAS_CRITERIO_PRODUCAO \}\}\r?\n/);
  assert.match(PRODUCAO, /PRERENDER_ACEITAR_MARGEM: \$\{\{ vars\.PRERENDER_ACEITAR_MARGEM_PRODUCAO \}\}\r?\n/);
});

test('staging: critério das variáveis _STAGING, com padrão demanda; exceção própria', () => {
  assert.match(STAGING, /PRERENDER_PAROQUIAS_CRITERIO: \$\{\{ vars\.PRERENDER_PAROQUIAS_CRITERIO_STAGING \|\| 'demanda' \}\}\r?\n/);
  assert.match(STAGING, /PRERENDER_ACEITAR_MARGEM: \$\{\{ vars\.PRERENDER_ACEITAR_MARGEM_STAGING \}\}\r?\n/);
});

test('nenhum workflow usa as variáveis globais sem sufixo de ambiente', () => {
  for (const conteudo of [PRODUCAO, STAGING]) {
    assert.doesNotMatch(conteudo, /vars\.PRERENDER_(PAROQUIAS_CRITERIO|ACEITAR_MARGEM) \}\}/);
  }
});
