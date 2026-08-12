export const STATES = [
    { sigla: "AC", nome: "Acre" },
    { sigla: "AL", nome: "Alagoas" },
    { sigla: "AP", nome: "Amapá" },
    { sigla: "AM", nome: "Amazonas" },
    { sigla: "BA", nome: "Bahia" },
    { sigla: "CE", nome: "Ceará" },
    { sigla: "DF", nome: "Distrito Federal" },
    { sigla: "ES", nome: "Espírito Santo" },
    { sigla: "GO", nome: "Goiás" },
    { sigla: "MA", nome: "Maranhão" },
    { sigla: "MT", nome: "Mato Grosso" },
    { sigla: "MS", nome: "Mato Grosso do Sul" },
    { sigla: "MG", nome: "Minas Gerais" },
    { sigla: "PA", nome: "Pará" },
    { sigla: "PB", nome: "Paraíba" },
    { sigla: "PR", nome: "Paraná" },
    { sigla: "PE", nome: "Pernambuco" },
    { sigla: "PI", nome: "Piauí" },
    { sigla: "RJ", nome: "Rio de Janeiro" },
    { sigla: "RN", nome: "Rio Grande do Norte" },
    { sigla: "RS", nome: "Rio Grande do Sul" },
    { sigla: "RO", nome: "Rondônia" },
    { sigla: "RR", nome: "Roraima" },
    { sigla: "SC", nome: "Santa Catarina" },
    { sigla: "SP", nome: "São Paulo" },
    { sigla: "SE", nome: "Sergipe" },
    { sigla: "TO", nome: "Tocantins" },
  ];

/**
 * Preposição de regência ("no"/"na"/"em") por UF — não é regra gramatical
 * derivável (gênero de topônimo tem muita exceção em pt-BR), por isso é mapa
 * explícito. Alimenta o H1 de `/missas/:uf`: "Horários de Missa no Paraná",
 * "... em São Paulo", "... na Bahia" — em vez do genérico e incorreto
 * "no Estado de X" que não respeita a contração do artigo.
 */
const PREPOSICAO_UF: Record<string, 'no' | 'na' | 'em'> = {
  AC: 'no', AL: 'em', AP: 'no', AM: 'no', BA: 'na', CE: 'no',
  DF: 'no', ES: 'no', GO: 'em', MA: 'no', MT: 'no', MS: 'no',
  MG: 'em', PA: 'no', PB: 'na', PR: 'no', PE: 'em', PI: 'no',
  RJ: 'no', RN: 'no', RS: 'no', RO: 'em', RR: 'em', SC: 'em',
  SP: 'em', SE: 'em', TO: 'no',
};

/** Só a preposição ("no"/"na"/"em") de uma UF. Aceita sigla ou nome; sem UF reconhecida, "em". */
export function preposicaoDe(siglaOuNome: string): 'no' | 'na' | 'em' {
  const porSigla = STATES.find((e) => e.sigla === siglaOuNome.toUpperCase());
  const estado = porSigla ?? STATES.find((e) => e.nome === siglaOuNome);
  return (estado && PREPOSICAO_UF[estado.sigla]) ?? 'em';
}

/**
 * Nome do estado já precedido da preposição correta (ex.: "no Paraná",
 * "em São Paulo"). Aceita sigla ou nome; sem UF reconhecida, cai em "em {nome}"
 * (degrada de forma segura, nunca lança).
 */
export function nomeComPreposicao(siglaOuNome: string): string {
  const porSigla = STATES.find((e) => e.sigla === siglaOuNome.toUpperCase());
  const estado = porSigla ?? STATES.find((e) => e.nome === siglaOuNome);
  if (!estado) return `em ${siglaOuNome}`;
  return `${preposicaoDe(estado.sigla)} ${estado.nome}`;
}
