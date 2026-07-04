/**
 * Distância geográfica entre dois pontos (fórmula de Haversine), em metros.
 * Fonte única — antes duplicado em home, city e church-result-card.
 */
export function haversineMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // raio da Terra em metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distância até um ponto (lat/lng possivelmente ausentes) a partir de uma
 * origem opcional. Retorna null quando faltam coordenadas — padrão usado
 * na ordenação por proximidade.
 */
export function distanciaMetrosAte(
  origemLat: number | null,
  origemLng: number | null,
  destinoLat: number | null | undefined,
  destinoLng: number | null | undefined
): number | null {
  if (origemLat === null || origemLng === null) return null;
  if (!destinoLat || !destinoLng) return null;
  return haversineMetros(origemLat, origemLng, destinoLat, destinoLng);
}
