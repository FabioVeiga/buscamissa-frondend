/**
 * Gera o arquivo de proteção do prerender (critério V8). MANUAL, fora do build — como
 * `atualizar-demanda-paroquias.mjs`. O build só lê o resultado.
 *
 * Uso:
 *   node scripts/gerar-protecao-prerender.mjs \
 *     --sitemap sitemap-publicado.xml \
 *     --gsc-paroquias paroquias.csv --gsc-cidades cidades.csv \
 *     --janela 2026-07-30:2026-10-27 --saida scripts/data/prerender-protecao.json
 *
 * CSVs sem cabeçalho, uma linha por página: `caminho,cliques` (colunas extras são
 * ignoradas; caminhos repetidos, por exemplo um por dispositivo, são somados).
 * `--saida` é obrigatório: o arquivo versionado só muda quando alguém pede.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { montarProtecao } from './lib/protecao-prerender.mjs';

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const sitemap = arg('sitemap');
const csvParoquias = arg('gsc-paroquias');
const csvCidades = arg('gsc-cidades');
const janela = arg('janela');
const saida = arg('saida');
if (!sitemap || !csvParoquias || !csvCidades || !janela || !saida) {
  console.error('uso: --sitemap <xml> --gsc-paroquias <csv> --gsc-cidades <csv> --janela AAAA-MM-DD:AAAA-MM-DD --saida <json>');
  process.exit(1);
}

const lerCsv = (arquivo) =>
  readFileSync(arquivo, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [caminho, cliques] = l.replace(/"/g, '').split(',');
      return { caminho, cliques: Number(cliques) || 0 };
    });

const atuais = [...readFileSync(sitemap, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const [inicio, fim] = janela.split(':');
const dados = montarProtecao({
  atuais,
  gscParoquias: lerCsv(csvParoquias),
  gscCidades: lerCsv(csvCidades),
  hoje: new Date().toISOString().slice(0, 10),
  fontes: { atuais: sitemap, searchConsole: { inicio, fim, metrica: 'cliques por página' } },
});
writeFileSync(saida, `${JSON.stringify(dados, null, 2)}\n`);
console.log(
  `[protecao-prerender] ${dados.atuais.length} atuais, ${dados.protegidas.length} protegidas, ${dados.cidadesComDemanda.length} cidades com demanda → ${saida}`,
);
