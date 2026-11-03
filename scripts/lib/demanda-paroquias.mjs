/**
 * Regras de ENTRADA e SAÍDA do "resto" do prerender de paróquias (as vagas que
 * sobram depois do piso por cidade e das citações externas — ver
 * `selecionar-paroquias-prerender.mjs`). Função pura; o CLI que lê o Search Console e
 * grava o arquivo é `scripts/atualizar-demanda-paroquias.mjs`.
 *
 * Por que margem e permanência: entre as paróquias de poucas impressões a ordem muda
 * muito de um mês para o outro (top 500 de set/2026 × out/2026: 73% em comum). Trocar
 * pela ordem pura faria páginas entrarem e saírem do HTML — e do sitemap — a cada
 * deploy. Uma paróquia só sai para outra claramente mais buscada, e nunca antes de
 * ficar tempo suficiente para o Google reagir.
 */

import {
  camadasFixas,
  chaveParoquia,
  elegiveisParaPrerender,
  MAX_PAROQUIAS_PRERENDER,
  selecionarParoquias,
} from './selecionar-paroquias-prerender.mjs';

/**
 * Estado anterior para a PRIMEIRA geração do arquivo: o resto que o critério de
 * qualidade prerenderiza hoje. Sem isso a primeira rodada partiria do zero e as regras
 * de saída (margem, permanência) não protegeriam quem já tem HTML — uma paróquia com
 * demanda só no último mês sairia por não cumprir a regra de ENTRADA.
 */
export function anteriorPelaQualidade(lista, desde, teto = MAX_PAROQUIAS_PRERENDER) {
  const { piso, porCitacao } = camadasFixas(elegiveisParaPrerender(lista));
  const fixas = new Set([...piso, ...porCitacao].map(chaveParoquia));
  const resto = selecionarParoquias(lista, { demanda: null, teto })
    .map((s) => `${String(s.uf).toLowerCase()}/${s.cidade}/${s.slug}`)
    .filter((k) => !fixas.has(k));
  return { resto: resto.map((chave) => ({ chave, desde })) };
}

export const CRITERIOS_PADRAO = Object.freeze({
  /** Impressões mínimas na janela para ENTRAR. */
  minImpressoes: 300,
  /** Meses distintos com impressão na janela para ENTRAR (filtra pico isolado). */
  minMeses: 2,
  /** A candidata só substitui uma paróquia que já está dentro com ≥ margem × a demanda dela. */
  margem: 1.5,
  /** Dias mínimos dentro antes de poder sair por troca. */
  permanenciaDias: 60,
  /** Substituições por ciclo. Vaga livre preenchida não conta como troca. */
  maxTrocas: 150,
});

const DIA_MS = 24 * 60 * 60 * 1000;

/** `gsc`: linhas { caminho: '/paroquia/uf/cidade/slug', mes: 'AAAA-MM', impressoes, cliques }. */
function agregar(gsc) {
  const agg = new Map();
  for (const linha of gsc) {
    const m = /^\/paroquia\/([^/]+)\/([^/]+)\/([^/?#]+)\/?$/.exec(linha.caminho ?? '');
    if (!m) continue;
    const chave = `${m[1].toLowerCase()}/${m[2]}/${m[3]}`;
    const a = agg.get(chave) ?? { impressoes: 0, cliques: 0, meses: new Set() };
    a.impressoes += Number(linha.impressoes) || 0;
    a.cliques += Number(linha.cliques) || 0;
    if ((Number(linha.impressoes) || 0) > 0) a.meses.add(linha.mes);
    agg.set(chave, a);
  }
  return agg;
}

/**
 * Calcula o novo resto a partir do anterior. Determinístico: empates por chave.
 *
 * @returns {{ resto: Array<{chave, impressoes, cliques, desde}>, relatorio }}
 */
export function atualizarDemanda({ lista, gsc, anterior = null, hoje, teto = MAX_PAROQUIAS_PRERENDER, criterios = {} }) {
  const c = { ...CRITERIOS_PADRAO, ...criterios };
  const elegiveis = elegiveisParaPrerender(lista);
  const { piso, porCitacao } = camadasFixas(elegiveis);
  const fixas = new Set([...piso, ...porCitacao].map(chaveParoquia));
  const candidatas = new Set(elegiveis.map(chaveParoquia).filter((k) => !fixas.has(k)));
  const vagas = Math.max(0, teto - fixas.size);

  const agg = agregar(gsc);
  const dem = (k) => agg.get(k)?.impressoes ?? 0;
  const porDemandaDesc = (a, b) => dem(b) - dem(a) || a.localeCompare(b);
  const apta = (k) => candidatas.has(k) && dem(k) >= c.minImpressoes && (agg.get(k)?.meses.size ?? 0) >= c.minMeses;

  const saidas = [];
  const desde = new Map();

  // Quem estava dentro e continua candidata segue dentro; quem virou inelegível (sem
  // horário, removida) ou passou para o piso/citação sai sem contar como troca.
  for (const r of anterior?.resto ?? []) {
    if (candidatas.has(r.chave)) desde.set(r.chave, r.desde ?? hoje);
    else saidas.push({ chave: r.chave, motivo: fixas.has(r.chave) ? 'passou-para-camada-fixa' : 'inelegivel' });
  }
  // Se as vagas encolheram (mais cidades no piso), saem as de menor demanda.
  const incumbentes = [...desde.keys()].sort(porDemandaDesc);
  for (const k of incumbentes.slice(vagas)) {
    desde.delete(k);
    saidas.push({ chave: k, motivo: 'sem-vaga' });
  }

  const fila = [...candidatas].filter((k) => apta(k) && !desde.has(k)).sort(porDemandaDesc);
  const entradas = [];

  // 1) Vagas livres.
  while (desde.size < vagas && fila.length) {
    const k = fila.shift();
    desde.set(k, hoje);
    entradas.push({ chave: k, motivo: 'vaga-livre' });
  }

  // 2) Trocas: a melhor candidata de fora contra a mais fraca removível de dentro.
  const hojeMs = Date.parse(hoje);
  const removiveis = [...desde.keys()]
    .filter((k) => hojeMs - Date.parse(desde.get(k)) >= c.permanenciaDias * DIA_MS)
    .sort((a, b) => dem(a) - dem(b) || a.localeCompare(b));
  let trocas = 0;
  while (trocas < c.maxTrocas && fila.length && removiveis.length) {
    const candidata = fila[0];
    const fraca = removiveis[0];
    if (dem(candidata) < c.margem * dem(fraca)) break;
    fila.shift();
    removiveis.shift();
    desde.delete(fraca);
    desde.set(candidata, hoje);
    saidas.push({ chave: fraca, motivo: 'troca' });
    entradas.push({ chave: candidata, motivo: 'troca' });
    trocas++;
  }

  const resto = [...desde.keys()].sort(porDemandaDesc).map((k) => ({
    chave: k,
    impressoes: dem(k),
    cliques: agg.get(k)?.cliques ?? 0,
    desde: desde.get(k),
  }));

  return {
    resto,
    relatorio: { vagas, fixas: fixas.size, piso: piso.length, citacao: porCitacao.length, entradas, saidas, trocas, criterios: c },
  };
}
