import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARQUIVO_DEMANDA,
  ARQUIVO_PROTECAO,
  CEPS_COM_CITACAO_EXTERNA,
  avaliarJanelas,
  conferirDescartes,
  conferirRegistro,
  CRITERIO_PADRAO,
  criterioAtivo,
  criterioEsperado,
  ErroCapacidadePrerender,
  gravarRegistroCriterio,
  ARQUIVO_REGISTRO,
  LIMITE_DESCARTE_PROTECAO,
  paroquiasDoDisco,
  registroDaSelecao,
  validarProtecao,
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

// --- leitura do disco, critério esperado e reversão ------------------------------

const ARQUIVO_OK = {
  versao: 1,
  geradoEm: '2026-10-28',
  fontes: {
    sitemap: { url: 'https://buscamissa.com.br/sitemap.xml', data: '2026-10-28' },
    searchConsole: { inicio: '2026-07-30', fim: '2026-10-27', metrica: 'cliques por página' },
  },
  ...PROTECAO,
};
const V8 = { [VARIAVEL_CRITERIO]: 'v8' };

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
  if (demanda) {
    writeFileSync(join(base, ARQUIVO_DEMANDA), JSON.stringify({ janela: { inicio: '2026-09-01', fim: '2026-10-24' }, resto: demanda.map((c) => ({ chave: c })) }));
  }
  return base;
}

test('critério padrão é demanda enquanto a proteção não é versionada', () => {
  assert.equal(CRITERIO_PADRAO, 'demanda');
  assert.equal(criterioEsperado({}), 'demanda');
  // Mesmo com o arquivo presente, sem pedir v8 o build segue na demanda.
  const base = montarBase({ protecao: ARQUIVO_OK, demanda: ['sp/sao-paulo/sp-b'] });
  assert.equal(criterioAtivo(base, {}), 'demanda');
  assert.deepEqual(paroquiasDoDisco(base, {}), selecionarParoquias(LISTA, { demanda: ['sp/sao-paulo/sp-b'] }));
});

test('valor desconhecido na variável derruba o build', () => {
  assert.throws(() => criterioEsperado({ [VARIAVEL_CRITERIO]: 'V8 ' }), /inválido/);
});

test('v8 com arquivo válido: seleção V8 com teto dinâmico', () => {
  const base = montarBase({ protecao: ARQUIVO_OK });
  assert.equal(criterioAtivo(base, V8), 'v8');
  assert.deepEqual(
    paroquiasDoDisco(base, V8),
    selecionarParoquiasV8(LISTA, { protecao: ARQUIVO_OK, teto: tetoParoquias({ cidades: 4 }) }),
  );
});

test('v8 exigido e arquivo ausente, inválido ou incompatível: falha com o motivo', () => {
  const casos = [
    [undefined, /ausente/],
    ['{ quebrado', /não é JSON/],
    [{ ...ARQUIVO_OK, versao: 2 }, /versão 2 incompatível/],
    [{ ...ARQUIVO_OK, atuais: [] }, /atuais/],
    [{ ...ARQUIVO_OK, protegidas: [{ cliques: 3 }] }, /protegidas/],
    [{ ...ARQUIVO_OK, cidadesComDemanda: 'sp/campinas' }, /cidadesComDemanda/],
    [{ ...ARQUIVO_OK, fontes: { ...ARQUIVO_OK.fontes, sitemap: { url: 'sitemap.xml', data: '2026-10-28' } } }, /sitemap/],
    [{ ...ARQUIVO_OK, fontes: { sitemap: ARQUIVO_OK.fontes.sitemap } }, /Search Console/],
  ];
  for (const [protecao, motivo] of casos) {
    const base = montarBase({ protecao });
    assert.throws(() => criterioAtivo(base, V8), motivo);
    assert.throws(() => paroquiasDoDisco(base, V8), motivo);
    assert.match(validarProtecao(base).erro, motivo);
  }
});

test('descartes: contados à parte; dentro do limite passa, acima falha sem cortar protegidas', () => {
  const ok = conferirDescartes(LISTA, ARQUIVO_OK);
  assert.deepEqual(ok.descartadas, { protegidas: [], atuais: [] });
  assert.equal(ok.excedeu, false);

  const sujo = { ...ARQUIVO_OK, atuais: [...ARQUIVO_OK.atuais, 'xx/sumiu/a'], protegidas: [...ARQUIVO_OK.protegidas, { chave: 'sp/jundiai/sem-horario', cliques: 4 }] };
  const r = conferirDescartes(LISTA, sujo);
  assert.deepEqual(r.descartadas, { protegidas: ['sp/jundiai/sem-horario'], atuais: ['xx/sumiu/a'] });
  assert.equal(r.fracao.protegidas, 0.5);
  assert.equal(r.excedeu, true);
  assert.equal(conferirDescartes(LISTA, sujo, 0.6).excedeu, false);

  const base = montarBase({ protecao: sujo });
  assert.throws(() => paroquiasDoDisco(base, V8), /divergente da base.*protegidas descartadas 1\/2/);
  assert.equal(LIMITE_DESCARTE_PROTECAO, 0.02);
});

test('reversão: =qualidade e =demanda ignoram a proteção, inclusive inválida', () => {
  const base = montarBase({ protecao: '{ quebrado', demanda: ['sp/sao-paulo/sp-b'] });
  const q = { [VARIAVEL_CRITERIO]: 'qualidade' };
  const d = { [VARIAVEL_CRITERIO]: 'demanda' };
  assert.equal(criterioAtivo(base, q), 'qualidade');
  assert.deepEqual(paroquiasDoDisco(base, q), selecionarParoquias(LISTA, { demanda: null }));
  assert.equal(criterioAtivo(base, d), 'demanda');
  assert.deepEqual(paroquiasDoDisco(base, d), selecionarParoquias(LISTA, { demanda: ['sp/sao-paulo/sp-b'] }));
});

test('demanda sem arquivo de demanda segue o comportamento anterior (qualidade)', () => {
  const base = montarBase({});
  assert.equal(criterioAtivo(base, {}), 'qualidade');
});

test('V8 sem cidades.json falha explicitamente (não adivinha o teto)', () => {
  const base = montarBase({ protecao: ARQUIVO_OK, cidades: false });
  assert.throws(() => paroquiasDoDisco(base, V8), /cidades\.json/);
});

test('registro prebuild × postbuild: igual passa; critério, contagem ou conjunto diferentes falham', () => {
  const sel = selecionarParoquias(LISTA, { demanda: null });
  const reg = registroDaSelecao('qualidade', sel);
  assert.deepEqual(conferirRegistro(reg, registroDaSelecao('qualidade', [...sel].reverse())), []);
  assert.match(conferirRegistro(reg, registroDaSelecao('v8', sel))[0], /critério qualidade no prebuild × v8/);
  assert.match(conferirRegistro(reg, registroDaSelecao('qualidade', sel.slice(1)))[0], /paróquias no prebuild/);
  const trocada = [...sel.slice(1), { uf: 'xx', cidade: 'y', slug: 'z' }];
  assert.match(conferirRegistro(reg, registroDaSelecao('qualidade', trocada))[0], /paróquias diferentes/);
  assert.deepEqual(conferirRegistro(null, reg), ['registro do prebuild ausente']);
});

test('janelas: sem aviso quando recentes e próximas; avisa idade > 45 dias e diferença > 14 dias', () => {
  const demanda = { inicio: '2026-09-01', fim: '2026-10-24' };
  const protecao = { inicio: '2026-07-30', fim: '2026-10-27' };
  assert.deepEqual(avaliarJanelas({ demanda, protecao, hoje: '2026-10-28' }), []);
  assert.deepEqual(avaliarJanelas({ demanda, protecao, hoje: '2026-12-08' }), []); // 45 dias após 24/10
  const velha = avaliarJanelas({ demanda, protecao, hoje: '2026-12-09' });
  assert.equal(velha.length, 1);
  assert.match(velha[0], /demanda terminou há 46 dias/);
  const longe = avaliarJanelas({ demanda, protecao: { fim: '2026-11-08' }, hoje: '2026-11-09' });
  assert.match(longe[0], /a 15 dias/);
  assert.deepEqual(avaliarJanelas({ demanda: null, protecao: null, hoje: '2026-10-28' }), []);
});

test('registro do prebuild: gravado a partir do cache, sem depender do sitemap da API', () => {
  const base = montarBase({ demanda: ['sp/sao-paulo/sp-b'] });
  const registro = gravarRegistroCriterio(base, {});
  assert.equal(registro.criterio, 'demanda');
  assert.deepEqual(JSON.parse(readFileSync(join(base, ARQUIVO_REGISTRO), 'utf-8')), registro);
  assert.deepEqual(conferirRegistro(registro, registroDaSelecao(criterioAtivo(base, {}), paroquiasDoDisco(base, {}))), []);
});

test('registro do prebuild: sem cache não grava nada (build:dev)', () => {
  const base = mkdtempSync(join(tmpdir(), 'v8-sem-cache-'));
  mkdirSync(join(base, '.prerender-cache'));
  assert.equal(gravarRegistroCriterio(base, {}), null);
  assert.equal(existsSync(join(base, ARQUIVO_REGISTRO)), false);
});

test('registro do prebuild: erro de critério sobe (não vira aviso nem registro parcial)', () => {
  const base = montarBase({ protecao: '{ quebrado' });
  assert.throws(() => gravarRegistroCriterio(base, V8), /não é JSON/);
  assert.equal(existsSync(join(base, ARQUIVO_REGISTRO)), false);
});
