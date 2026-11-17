/**
 * Links de navegação (Google Maps / Waze) para uma igreja.
 *
 * Regra única para todo o site:
 * - Coordenada válida (número finito, dentro do Brasil, diferente de 0,0) → navega pela coordenada.
 * - Sem coordenada válida → busca textual com nome, endereço, cidade e UF.
 *   No Waze, a busca textual NÃO usa `navigate=yes`: o usuário escolhe o resultado
 *   em vez de partir direto para o primeiro (que pode ser uma homônima em outra cidade).
 */
export interface DestinoNavegacao {
  nome?: string | null;
  logradouro?: string | null;
  numero?: number | string | null;
  localidade?: string | null;
  uf?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

/** Caixa aproximada do território brasileiro (inclui ilhas oceânicas). */
const BRASIL = { latMin: -34.0, latMax: 5.5, lngMin: -74.1, lngMax: -28.6 };

function paraNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Retorna `[lat, lng]` se a coordenada for utilizável para navegação; senão `null`. */
export function coordenadaValida(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
): [number, number] | null {
  const lat = paraNumero(latitude);
  const lng = paraNumero(longitude);
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < BRASIL.latMin || lat > BRASIL.latMax) return null;
  if (lng < BRASIL.lngMin || lng > BRASIL.lngMax) return null;
  return [lat, lng];
}

/** Texto de busca: "Nome, Logradouro 123, Cidade - UF" (partes vazias são omitidas). */
export function textoBuscaDestino(d: DestinoNavegacao): string {
  const limpa = (s: unknown) => (s === null || s === undefined ? '' : String(s).trim());
  const numero = limpa(d.numero);
  const rua = [limpa(d.logradouro), numero && numero !== '0' ? numero : '']
    .filter(Boolean)
    .join(' ');
  const cidade = [limpa(d.localidade), limpa(d.uf).toUpperCase()].filter(Boolean).join(' - ');
  return [limpa(d.nome), rua, cidade].filter(Boolean).join(', ');
}

export function linkGoogleMaps(d: DestinoNavegacao | null | undefined): string {
  if (!d) return '#';
  const c = coordenadaValida(d.latitude, d.longitude);
  const query = c ? `${c[0]},${c[1]}` : encodeURIComponent(textoBuscaDestino(d));
  if (!query) return '#';
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function linkWaze(d: DestinoNavegacao | null | undefined): string {
  if (!d) return '#';
  const c = coordenadaValida(d.latitude, d.longitude);
  if (c) return `https://waze.com/ul?ll=${c[0]},${c[1]}&navigate=yes`;
  const q = textoBuscaDestino(d);
  return q ? `https://waze.com/ul?q=${encodeURIComponent(q)}` : '#';
}
