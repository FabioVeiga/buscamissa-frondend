/**
 * Atualiza `scripts/data/paroquias-demanda.json` — a ordem por demanda do "resto" do
 * prerender de paróquias — a partir de um export do Google Search Console.
 *
 * NÃO roda no build. É manual, no máximo uma vez por mês, e o resultado é revisado e
 * commitado como qualquer código (o build só lê o arquivo).
 *
 * Uso:
 *   node scripts/atualizar-demanda-paroquias.mjs --gsc caminho/gsc.csv \
 *     --janela 2026-09-01:2026-10-24 [--cache .prerender-cache/paroquias.json] \
 *     [--hoje 2026-10-27] [--max-trocas 150] [--desde-semente 2026-08-23]
 *
 * Sem arquivo anterior (primeira geração), parte do resto que o critério de qualidade
 * prerenderiza hoje — as regras de saída valem para ele também. A primeira geração
 * (Fase 1, out/2026) usou `--max-trocas 600`; os ciclos seguintes usam o padrão.
 *
 * `--gsc`: CSV com cabeçalho `mes,caminho,impressoes,cliques` — uma linha por página
 * de paróquia por mês. Export do Search Console (Supermetrics: data source GW,
 * conta sc-domain:buscamissa.com.br, report_type STANDARD, campos
 * Yearmonth, pagepath, clicks, impressions, filtro `pagepath =@ /paroquia/`).
 * Use os ~2 últimos meses: o site cresceu muito em 2026 e janelas longas pesam
 * meses em que ele era bem menor.
 *
 * `--cache`: o mesmo `paroquias.json` do prebuild (`node scripts/baixar-bulk-prerender.mjs prod`).
 *
 * Reversão: commitar a versão anterior do arquivo, ou `PRERENDER_PAROQUIAS_CRITERIO=qualidade`
 * no build (ver `selecionar-paroquias-prerender.mjs`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ARQUIVO_DEMANDA } from './lib/selecionar-paroquias-prerender.mjs';
import { anteriorPelaQualidade, atualizarDemanda, CRITERIOS_PADRAO } from './lib/demanda-paroquias.mjs';

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : padrao;
}

function lerCsv(caminho) {
  const [cabecalho, ...linhas] = readFileSync(caminho, 'utf-8').trim().split(/\r?\n/);
  const colunas = cabecalho.split(',').map((c) => c.trim());
  for (const obrigatoria of ['mes', 'caminho', 'impressoes', 'cliques']) {
    if (!colunas.includes(obrigatoria)) throw new Error(`coluna "${obrigatoria}" ausente em ${caminho}`);
  }
  return linhas.map((l) => Object.fromEntries(l.split(',').map((v, i) => [colunas[i], v.trim()])));
}

const gscCsv = argumento('gsc');
const janela = argumento('janela');
if (!gscCsv || !janela) {
  console.error('uso: node scripts/atualizar-demanda-paroquias.mjs --gsc <csv> --janela AAAA-MM-DD:AAAA-MM-DD');
  process.exit(1);
}
const [inicio, fim] = janela.split(':');
const cache = argumento('cache', join('.prerender-cache', 'paroquias.json'));
const hoje = argumento('hoje', new Date().toISOString().slice(0, 10));
const maxTrocas = Number(argumento('max-trocas', CRITERIOS_PADRAO.maxTrocas));

const saida = join(process.cwd(), ARQUIVO_DEMANDA);
const lista = JSON.parse(readFileSync(cache, 'utf-8'));

// Sem arquivo anterior, o ponto de partida é o que o critério de qualidade prerenderiza
// hoje — no ar desde a decisão do teto de 1.900 (2026-08-23, ver app.routes.server.ts).
const semente = argumento('desde-semente', '2026-08-23');
const anterior = existsSync(saida)
  ? JSON.parse(readFileSync(saida, 'utf-8'))
  : anteriorPelaQualidade(lista, semente);

const { resto, relatorio } = atualizarDemanda({
  lista,
  gsc: lerCsv(gscCsv),
  anterior,
  hoje,
  criterios: { maxTrocas },
});

const arquivo = {
  versao: 1,
  geradoEm: hoje,
  fonte: 'Google Search Console — impressões por página /paroquia/',
  janela: { inicio, fim },
  criterios: relatorio.criterios,
  vagas: relatorio.vagas,
  resto,
};
mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, JSON.stringify(arquivo, null, 2) + '\n');

const porMotivo = (lista) => Object.entries(lista.reduce((a, x) => ({ ...a, [x.motivo]: (a[x.motivo] ?? 0) + 1 }), {}));
console.log(`[demanda-paroquias] piso ${relatorio.piso} + citação ${relatorio.citacao} = ${relatorio.fixas} fixas | ${relatorio.vagas} vagas no resto`);
console.log(`[demanda-paroquias] resto por demanda: ${resto.length} | entradas ${JSON.stringify(porMotivo(relatorio.entradas))} | saídas ${JSON.stringify(porMotivo(relatorio.saidas))} | trocas ${relatorio.trocas}/${maxTrocas}`);
console.log(`[demanda-paroquias] gravado em ${ARQUIVO_DEMANDA}`);
