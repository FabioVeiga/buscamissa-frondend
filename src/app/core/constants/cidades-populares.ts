export interface CidadePopular {
  nome: string;
  uf: string;
  slug: string;
}

/**
 * Lista curada de cidades exibida como fallback na home e na página de cidade
 * (quando não há geolocalização/cidade detectada). UF em maiúsculo.
 * Fonte única — antes duplicada em home.component e city.component.
 */
export const CIDADES_POPULARES: CidadePopular[] = [
  { nome: 'São Paulo', uf: 'SP', slug: 'sao-paulo' },
  { nome: 'Campinas', uf: 'SP', slug: 'campinas' },
  { nome: 'São José dos Campos', uf: 'SP', slug: 'sao-jose-dos-campos' },
  { nome: 'Ribeirão Preto', uf: 'SP', slug: 'ribeirao-preto' },
  { nome: 'Santos', uf: 'SP', slug: 'santos' },
  { nome: 'Sorocaba', uf: 'SP', slug: 'sorocaba' },
  { nome: 'Curitiba', uf: 'PR', slug: 'curitiba' },
  { nome: 'Brasília', uf: 'DF', slug: 'brasilia' },
  { nome: 'Belo Horizonte', uf: 'MG', slug: 'belo-horizonte' },
];

/**
 * Variante usada na página "Missa Agora" (conjunto distinto, UF em minúsculo
 * por causa do roteamento dessa tela). Mantida separada de propósito — unificar
 * com CIDADES_POPULARES é uma decisão de produto (muda as cidades exibidas).
 */
export const CIDADES_POPULARES_MISSA_AGORA: CidadePopular[] = [
  { nome: 'São Paulo', uf: 'sp', slug: 'sao-paulo' },
  { nome: 'Campinas', uf: 'sp', slug: 'campinas' },
  { nome: 'Rio de Janeiro', uf: 'rj', slug: 'rio-de-janeiro' },
  { nome: 'Brasília', uf: 'df', slug: 'brasilia' },
  { nome: 'Belo Horizonte', uf: 'mg', slug: 'belo-horizonte' },
  { nome: 'Curitiba', uf: 'pr', slug: 'curitiba' },
  { nome: 'Porto Alegre', uf: 'rs', slug: 'porto-alegre' },
];
