// Guard de prebuild: a lista de cada página de cidade (cidades.json) contém TODAS as
// paróquias da cidade (paroquias.json, sem corte)? Comparação por id — ver
// scripts/lib/verificar-cobertura-cidades.mjs.
//
// Uso: node scripts/verificar-cobertura-cidades.mjs   (depois de baixar-bulk-prerender)
//
// Sai 1 em DOIS casos, de propósito:
//   - divergente:    alguma cidade perdeu (ou ganhou) paróquia;
//   - inverificável: não deu para checar (arquivo ausente/malformado, bulks de downloads
//                    diferentes). Não conseguir verificar NÃO conta como aprovado.

import { existsSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { motivoSnapshotsDesalinhados, verificarCoberturaCidades } from './lib/verificar-cobertura-cidades.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, '..', '.prerender-cache');
const ARQ_CIDADES = join(CACHE, 'cidades.json');
const ARQ_PAROQUIAS = join(CACHE, 'paroquias.json');

function inverificavel(motivo) {
  console.error(`\n❌ [cobertura-cidades] NÃO VERIFICADO: ${motivo}.`);
  console.error('   Sem essa checagem não há garantia de que as páginas de cidade listam todas as paróquias.');
  process.exit(1);
}

function lerJson(arquivo) {
  if (!existsSync(arquivo)) inverificavel(`${arquivo} não existe`);
  try {
    return JSON.parse(readFileSync(arquivo, 'utf-8'));
  } catch (err) {
    inverificavel(`${arquivo} não é JSON válido (${err?.message ?? err})`);
  }
}

const cidades = lerJson(ARQ_CIDADES);
const paroquias = lerJson(ARQ_PAROQUIAS);

const desalinhado = motivoSnapshotsDesalinhados(statSync(ARQ_CIDADES).mtimeMs, statSync(ARQ_PAROQUIAS).mtimeMs);
if (desalinhado) inverificavel(desalinhado);

const r = verificarCoberturaCidades(cidades, paroquias);

if (r.status === 'inverificavel') inverificavel(r.motivo);

if (r.status === 'divergente') {
  const porTipo = r.problemas.reduce((acc, p) => ({ ...acc, [p.tipo]: (acc[p.tipo] ?? 0) + 1 }), {});
  console.error(`\n❌ [cobertura-cidades] ${r.problemas.length} divergência(s) entre as páginas de cidade e o bulk de paróquias: ${JSON.stringify(porTipo)}`);
  console.error('   faltando = paróquia ativa fora da página da cidade (corte da API?);');
  console.error('   fora-do-bulk = igreja com slug na página mas não no bulk; duplicado; cidade-ausente.\n');
  for (const p of r.problemas.slice(0, 15)) {
    const qtd = p.esperado !== undefined ? ` (esperado ${p.esperado}, listado ${p.listado})` : '';
    const ids = p.ids.slice(0, 10).join(', ') + (p.ids.length > 10 ? ` (+${p.ids.length - 10})` : '');
    console.error(`   ${p.tipo.padEnd(13)} ${p.cidade}${qtd}: ids ${ids}`);
  }
  if (r.problemas.length > 15) console.error(`   … e mais ${r.problemas.length - 15}.`);
  process.exit(1);
}

const { cidades: nc, paroquias: np, igrejasListadas, semSlug } = r.resumo;
console.log(
  `[cobertura-cidades] OK — ${nc} cidades, ${np} paróquias do bulk todas presentes por id ` +
    `(${igrejasListadas} igrejas listadas${semSlug ? `, ${semSlug} sem slug fora do bulk` : ''}).`,
);
