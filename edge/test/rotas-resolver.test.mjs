import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classificar } from '../src/rotas.mjs';
import { resolver } from '../src/resolver.mjs';
import { manifestoBase } from './helpers.mjs';

/** [caminho (como sai de URL.pathname), opções, resultado esperado] */
const CLASSIFICACAO = [
  ['/', {}, { tipo: 'fora' }],
  ['/cidades', {}, { tipo: 'fora' }],
  ['/paroquiaX/sp/a/b', {}, { tipo: 'fora' }],
  ['/paroquia/sp/sao-paulo/cristo-rei', {}, { tipo: 'paroquia', uf: 'sp', cidade: 'sao-paulo', slug: 'cristo-rei' }],
  ['/paroquia/sp/sao-paulo/799', {}, { tipo: 'paroquia', uf: 'sp', cidade: 'sao-paulo', slug: '799' }],
  ['/paroquia/sp/sao-paulo/cristo-rei/', {}, { tipo: 'normalizar', destino: '/paroquia/sp/sao-paulo/cristo-rei' }],
  ['/paroquia/SP/Sao-Paulo/Cristo-Rei', {}, { tipo: 'normalizar', destino: '/paroquia/sp/sao-paulo/cristo-rei' }],
  ['/PAROQUIA/sp/sao-paulo/cristo-rei', {}, { tipo: 'normalizar', destino: '/paroquia/sp/sao-paulo/cristo-rei' }],
  ['/paroquia/', {}, { tipo: 'invalida' }],
  ['/paroquia/sp', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/sao-paulo', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/sao-paulo/a/b', {}, { tipo: 'invalida' }],
  ['/paroquia/sp//a', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/sao-paulo/a%2Fb', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/s%C3%A3o-paulo/a', {}, { tipo: 'invalida' }],
  ['/paroquia/xx/sao-paulo/a', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/sao_paulo/a', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/sao-paulo/a--b', {}, { tipo: 'invalida' }],
  ['/paroquia/sp/sao-paulo/a.html', {}, { tipo: 'invalida' }],
  // Cidades só quando ligadas.
  ['/missas/sp/sao-paulo', {}, { tipo: 'fora' }],
  ['/missas/sp/sao-paulo', { cidades: true }, { tipo: 'cidade', uf: 'sp', cidade: 'sao-paulo' }],
  ['/missas/sp/sao-paulo/', { cidades: true }, { tipo: 'normalizar', destino: '/missas/sp/sao-paulo' }],
  ['/missas/sp', { cidades: true }, { tipo: 'fora' }],
  ['/missas/sp/sao-paulo/extra', { cidades: true }, { tipo: 'fora' }],
  ['/missas/xx/sao-paulo', { cidades: true }, { tipo: 'invalida' }],
];

for (const [caminho, opcoes, esperado] of CLASSIFICACAO) {
  test(`classificar ${caminho} ${JSON.stringify(opcoes)}`, () => {
    assert.deepEqual(classificar(caminho, opcoes), esperado);
  });
}

test('URL.pathname já resolve ".." antes de classificar', () => {
  const { pathname } = new URL('https://x.test/paroquia/sp/sao-paulo/../../../admin');
  assert.deepEqual(classificar(pathname), { tipo: 'fora' });
  const outro = new URL('https://x.test/paroquia/sp/../sp/sao-paulo/a').pathname;
  assert.deepEqual(classificar(outro), { tipo: 'paroquia', uf: 'sp', cidade: 'sao-paulo', slug: 'a' });
});

const rotaParoquia = (slug) => ({ tipo: 'paroquia', uf: 'sp', cidade: 'sao-paulo', slug });
const rotaCidade = { tipo: 'cidade', uf: 'sp', cidade: 'sao-paulo' };

test('resolver: paróquia publicada serve o HTML versionado', () => {
  assert.deepEqual(resolver(rotaParoquia('paroquia-cristo-rei'), manifestoBase()), {
    acao: 'html', arquivo: 'html/sp/sao-paulo/42-abc1234/paroquia-cristo-rei.html',
  });
});

test('resolver: igreja sem página serve o shell', () => {
  assert.deepEqual(resolver(rotaParoquia('capela-sem-pagina'), manifestoBase()), {
    acao: 'shell', arquivo: 'shell/abc1234/index.html',
  });
});

test('resolver: redirecionamento é 301 para o destino do manifesto', () => {
  assert.deepEqual(resolver(rotaParoquia('mudou-de-cidade'), manifestoBase()), {
    acao: 'redirecionar', destino: '/paroquia/sp/osasco/mudou-de-cidade', status: 301,
  });
});

test('resolver: slug desconhecido é 404', () => {
  assert.deepEqual(resolver(rotaParoquia('nao-existe'), manifestoBase()), { acao: 'nao-encontrada' });
});

test('resolver: nomes herdados de Object não são paróquias', () => {
  for (const slug of ['constructor', 'tostring', 'hasownproperty']) {
    assert.equal(resolver(rotaParoquia(slug), manifestoBase()).acao, 'nao-encontrada');
  }
});

test('resolver: sem manifesto, a origem atende (comportamento de hoje)', () => {
  assert.deepEqual(resolver(rotaParoquia('qualquer'), null), { acao: 'origem', motivo: 'sem-manifesto' });
  assert.deepEqual(resolver(rotaCidade, null), { acao: 'origem', motivo: 'sem-manifesto' });
});

test('resolver: lápide responde 404, mas mantém os 301', () => {
  const lapide = manifestoBase({
    lapide: true, paroquias: {}, semPagina: [], redir: { a: '/paroquia/sp/osasco/a' },
  });
  assert.equal(resolver(rotaParoquia('paroquia-cristo-rei'), lapide).acao, 'nao-encontrada');
  assert.equal(resolver(rotaParoquia('a'), lapide).acao, 'redirecionar');
  assert.equal(resolver(rotaCidade, lapide).acao, 'nao-encontrada');
});

test('resolver: página da cidade', () => {
  const comPagina = manifestoBase({ pagina: '42-abc1234' });
  assert.deepEqual(resolver(rotaCidade, comPagina), { acao: 'html', arquivo: 'html/sp/sao-paulo/42-abc1234/_cidade.html' });
  assert.deepEqual(resolver(rotaCidade, manifestoBase()), { acao: 'origem', motivo: 'cidade-sem-pagina-publicada' });
});

test('resolver: rotas sem manifesto', () => {
  assert.deepEqual(resolver({ tipo: 'fora' }, null), { acao: 'origem', motivo: 'rota-fora' });
  assert.deepEqual(resolver({ tipo: 'invalida' }, null), { acao: 'nao-encontrada' });
  assert.deepEqual(resolver({ tipo: 'normalizar', destino: '/paroquia/sp/a/b' }, null), {
    acao: 'redirecionar', destino: '/paroquia/sp/a/b', status: 301,
  });
});
