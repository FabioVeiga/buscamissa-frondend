import { STATES } from '../../core/constants/states';
import { NominatimAddress } from '../../core/services/geolocation.service';

/**
 * Posição do usuário → cidade com página no site. Funções puras, sem rede: quem
 * chama faz o `navigator.geolocation` e o Nominatim (via `GeolocationService`).
 *
 * Mesma regra que a home usa em `_resolverUf`/`_reverseGeocode` (lá ainda inline;
 * unificar as duas é outra mudança, fora do escopo de /cidades).
 */

/** Minúsculas, sem acento, sem espaço nas pontas. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * UF a partir da resposta do Nominatim. Prefere o ISO 3166-2 (`BR-PR`), que é
 * inequívoco. No fallback por nome, o match EXATO vem antes da substring:
 * "parana" contém "para", e a busca por substring devolvia PA para o Paraná.
 */
export function resolverUf(addr: NominatimAddress | null | undefined): string | null {
  if (!addr) return null;
  const iso = String(addr['ISO3166-2-lvl4'] ?? '');
  const daIso = iso.startsWith('BR-') ? iso.slice(3).toUpperCase() : '';
  if (STATES.some((s) => s.sigla === daIso)) return daIso;

  const nomeEstado = norm(String(addr.state ?? ''));
  if (!nomeEstado) return null;
  const exato = STATES.find((s) => norm(s.nome) === nomeEstado);
  if (exato) return exato.sigla;
  const parcial = STATES.find((s) => nomeEstado.includes(norm(s.nome)) || norm(s.nome).includes(nomeEstado));
  return parcial?.sigla ?? null;
}

/** Nome do município na resposta do Nominatim (o campo varia com o porte). */
export function nomeDoMunicipio(addr: NominatimAddress | null | undefined): string {
  return String(addr?.city || addr?.town || addr?.village || addr?.municipality || '').trim();
}

export interface CidadeComPagina {
  nome: string;
  /** UF em minúsculo, como na rota. */
  uf: string;
  cidadeSlug: string;
}

/**
 * Cidade do usuário entre as que TÊM página. O slug vem do backend, nunca de um
 * slugify no cliente: `/missas/*` está fora do navigationFallback, então slug
 * errado é 404 real. Sem match, devolve null e quem chama não navega.
 */
export function acharCidade<T extends CidadeComPagina>(
  nome: string,
  uf: string,
  cidades: readonly T[],
): T | null {
  const alvo = norm(nome);
  const ufMin = uf.toLowerCase();
  if (!alvo) return null;
  return cidades.find((c) => c.uf.toLowerCase() === ufMin && norm(c.nome) === alvo) ?? null;
}
