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
// Endpoints das páginas de SEO (Fase 3): Estado, Intenção-cidade (folha) e a
// árvore do dia (hubs nacional/UF da intenção).
const RE_ESTADO = /v2\/seo\/estado\/([^/?]+)/i;
// BULK de estados (índice `/estados`). Não colide com RE_ESTADO, que exige a barra
// depois de "estado" — foi justamente por isso que esta URL ficou de fora do
// TransferState por tanto tempo.
const RE_ESTADOS = /v2\/seo\/estados(?:\?|$)/i;
const RE_INTENCAO = /v2\/seo\/missa-dia\/([^/]+)\/([^/]+)\/([^/?]+)/i;
const RE_INTENCAO_ARVORE = /v2\/seo\/missa-dia\/([^/?]+)(?:\?|$)/i;

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

/** Chave lógica uf (lowercase) do endpoint por-item de Estado, ou null. */
export function chaveEstado(url: string): string | null {
  const m = url.match(RE_ESTADO);
  if (!m) return null;
  return decodeURIComponent(m[1]).toLowerCase();
}

/**
 * Chave fixa do bulk de estados (não tem parâmetro), ou null. Existe uma só, mas
 * mantém o mesmo formato das demais para caber em `resolverStateKey`.
 */
export function chaveEstados(url: string): string | null {
  return RE_ESTADOS.test(url) ? 'todos' : null;
}

/** Chave lógica dia/uf/cidade (lowercase) da Intenção-cidade, ou null. */
export function chaveIntencao(url: string): string | null {
  const m = url.match(RE_INTENCAO);
  if (!m) return null;
  return `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}/${decodeURIComponent(m[3])}`.toLowerCase();
}

/** Chave lógica do dia (lowercase) da árvore de intenção (hub), ou null. */
export function chaveIntencaoArvore(url: string): string | null {
  const m = url.match(RE_INTENCAO_ARVORE);
  if (!m) return null;
  return decodeURIComponent(m[1]).toLowerCase();
}

/** StateKey do TransferState para uma resposta de paróquia. */
export function stateKeyParoquia(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pp:${chave}`);
}

/** StateKey do TransferState para uma resposta de cidade. */
export function stateKeyCidade(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pc:${chave}`);
}

/** StateKey do TransferState para uma resposta de Estado. */
export function stateKeyEstado(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pe:${chave}`);
}

/** StateKey do TransferState para o bulk de estados (índice `/estados`). */
export function stateKeyEstados(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pes:${chave}`);
}

/** StateKey do TransferState para uma resposta de Intenção-cidade. */
export function stateKeyIntencao(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pi:${chave}`);
}

/** StateKey do TransferState para a árvore de um dia (hub de intenção). */
export function stateKeyIntencaoArvore(chave: string): StateKey<unknown> {
  return makeStateKey<unknown>(`pia:${chave}`);
}
