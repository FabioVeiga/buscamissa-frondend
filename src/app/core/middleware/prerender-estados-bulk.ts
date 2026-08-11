import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from '../../../environments/environment';

/**
 * Carga SÓ-SERVER do bulk `/v2/seo/estados`, compartilhada pelos dois interceptors
 * de prerender que dependem dele:
 *
 * - `PrerenderEstadoInterceptor` → serve o endpoint POR-ITEM (`/v2/seo/estado/{uf}`)
 *   das 26 páginas `/missas/{uf}`, e precisa do mapa uf → payload;
 * - `PrerenderEstadosInterceptor` → serve o BULK para a página `/estados`, e
 *   precisa da lista.
 *
 * Uma leitura por build para os dois (a Promise é memoizada), a partir do arquivo
 * que `scripts/baixar-bulk-prerender.mjs` deixa em `.prerender-cache/`.
 */

export interface EstadoPayload {
  uf: string;
  estado: string;
  totalCidades: number;
  totalParoquias: number;
  seo: unknown;
  cidades: unknown[];
}

/** Cache da Promise da lista (1 leitura por build). */
let cacheLista: Promise<EstadoPayload[]> | null = null;
let cacheMapa: Promise<Map<string, EstadoPayload>> | null = null;

/** Base absoluta da API sem o sufixo /api — /v2/seo/estados é rota absoluta. */
function baseUrl(): string {
  return String(environment.config.apiURL ?? '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

function lerDoDisco(): EstadoPayload[] | null {
  const arquivo = join(process.cwd(), '.prerender-cache', 'estados.json');
  if (!existsSync(arquivo)) return null;
  return JSON.parse(readFileSync(arquivo, 'utf-8')) as EstadoPayload[];
}

async function carregarLista(): Promise<EstadoPayload[]> {
  const inicio = Date.now();
  let lista = lerDoDisco();
  const origem = lista ? 'disco (.prerender-cache)' : 'bulk /v2/seo/estados';
  if (!lista) {
    const res = await fetch(`${baseUrl()}/v2/seo/estados`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    lista = (await res.json()) as EstadoPayload[];
  }

  const valida = (Array.isArray(lista) ? lista : []).filter((e) => e?.uf);
  console.log(`[prerender] ${valida.length} estados carregados de ${origem} em ${Date.now() - inicio}ms.`);
  return valida;
}

/** Lista de estados do bulk. Vazia se o bulk falhar — nunca rejeita. */
export function obterListaEstados(): Promise<EstadoPayload[]> {
  if (!cacheLista) {
    cacheLista = carregarLista().catch((err) => {
      cacheLista = null;
      console.warn(`[prerender] bulk /v2/seo/estados falhou (${err?.message ?? err}) — caindo para chamadas individuais.`);
      return [] as EstadoPayload[];
    });
  }
  return cacheLista;
}

/** Mapa uf (lowercase) → payload. Vazio se o bulk falhar — nunca rejeita. */
export function obterMapaEstados(): Promise<Map<string, EstadoPayload>> {
  if (!cacheMapa) {
    cacheMapa = obterListaEstados().then((lista) => {
      const mapa = new Map<string, EstadoPayload>();
      for (const e of lista) mapa.set(e.uf.toLowerCase(), e);
      return mapa;
    });
  }
  return cacheMapa;
}
