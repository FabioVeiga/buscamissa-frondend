import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDeCidade, chaveDeParoquia, montarProtecao } from './protecao-prerender.mjs';

test('chaves a partir de caminho ou URL absoluta; outros caminhos ficam de fora', () => {
  assert.equal(chaveDeParoquia('https://buscamissa.com.br/paroquia/SP/campinas/a'), 'sp/campinas/a');
  assert.equal(chaveDeParoquia('/paroquia/sp/campinas/a/'), 'sp/campinas/a');
  assert.equal(chaveDeParoquia('/missas/sp/campinas'), null);
  assert.equal(chaveDeCidade('/missas/sp/campinas'), 'sp/campinas');
  assert.equal(chaveDeCidade('/missas/sp'), null);
});

test('protegidas = atuais com clique; cliques repetidos por dispositivo são somados', () => {
  const dados = montarProtecao({
    atuais: ['https://buscamissa.com.br/paroquia/sp/campinas/a', 'https://buscamissa.com.br/paroquia/sp/campinas/b', 'https://buscamissa.com.br/missas/sp/campinas'],
    gscParoquias: [
      { caminho: '/paroquia/sp/campinas/a', cliques: 0 },
      { caminho: '/paroquia/sp/campinas/b', cliques: 1 },
      { caminho: '/paroquia/sp/campinas/b', cliques: 2 },
      { caminho: '/paroquia/sp/outra/c', cliques: 9 }, // não é atual: não protege
    ],
    gscCidades: [
      { caminho: '/missas/sp/campinas', cliques: 1 },
      { caminho: '/missas/pa/cumaru-do-norte', cliques: 0 },
    ],
    hoje: '2026-10-28',
    fontes: {},
  });
  assert.deepEqual(dados.atuais, ['sp/campinas/a', 'sp/campinas/b']);
  assert.deepEqual(dados.protegidas, [{ chave: 'sp/campinas/b', cliques: 3 }]);
  assert.deepEqual(dados.cidadesComDemanda, ['sp/campinas']);
});
