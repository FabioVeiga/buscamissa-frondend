import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAS_INTENCAO, linksFolhaDiaCidade, verificarLinksDiaCidade } from './verificar-links-dia-cidade.mjs';

test('acha href relativo e absoluto para /missa-{dia}/{uf}/{cidade}, nos 7 dias', () => {
  for (const dia of DIAS_INTENCAO) {
    const html = `<a href="/missa-${dia}/mg/rio-novo">x</a><a href="https://buscamissa.com.br/missa-${dia}/sp/santos">y</a>`;
    assert.deepEqual(linksFolhaDiaCidade(html), [`/missa-${dia}/mg/rio-novo`, `/missa-${dia}/sp/santos`]);
  }
});

test('acha URL da folha dentro de JSON-LD (item, url, @id)', () => {
  const html = '<script type="application/ld+json">{"item":"https://buscamissa.com.br/missa-sexta-feira/mg/alfenas","url":"/missa-domingo/pb/joao-pessoa","@id":"https://buscamissa.com.br/missa-sabado/rj/niteroi"}</script>';
  assert.deepEqual(linksFolhaDiaCidade(html).sort(), [
    '/missa-domingo/pb/joao-pessoa',
    '/missa-sabado/rj/niteroi',
    '/missa-sexta-feira/mg/alfenas',
  ]);
});

test('não acusa os níveis válidos nem o formato novo', () => {
  const html = [
    '<a href="/missa-sexta-feira">nacional</a>',
    '<a href="/missa-sexta-feira/mg">uf</a>',
    '<link rel="canonical" href="https://buscamissa.com.br/missa-sexta-feira/mg">',
    '<a href="/missas/mg/rio-novo?dia=sexta">cidade filtrada</a>',
    '<a href="/missa-agora">agora</a>',
    '<a href="/missa-hoje">hoje</a>',
    '<a href="/paroquia/mg/rio-novo/matriz">paróquia</a>',
    '{"item":"https://buscamissa.com.br/missas/mg/rio-novo"}',
  ].join('');
  assert.deepEqual(linksFolhaDiaCidade(html), []);
});

test('caminho com mais de 3 segmentos não é a folha', () => {
  assert.deepEqual(linksFolhaDiaCidade('<a href="/missa-domingo/mg/rio-novo/extra">'), []);
});

test('texto solto (sem href nem chave JSON-LD) não conta como link', () => {
  assert.deepEqual(linksFolhaDiaCidade('<p>/missa-domingo/mg/rio-novo</p>'), []);
});

test('verificar: falha com ofensor, passa sem, e dist vazio não passa', () => {
  const ruim = verificarLinksDiaCidade([
    { arquivo: 'missa-domingo/mg/index.html', html: '<a href="/missa-domingo/mg/bh">' },
    { arquivo: 'missas/mg/index.html', html: '<a href="/missas/mg/bh">' },
  ]);
  assert.equal(ruim.ok, false);
  assert.deepEqual(ruim.ofensores, [{ arquivo: 'missa-domingo/mg/index.html', links: ['/missa-domingo/mg/bh'] }]);

  assert.equal(verificarLinksDiaCidade([{ arquivo: 'a.html', html: '<a href="/missas/mg/bh?dia=domingo">' }]).ok, true);
  assert.equal(verificarLinksDiaCidade([]).ok, false);
});
