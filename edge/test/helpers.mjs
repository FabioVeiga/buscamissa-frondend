/** Fábrica de manifestos válidos para testes e benchmark. */
export function manifestoBase(sobrescrever = {}) {
  return {
    esquema: 1,
    uf: 'sp',
    cidade: 'sao-paulo',
    versao: 42,
    execucao: 'gh-123-1',
    commit: 'abc1234',
    geradoEm: '2026-11-13T12:00:00.000Z',
    reversao: false,
    lapide: false,
    shell: 'shell/abc1234/index.html',
    paroquias: {
      'paroquia-cristo-rei': '42-abc1234',
    },
    semPagina: ['capela-sem-pagina'],
    redir: {
      'paroquia-antiga': '/paroquia/sp/sao-paulo/paroquia-cristo-rei',
      'mudou-de-cidade': '/paroquia/sp/osasco/mudou-de-cidade',
    },
    ...sobrescrever,
  };
}

/**
 * Manifesto do tamanho de São Paulo medido em produção (509 igrejas). Slugs no
 * formato real (`paroquia-nossa-senhora-...-bairro`), para o JSON ter tamanho
 * realista (~26 KB medidos em produção só com os slugs).
 */
export function manifestoGrande(n = 509) {
  const paroquias = {};
  const semPagina = [];
  for (let i = 0; i < n; i++) {
    const slug = `paroquia-nossa-senhora-da-conceicao-bairro-${i}`;
    if (i % 5 === 0) semPagina.push(slug);
    else paroquias[slug] = '42-abc1234';
  }
  return manifestoBase({ paroquias, semPagina, redir: {} });
}
