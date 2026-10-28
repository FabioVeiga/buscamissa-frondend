import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARQUIVO_DEMANDA,
  ARQUIVO_PROTECAO,
  CEPS_COM_CITACAO_EXTERNA,
  criterioAtivo,
  ErroCapacidadePrerender,
  lerProtecao,
  paroquiasDoDisco,
  selecionarParoquias,
  selecionarParoquiasV8,
  VARIAVEL_CRITERIO,
} from './selecionar-paroquias-prerender.mjs';
import { FOLGA_ARQUIVOS, MAX_FILES, projetarArquivos, tetoParoquias } from './orcamento-arquivos.mjs';

/** Paróquia do cache do prebuild (só os campos que a seleção lê). */
const par = (uf, cidade, slug, { confianca = 1, missas = 1, cep = '00000000', alteracao = '2026-01-01' } = {}) => ({
  uf,
  cidadeSlug: cidade,
  slug,
  igreja: {
    statusConfianca: confianca,
    missas: Array.from({ length: missas }, (_, i) => ({ diaSemana: i % 7 })),
    alteracao,
    endereco: { cep },
  },
});
const chave = (s) => `${s.uf}/${s.cidade}/${s.slug}`;
const chaves = (sel) => sel.map(chave);

// sp/sao-paulo é capital; sp/campinas tem demanda; pa/cumaru-do-norte e sp/jundiai não.
// A citada de Jundiaí é a melhor da cidade: no V0 ela entrava pelo piso.
const LISTA = [
  par('sp', 'sao-paulo', 'piso-sp', { confianca: 3 }),
  par('sp', 'sao-paulo', 'sp-b'),
  par('sp', 'sao-paulo', 'sp-c', { confianca: 2 }),
  par('sp', 'campinas', 'piso-campinas', { confianca: 3 }),
  par('sp', 'campinas', 'campinas-b'),
  par('pa', 'cumaru-do-norte', 'piso-cumaru', { confianca: 3 }),
  par('pa', 'cumaru-do-norte', 'cumaru-b'),
  par('sp', 'jundiai', 'jundiai-citada', { confianca: 3, cep: CEPS_COM_CITACAO_EXTERNA[0] }),
  par('sp', 'jundiai', 'sem-horario', { confianca: 3, missas: 0 }),
];
const PROTECAO = {
  cidadesComDemanda: ['sp/campinas'],
  atuais: ['sp/campinas/campinas-b', 'pa/cumaru-do-norte/cumaru-b'],
  protegidas: [{ chave: 'pa/cumaru-do-norte/cumaru-b', cliques: 7 }],
};

test('piso estreito: só capital e cidade com demanda mantêm a melhor paróquia', () => {
  const sel = chaves(selecionarParoquiasV8(LISTA, { protecao: PROTECAO, teto: 4 }));
  // piso em ordem alfabética de cidade: campinas (demanda) antes de sao-paulo (capital)
  assert.deepEqual(sel.slice(0, 2), ['sp/campinas/piso-campinas', 'sp/sao-paulo/piso-sp']);
  assert.ok(!sel.includes('pa/cumaru-do-norte/piso-cumaru'), 'cidade sem demanda não leva vaga de piso');
});

test('citação externa é recalculada contra o piso estreito (a melhor da cidade não some)', () => {
  const sel = chaves(selecionarParoquiasV8(LISTA, { protecao: PROTECAO, teto: 4 }));
  assert.equal(sel[2], 'sp/jundiai/jundiai-citada');
});

test('protegidas entram logo depois das camadas fixas e antes da demanda', () => {
  const sel = chaves(
    selecionarParoquiasV8(LISTA, { protecao: PROTECAO, demanda: ['sp/sao-paulo/sp-b'], teto: 4 }),
  );
  assert.deepEqual(sel, [
    'sp/campinas/piso-campinas',
    'sp/sao-paulo/piso-sp',
    'sp/jundiai/jundiai-citada',
    'pa/cumaru-do-norte/cumaru-b',
  ]);
});

test('permanência: página atual vem antes do preenchimento por qualidade', () => {
  // sp-c (confiança 2) ganharia de campinas-b (confiança 1) por qualidade.
  const sel = chaves(selecionarParoquiasV8(LISTA, { protecao: PROTECAO, teto: 5 }));
  assert.equal(sel[4], 'sp/campinas/campinas-b');
  assert.ok(!sel.includes('sp/sao-paulo/sp-c'));
});

test('demanda vem antes da permanência', () => {
  const sel = chaves(
    selecionarParoquiasV8(LISTA, { protecao: PROTECAO, demanda: ['sp/sao-paulo/sp-c'], teto: 5 }),
  );
  assert.equal(sel[4], 'sp/sao-paulo/sp-c');
});

test('sem horário nunca entra, nem protegida', () => {
  const protecao = { ...PROTECAO, protegidas: [{ chave: 'sp/jundiai/sem-horario', cliques: 50 }] };
  const sel = chaves(selecionarParoquiasV8(LISTA, { protecao, teto: 20 }));
  assert.ok(!sel.includes('sp/jundiai/sem-horario'));
});

test('capacidade: obrigatórias acima do teto lançam erro explícito, sem cortar protegidas', () => {
  assert.throws(
    () => selecionarParoquiasV8(LISTA, { protecao: PROTECAO, teto: 3 }),
    (err) => {
      assert.ok(err instanceof ErroCapacidadePrerender);
      assert.equal(err.teto, 3);
      assert.equal(err.essenciais, 4); // piso 2 + citação 1 + protegida 1
      assert.match(err.message, /Nenhuma página protegida foi removida/);
      return true;
    },
  );
});

test('teto dinâmico: projeção de arquivos fica exatamente na folga', () => {
  for (const cidades of [1640, 1806, 2106]) {
    const teto = tetoParoquias({ cidades });
    assert.equal(projetarArquivos({ cidades, paroquias: teto }), MAX_FILES - FOLGA_ARQUIVOS);
  }
  assert.equal(tetoParoquias({ cidades: 1806 }), 1861);
});

test('cidades sintéticas sem demanda não ocupam piso nem tiram protegidas', () => {
  const novas = Array.from({ length: 300 }, (_, i) => par('zz', `nova-${i}`, 'p', { confianca: 3, missas: 9 }));
  const lista = [...LISTA, ...novas];
  const sel = chaves(selecionarParoquiasV8(lista, { protecao: PROTECAO, teto: 6 }));
  assert.ok(sel.includes('pa/cumaru-do-norte/cumaru-b'));
  assert.equal(sel.filter((c) => c.startsWith('zz/')).length, 1); // só a vaga que sobrou, por qualidade
});

test('resultado nunca passa do teto', () => {
  const sel = selecionarParoquiasV8(LISTA, { protecao: PROTECAO, teto: 5 });
  assert.equal(sel.length, 5);
});

// --- leitura do disco e reversão -------------------------------------------------

function montarBase({ protecao, demanda, cidades = true }) {
  const base = mkdtempSync(join(tmpdir(), 'v8-'));
  mkdirSync(join(base, '.prerender-cache'), { recursive: true });
  mkdirSync(join(base, 'scripts', 'data'), { recursive: true });
  writeFileSync(join(base, '.prerender-cache', 'paroquias.json'), JSON.stringify(LISTA));
  if (cidades) {
    const lista = [...new Set(LISTA.map((p) => `${p.uf}|${p.cidadeSlug}`))].map((c) => {
      const [uf, cidadeSlug] = c.split('|');
      return { uf, cidadeSlug };
    });
    writeFileSync(join(base, '.prerender-cache', 'cidades.json'), JSON.stringify(lista));
  }
  if (protecao) writeFileSync(join(base, ARQUIVO_PROTECAO), typeof protecao === 'string' ? protecao : JSON.stringify(protecao));
  if (demanda) writeFileSync(join(base, ARQUIVO_DEMANDA), JSON.stringify({ resto: demanda.map((c) => ({ chave: c })) }));
  return base;
}

test('paroquiasDoDisco: com arquivo de proteção usa o V8 e o teto dinâmico', () => {
  const base = montarBase({ protecao: PROTECAO });
  assert.equal(criterioAtivo(base, {}), 'v8');
  const sel = paroquiasDoDisco(base, {});
  assert.deepEqual(sel, selecionarParoquiasV8(LISTA, { protecao: PROTECAO, teto: tetoParoquias({ cidades: 4 }) }));
});

test('reversão: =qualidade volta ao critério original, ignorando proteção e demanda', () => {
  const base = montarBase({ protecao: PROTECAO, demanda: ['sp/sao-paulo/sp-b'] });
  const env = { [VARIAVEL_CRITERIO]: 'qualidade' };
  assert.equal(criterioAtivo(base, env), 'qualidade');
  assert.deepEqual(paroquiasDoDisco(base, env), selecionarParoquias(LISTA, { demanda: null }));
});

test('reversão: =demanda ignora só a proteção (critério anterior ao V8)', () => {
  const base = montarBase({ protecao: PROTECAO, demanda: ['sp/sao-paulo/sp-b'] });
  const env = { [VARIAVEL_CRITERIO]: 'demanda' };
  assert.equal(criterioAtivo(base, env), 'demanda');
  assert.deepEqual(paroquiasDoDisco(base, env), selecionarParoquias(LISTA, { demanda: ['sp/sao-paulo/sp-b'] }));
});

test('sem arquivo de proteção o build segue com a seleção por demanda', () => {
  const base = montarBase({ demanda: ['sp/sao-paulo/sp-b'] });
  assert.equal(criterioAtivo(base, {}), 'demanda');
  assert.deepEqual(paroquiasDoDisco(base, {}), selecionarParoquias(LISTA, { demanda: ['sp/sao-paulo/sp-b'] }));
});

test('arquivo de proteção inválido → null (nunca derruba o build)', () => {
  assert.equal(lerProtecao(montarBase({ protecao: '{ quebrado' }), {}), null);
  assert.equal(lerProtecao(montarBase({ protecao: { atuais: [], protegidas: [] } }), {}), null);
  assert.equal(lerProtecao(montarBase({ protecao: { ...PROTECAO, protegidas: [{ cliques: 3 }] } }), {}), null);
});

test('V8 sem cidades.json falha explicitamente (não adivinha o teto)', () => {
  const base = montarBase({ protecao: PROTECAO, cidades: false });
  assert.throws(() => paroquiasDoDisco(base, {}), /cidades\.json/);
});
