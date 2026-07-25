import { Injectable, inject } from '@angular/core';
import { LoggerService } from './logger.service';

export interface Coordenadas {
  lat: number;
  lng: number;
}

/**
 * Endereço bruto retornado pelo Nominatim (campos que o app consome).
 * Cada tela faz seu próprio mapeamento a partir daqui.
 */
export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  state_code?: string;
  [k: string]: unknown;
}

/**
 * Centraliza o acesso às APIs de geolocalização/geocodificação — antes
 * duplicado (fetch Nominatim/ViaCEP e navigator.geolocation) em home,
 * city e missa-agora. Não guarda estado de UI; devolve dados crus.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private logger = inject(LoggerService);

  private static readonly NOMINATIM = 'https://nominatim.openstreetmap.org';
  private static readonly VIACEP = 'https://viacep.com.br/ws';

  // Opções do getCurrentPosition:
  //  - enableHighAccuracy:false → usa rede/WiFi (mais rápido e confiável que GPS
  //    no desktop, onde a alta precisão costuma falhar com kCLErrorLocationUnknown);
  //  - timeout:10s → evita ficar preso em "carregando" para sempre;
  //  - maximumAge:5min → aceita uma posição recente em cache, que frequentemente
  //    resolve casos em que uma leitura nova falharia.
  private static readonly GEO_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    timeout: 10_000,
    maximumAge: 300_000,
  };

  /** Posição atual do usuário (Promise em torno do navigator.geolocation). */
  obterPosicaoAtual(): Promise<Coordenadas> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('geolocation-indisponivel'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        GeolocationService.GEO_OPTIONS
      );
    });
  }

  /** Reverse geocoding: coordenadas → endereço (objeto `address` do Nominatim). */
  async reverseGeocode(lat: number, lng: number): Promise<NominatimAddress | null> {
    try {
      const url = `${GeolocationService.NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`;
      const data = await fetch(url).then((r) => r.json());
      return (data?.address ?? null) as NominatimAddress | null;
    } catch (e) {
      this.logger.logError(e, 'geo:reverseGeocode');
      return null;
    }
  }

  /** Geocoding: texto (cidade/endereço) → primeira coordenada no Brasil. */
  async geocodeEndereco(query: string): Promise<Coordenadas | null> {
    try {
      const url = `${GeolocationService.NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
      const arr = await fetch(url).then((r) => r.json());
      if (Array.isArray(arr) && arr[0]?.lat && arr[0]?.lon) {
        return { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
      }
      return null;
    } catch (e) {
      this.logger.logError(e, 'geo:geocodeEndereco');
      return null;
    }
  }

  /** Consulta de CEP na ViaCEP. Retorna null em erro ou CEP inexistente. */
  async consultarCep(cep: string): Promise<any | null> {
    const limpo = String(cep ?? '').replace(/\D/g, '');
    if (limpo.length !== 8) return null;
    try {
      const addr = await fetch(`${GeolocationService.VIACEP}/${limpo}/json/`).then((r) => r.json());
      return addr && !addr.erro ? addr : null;
    } catch (e) {
      this.logger.logError(e, 'geo:consultarCep');
      return null;
    }
  }
}
