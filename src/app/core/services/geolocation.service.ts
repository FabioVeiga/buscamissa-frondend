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

/** Por que a posição do aparelho não chegou. Cada motivo pede uma mensagem diferente. */
export type MotivoErroGeo =
  | 'sem-suporte' // navegador sem navigator.geolocation
  | 'inseguro' // página fora de HTTPS: o navegador nega sem nem perguntar
  | 'negada' // usuário (ou política do site) recusou a permissão
  | 'indisponivel' // GPS/rede sem sinal, serviços de localização desligados, coordenada inválida
  | 'timeout' // não respondeu a tempo
  | 'inesperado';

/**
 * Erro tipado da geolocalização. Mantém `code` com os mesmos valores do
 * `GeolocationPositionError` (1 negada, 2 indisponível, 3 timeout) para os
 * consumidores antigos que leem `err.code` continuarem funcionando.
 */
export class ErroGeolocalizacao extends Error {
  constructor(
    readonly motivo: MotivoErroGeo,
    readonly code?: 1 | 2 | 3,
  ) {
    super(`geolocalizacao-${motivo}`);
    this.name = 'ErroGeolocalizacao';
  }
}

/** Endereço devolvido pela ViaCEP (só os campos que o app usa). */
export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

/** Resultado tipado da consulta de CEP: cada falha tem uma resposta diferente para o usuário. */
export type ResultadoCep =
  | { status: 'ok'; endereco: EnderecoCep }
  | { status: 'invalido' } // não tem 8 dígitos
  | { status: 'inexistente' } // a ViaCEP não conhece o CEP
  | { status: 'rede' } // sem conexão ou serviço fora do ar
  | { status: 'timeout' };

/** Resultado da geocodificação provisória do CEP. */
export type ResultadoGeocodificacaoCep =
  | { status: 'ok'; coords: Coordenadas }
  | { status: 'sem-coordenadas' } // o serviço respondeu, mas não localizou o endereço
  | { status: 'rede' }
  | { status: 'timeout' };

/** Só dígitos: aceita CEP com e sem hífen (e com espaços/pontos colados). */
export function normalizarCep(cep: unknown): string {
  return String(cep ?? '').replace(/\D/g, '');
}

function coordenadasValidas(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    // (0, 0) é o valor de "sem leitura" de vários navegadores/aparelhos, não uma posição.
    !(lat === 0 && lng === 0)
  );
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
  //  - timeout:10s → tempo da LEITURA da posição. Pela especificação ele só começa a
  //    contar depois que a permissão foi concedida;
  //  - maximumAge:5min → aceita uma posição recente em cache, que frequentemente
  //    resolve casos em que uma leitura nova falharia.
  private static readonly GEO_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    timeout: 10_000,
    maximumAge: 300_000,
  };

  /**
   * Teto da espera INCLUINDO o aviso de permissão. O `timeout` acima não cobre o tempo em
   * que o aviso fica aberto, e no Safari do iPhone um aviso ignorado deixa a chamada
   * pendurada para sempre. Passado este prazo a tela sai de "Localizando você..." e
   * oferece nova tentativa.
   */
  private static readonly ESPERA_MAX_GEO_MS = 25_000;

  /** Prazos das consultas de CEP (ViaCEP e geocodificação provisória). */
  private static readonly TIMEOUT_CEP_MS = 8_000;
  private static readonly TIMEOUT_GEOCODIFICACAO_CEP_MS = 4_000;

  /** Pedido em andamento: cliques repetidos compartilham UM aviso de permissão. */
  private _posicaoEmAndamento: Promise<Coordenadas> | null = null;

  /**
   * Posição atual do usuário. Rejeita sempre com `ErroGeolocalizacao` (motivo tipado).
   * Só deve ser chamada a partir de uma ação explícita do usuário.
   */
  obterPosicaoAtual(): Promise<Coordenadas> {
    if (this._posicaoEmAndamento) return this._posicaoEmAndamento;
    const pedido: Promise<Coordenadas> = this._lerPosicao().finally(() => {
      if (this._posicaoEmAndamento === pedido) this._posicaoEmAndamento = null;
    });
    this._posicaoEmAndamento = pedido;
    return pedido;
  }

  private _lerPosicao(): Promise<Coordenadas> {
    return new Promise<Coordenadas>((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new ErroGeolocalizacao('sem-suporte'));
        return;
      }
      // Fora de HTTPS o navegador recusa a API; dizer isso é melhor que "permissão negada".
      if ((globalThis as { isSecureContext?: boolean }).isSecureContext === false) {
        reject(new ErroGeolocalizacao('inseguro'));
        return;
      }

      let encerrado = false;
      const encerrar = (acao: () => void) => {
        if (encerrado) return; // resposta tardia depois do teto: ignorada
        encerrado = true;
        clearTimeout(teto);
        acao();
      };
      const teto = setTimeout(
        () => encerrar(() => reject(new ErroGeolocalizacao('timeout', 3))),
        GeolocationService.ESPERA_MAX_GEO_MS,
      );

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => encerrar(() => {
            const { latitude, longitude } = pos?.coords ?? {};
            if (!coordenadasValidas(latitude, longitude)) {
              reject(new ErroGeolocalizacao('indisponivel', 2));
              return;
            }
            resolve({ lat: latitude, lng: longitude as number });
          }),
          (err) => encerrar(() => reject(this._mapearErro(err))),
          GeolocationService.GEO_OPTIONS,
        );
      } catch (e) {
        this.logger.logError(e, 'geo:obterPosicaoAtual');
        encerrar(() => reject(new ErroGeolocalizacao('inesperado')));
      }
    });
  }

  private _mapearErro(err: unknown): ErroGeolocalizacao {
    switch ((err as { code?: number } | null)?.code) {
      case 1: return new ErroGeolocalizacao('negada', 1);
      case 2: return new ErroGeolocalizacao('indisponivel', 2);
      case 3: return new ErroGeolocalizacao('timeout', 3);
      default: return new ErroGeolocalizacao('inesperado');
    }
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

  /** Consulta de CEP na ViaCEP. Retorna null em erro ou CEP inexistente (não distingue o motivo). */
  async consultarCep(cep: string): Promise<any | null> {
    const r = await this.consultarCepDetalhado(cep);
    return r.status === 'ok' ? r.endereco : null;
  }

  /** Consulta de CEP na ViaCEP separando CEP inválido, inexistente, falha de rede e timeout. */
  async consultarCepDetalhado(cep: string): Promise<ResultadoCep> {
    const limpo = normalizarCep(cep);
    if (limpo.length !== 8) return { status: 'invalido' };

    const dados = await this._buscarJson(
      `${GeolocationService.VIACEP}/${limpo}/json/`,
      GeolocationService.TIMEOUT_CEP_MS,
      'geo:consultarCep',
    );
    if (dados.status === 'http-400') return { status: 'invalido' }; // a ViaCEP responde 400 a CEP malformado
    if (dados.status !== 'ok') return { status: dados.status };

    const addr = dados.corpo as Record<string, unknown> | null;
    // `erro` vem como true (ou "true") para CEP que não existe na base.
    if (!addr || addr['erro'] === true || addr['erro'] === 'true' || !addr['localidade'] || !addr['uf']) {
      return { status: 'inexistente' };
    }
    return {
      status: 'ok',
      endereco: {
        cep: limpo,
        logradouro: String(addr['logradouro'] ?? ''),
        bairro: String(addr['bairro'] ?? ''),
        localidade: String(addr['localidade']),
        uf: String(addr['uf']),
      },
    };
  }

  /**
   * Geocodificação PROVISÓRIA do CEP: uma única consulta ao Nominatim, do navegador, com o
   * endereço que a ViaCEP devolveu. É o comportamento que a Home já tinha, só que tipado e
   * com prazo. Será substituída pelo endpoint de geocodificação da api-public (com cache,
   * controle de frequência e provedor trocável) em PR próprio.
   */
  async geocodificarCepProvisorio(addr: EnderecoCep): Promise<ResultadoGeocodificacaoCep> {
    const consulta = encodeURIComponent(
      [addr.logradouro, addr.bairro, addr.localidade, addr.uf, 'Brazil'].filter(Boolean).join(', '),
    );
    const dados = await this._buscarJson(
      `${GeolocationService.NOMINATIM}/search?q=${consulta}&format=json&limit=1&countrycodes=br`,
      GeolocationService.TIMEOUT_GEOCODIFICACAO_CEP_MS,
      'geo:geocodificarCepProvisorio',
    );
    if (dados.status === 'http-400') return { status: 'rede' };
    if (dados.status !== 'ok') return { status: dados.status };

    const hit = Array.isArray(dados.corpo) ? dados.corpo[0] : null;
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!hit || !coordenadasValidas(lat, lng)) return { status: 'sem-coordenadas' };
    return { status: 'ok', coords: { lat, lng } };
  }

  /** GET JSON com prazo. Nunca lança: devolve o motivo da falha. */
  private async _buscarJson(
    url: string,
    prazoMs: number,
    contexto: string,
  ): Promise<{ status: 'ok'; corpo: unknown } | { status: 'http-400' | 'rede' | 'timeout' }> {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), prazoMs);
    try {
      const resp = await fetch(url, { signal: controle.signal });
      if (resp.status === 400) return { status: 'http-400' };
      if (resp.ok === false) return { status: 'rede' };
      return { status: 'ok', corpo: await resp.json() };
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return { status: 'timeout' };
      this.logger.logError(e, contexto);
      return { status: 'rede' };
    } finally {
      clearTimeout(timer);
    }
  }
}
