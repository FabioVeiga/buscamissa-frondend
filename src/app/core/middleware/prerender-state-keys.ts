import { makeStateKey, StateKey } from '@angular/core';

/**
 * Chaves de TransferState compartilhadas entre os interceptors de prerender
 * (server, que ESCREVEM) e o interceptor de leitura (browser, que LÊ).
 *
 * Motivo: no prerender o dado de paróquia/cidade é servido da memória (bulk) pelo
 * interceptor só-server. Sem transferir esse dado, o cliente RE-BUSCA na API ao
 * hidratar → o details mostra o skeleton (isLoading) por cima do conteúdo já
 * prerenderizado → flash + CLS. Escrevendo no TransferState no server e lendo no
 * cliente, o getByCidadeESlug resolve de forma síncrona no browser (isLoading fica
 * true por ~0ms) → sem skeleton, sem CLS, sem request duplicado.
 *
 * As regexes são as MESMAS dos interceptors de paróquia/cidade — fonte única aqui
 * pra server e client construírem chaves idênticas (casam server↔client).
 */

const RE_PAROQUIA = /v2\/Igreja\/paroquia\/([^/]+)\/([^/]+)\/([^/?]+)/i;
const RE_CIDADE = /v2\/Igreja\/cidade\/([^/]+)\/([^/?]+)/i;

/** Chave lógica uf/cidade/slug (lowercase) a partir da URL, ou null se não casar. */
export function chaveParoquia(url: string): string | null {
  const m = url.match(RE_PAROQUIA);
  if (!m) return null;
  return `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}/${decodeURIComponent(m[3])}`.toLowerCase();
}

/** Chave lógica uf/cidade (lowercase) a partir da URL, ou null se não casar. */
export function chaveCidade(url: string): string | null {
  const m = url.match(RE_CIDADE);
  if (!m) return null;
  return `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`.toLowerCase();
}

/** StateKey do TransferState para uma resposta de paróquia. */
export function stateKeyParoquia(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pp:${chave}`);
}

/** StateKey do TransferState para uma resposta de cidade. */
export function stateKeyCidade(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pc:${chave}`);
}
