import { TestBed } from '@angular/core/testing';
import { ErroGeolocalizacao, GeolocationService, normalizarCep } from './geolocation.service';

describe('GeolocationService', () => {
  let service: GeolocationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GeolocationService);
  });

  const esvaziar = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const resposta = (corpo: unknown, extra: Partial<Response> = {}) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo), ...extra } as Response);
  /** fetch que nunca responde, mas respeita o AbortSignal (como o real). */
  const fetchPendente = (_url: any, init?: RequestInit) =>
    new Promise<Response>((_, rejeitar) => {
      init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
    });

  describe('obterPosicaoAtual', () => {
    const posicao = (latitude: number, longitude: number) => ({ coords: { latitude, longitude } } as GeolocationPosition);
    const motivoDe = async (p: Promise<unknown>) => {
      try { await p; return 'sem-erro'; } catch (e) { return (e as ErroGeolocalizacao).motivo; }
    };

    it('devolve as coordenadas lidas', async () => {
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((ok: any) => ok(posicao(-23.5, -46.6)));

      expect(await service.obterPosicaoAtual()).toEqual({ lat: -23.5, lng: -46.6 });
    });

    it('pede ao navegador com timeout definido e aceita posição recente em cache', async () => {
      const espia = spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((ok: any) => ok(posicao(-23.5, -46.6)));

      await service.obterPosicaoAtual();

      const opcoes = espia.calls.mostRecent().args[2] as PositionOptions;
      expect(opcoes.timeout).toBe(10_000);
      expect(opcoes.maximumAge).toBe(300_000);
    });

    ([
      [1, 'negada'],
      [2, 'indisponivel'],
      [3, 'timeout'],
      [99, 'inesperado'],
    ] as [number, string][]).forEach(([code, motivo]) => {
      it(`erro ${code} do navegador vira "${motivo}"`, async () => {
        spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_ok: any, erro: any) => erro({ code }));

        expect(await motivoDe(service.obterPosicaoAtual())).toBe(motivo);
      });
    });

    it('mantém `code` compatível com GeolocationPositionError para quem ainda lê err.code', async () => {
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_ok: any, erro: any) => erro({ code: 1 }));

      const erro = await service.obterPosicaoAtual().catch(e => e);

      expect(erro instanceof ErroGeolocalizacao).toBeTrue();
      expect(erro.code).toBe(1);
    });

    it('navegador sem geolocalização: "sem-suporte"', async () => {
      spyOnProperty(navigator, 'geolocation', 'get').and.returnValue(undefined as any);

      expect(await motivoDe(service.obterPosicaoAtual())).toBe('sem-suporte');
    });

    it('página fora de HTTPS: "inseguro", sem nem chamar o navegador', async () => {
      const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      const espia = spyOn(navigator.geolocation, 'getCurrentPosition');
      try {
        expect(await motivoDe(service.obterPosicaoAtual())).toBe('inseguro');
        expect(espia).not.toHaveBeenCalled();
      } finally {
        if (original) Object.defineProperty(window, 'isSecureContext', original);
        else delete (window as any).isSecureContext;
      }
    });

    it('exceção síncrona do navegador vira "inesperado"', async () => {
      spyOn(navigator.geolocation, 'getCurrentPosition').and.throwError('boom');

      expect(await motivoDe(service.obterPosicaoAtual())).toBe('inesperado');
    });

    [[0, 0], [NaN, -46.6], [-23.5, Infinity], [91, 10], [10, 181]].forEach(([lat, lng]) => {
      it(`coordenada inválida (${lat}, ${lng}) é recusada como "indisponivel"`, async () => {
        spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((ok: any) => ok(posicao(lat, lng)));

        expect(await motivoDe(service.obterPosicaoAtual())).toBe('indisponivel');
      });
    });

    it('pedidos simultâneos compartilham UMA chamada ao navegador', async () => {
      let responder!: (p: GeolocationPosition) => void;
      const espia = spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((ok: any) => { responder = ok; });

      const a = service.obterPosicaoAtual();
      const b = service.obterPosicaoAtual();
      responder(posicao(-23.5, -46.6));

      expect(await a).toEqual(await b);
      expect(espia).toHaveBeenCalledTimes(1);
    });

    it('depois de terminar, um novo pedido (nova tentativa) chama o navegador de novo', async () => {
      const espia = spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_ok: any, erro: any) => erro({ code: 3 }));

      await service.obterPosicaoAtual().catch(() => {});
      await service.obterPosicaoAtual().catch(() => {});

      expect(espia).toHaveBeenCalledTimes(2);
    });

    describe('teto de espera (aviso de permissão ignorado)', () => {
      beforeEach(() => jasmine.clock().install());
      afterEach(() => jasmine.clock().uninstall());

      it('sem resposta do navegador, rejeita com "timeout" e libera a tela', async () => {
        spyOn(navigator.geolocation, 'getCurrentPosition'); // nunca chama os callbacks
        const pedido = motivoDe(service.obterPosicaoAtual());

        jasmine.clock().tick(24_999);
        await esvaziar();
        jasmine.clock().tick(1);

        expect(await pedido).toBe('timeout');
      });

      it('resposta que chega depois do teto é ignorada', async () => {
        let responder!: (p: GeolocationPosition) => void;
        spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((ok: any) => { responder = ok; });
        const pedido = motivoDe(service.obterPosicaoAtual());
        jasmine.clock().tick(25_000);
        expect(await pedido).toBe('timeout');

        expect(() => responder(posicao(-23.5, -46.6))).not.toThrow();
      });

      it('depois do teto, a nova tentativa funciona', async () => {
        const espia = spyOn(navigator.geolocation, 'getCurrentPosition');
        const primeiro = motivoDe(service.obterPosicaoAtual());
        jasmine.clock().tick(25_000);
        await primeiro;

        espia.and.callFake((ok: any) => ok(posicao(-23.5, -46.6)));
        expect(await service.obterPosicaoAtual()).toEqual({ lat: -23.5, lng: -46.6 });
      });
    });
  });

  describe('consultarCepDetalhado', () => {
    const viacep = { cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };

    it('aceita CEP com e sem hífen e consulta só os dígitos', async () => {
      const espia = spyOn(window, 'fetch').and.callFake(() => resposta(viacep));

      const com = await service.consultarCepDetalhado('01001-000');
      const sem = await service.consultarCepDetalhado('01001000');

      expect(com).toEqual(sem);
      expect(com).toEqual({
        status: 'ok',
        endereco: { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' },
      });
      expect(espia.calls.allArgs().map(a => a[0])).toEqual([
        'https://viacep.com.br/ws/01001000/json/',
        'https://viacep.com.br/ws/01001000/json/',
      ]);
    });

    it('CEP que não tem 8 dígitos é "invalido" e nem consulta', async () => {
      const espia = spyOn(window, 'fetch');

      expect(await service.consultarCepDetalhado('0100-1')).toEqual({ status: 'invalido' });
      expect(await service.consultarCepDetalhado('')).toEqual({ status: 'invalido' });
      expect(espia).not.toHaveBeenCalled();
    });

    it('HTTP 400 da ViaCEP (CEP malformado) é "invalido"', async () => {
      spyOn(window, 'fetch').and.callFake(() => resposta({}, { ok: false, status: 400 }));

      expect(await service.consultarCepDetalhado('01001000')).toEqual({ status: 'invalido' });
    });

    [{ erro: true }, { erro: 'true' }, {}, { localidade: 'São Paulo' }].forEach((corpo) => {
      it(`CEP que a ViaCEP não conhece (${JSON.stringify(corpo)}) é "inexistente"`, async () => {
        spyOn(window, 'fetch').and.callFake(() => resposta(corpo));

        expect(await service.consultarCepDetalhado('99999999')).toEqual({ status: 'inexistente' });
      });
    });

    it('falha de rede é "rede", não "inexistente"', async () => {
      spyOn(window, 'fetch').and.returnValue(Promise.reject(new TypeError('Failed to fetch')));

      expect(await service.consultarCepDetalhado('01001000')).toEqual({ status: 'rede' });
    });

    it('serviço fora do ar (HTTP 5xx) é "rede"', async () => {
      spyOn(window, 'fetch').and.callFake(() => resposta({}, { ok: false, status: 503 }));

      expect(await service.consultarCepDetalhado('01001000')).toEqual({ status: 'rede' });
    });

    it('resposta que não é JSON é "rede"', async () => {
      spyOn(window, 'fetch').and.callFake(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('x')) } as Response));

      expect(await service.consultarCepDetalhado('01001000')).toEqual({ status: 'rede' });
    });

    it('sem resposta em 8 s aborta e devolve "timeout"', async () => {
      jasmine.clock().install();
      try {
        spyOn(window, 'fetch').and.callFake(fetchPendente as any);
        const pedido = service.consultarCepDetalhado('01001000');

        jasmine.clock().tick(8_000);

        expect(await pedido).toEqual({ status: 'timeout' });
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('`consultarCep` legado continua devolvendo o endereço ou null', async () => {
      const f = spyOn(window, 'fetch').and.callFake(() => resposta(viacep));
      expect((await service.consultarCep('01001-000'))?.localidade).toBe('São Paulo');

      f.and.callFake(() => resposta({ erro: true }));
      expect(await service.consultarCep('99999999')).toBeNull();
    });
  });

  describe('geocodificarCepProvisorio', () => {
    const endereco = { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };

    it('faz UMA consulta (sem cascata) e devolve as coordenadas', async () => {
      const espia = spyOn(window, 'fetch').and.callFake(() => resposta([{ lat: '-23.55052', lon: '-46.63331' }]));

      expect(await service.geocodificarCepProvisorio(endereco)).toEqual({ status: 'ok', coords: { lat: -23.55052, lng: -46.63331 } });
      expect(espia).toHaveBeenCalledTimes(1);
      expect(decodeURIComponent(String(espia.calls.mostRecent().args[0]))).toContain('Praça da Sé, Sé, São Paulo, SP, Brazil');
    });

    it('sem resultado ou coordenada inválida: "sem-coordenadas"', async () => {
      const f = spyOn(window, 'fetch').and.callFake(() => resposta([]));
      expect(await service.geocodificarCepProvisorio(endereco)).toEqual({ status: 'sem-coordenadas' });

      f.and.callFake(() => resposta([{ lat: 'abc', lon: '-46.6' }]));
      expect(await service.geocodificarCepProvisorio(endereco)).toEqual({ status: 'sem-coordenadas' });

      f.and.callFake(() => resposta([{ lat: '0', lon: '0' }]));
      expect(await service.geocodificarCepProvisorio(endereco)).toEqual({ status: 'sem-coordenadas' });
    });

    it('falha de rede (ou bloqueio por excesso de requisições) é "rede"', async () => {
      const f = spyOn(window, 'fetch').and.returnValue(Promise.reject(new TypeError('Failed to fetch')));
      expect(await service.geocodificarCepProvisorio(endereco)).toEqual({ status: 'rede' });

      f.and.callFake(() => resposta({}, { ok: false, status: 429 }));
      expect(await service.geocodificarCepProvisorio(endereco)).toEqual({ status: 'rede' });
    });

    it('sem resposta em 4 s aborta e devolve "timeout"', async () => {
      jasmine.clock().install();
      try {
        spyOn(window, 'fetch').and.callFake(fetchPendente as any);
        const pedido = service.geocodificarCepProvisorio(endereco);

        jasmine.clock().tick(4_000);

        expect(await pedido).toEqual({ status: 'timeout' });
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });

  describe('reverseGeocode', () => {
    it('devolve o `address` do Nominatim', async () => {
      spyOn(window, 'fetch').and.returnValue(resposta({ address: { city: 'Maringá', state_code: 'pr' } }));

      expect(await service.reverseGeocode(-23.4, -51.9)).toEqual({ city: 'Maringá', state_code: 'pr' } as any);
    });

    it('sem resposta em 6 s aborta e devolve null (não prende a tela)', async () => {
      jasmine.clock().install();
      try {
        spyOn(window, 'fetch').and.callFake(fetchPendente as any);
        const pedido = service.reverseGeocode(-23.4, -51.9);

        jasmine.clock().tick(6_000);

        expect(await pedido).toBeNull();
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('HTTP de erro (ok=false) devolve null em vez de ler o corpo de erro como endereço', async () => {
      spyOn(window, 'fetch').and.returnValue(resposta({ address: { city: 'X' } }, { ok: false, status: 429 }));

      expect(await service.reverseGeocode(-23.4, -51.9)).toBeNull();
    });

    it('falha de rede devolve null', async () => {
      spyOn(window, 'fetch').and.returnValue(Promise.reject(new TypeError('Failed to fetch')));

      expect(await service.reverseGeocode(-23.4, -51.9)).toBeNull();
    });
  });

  describe('geocodeEndereco', () => {
    it('devolve a primeira coordenada', async () => {
      spyOn(window, 'fetch').and.returnValue(resposta([{ lat: '-23.5', lon: '-46.6' }]));

      expect(await service.geocodeEndereco('São Paulo')).toEqual({ lat: -23.5, lng: -46.6 });
    });

    it('sem resultado devolve null', async () => {
      spyOn(window, 'fetch').and.returnValue(resposta([]));

      expect(await service.geocodeEndereco('lugar nenhum')).toBeNull();
    });

    it('sem resposta em 6 s aborta e devolve null', async () => {
      jasmine.clock().install();
      try {
        spyOn(window, 'fetch').and.callFake(fetchPendente as any);
        const pedido = service.geocodeEndereco('São Paulo');

        jasmine.clock().tick(6_000);

        expect(await pedido).toBeNull();
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('HTTP de erro (ok=false) devolve null', async () => {
      spyOn(window, 'fetch').and.returnValue(resposta([{ lat: '1', lon: '2' }], { ok: false, status: 503 }));

      expect(await service.geocodeEndereco('São Paulo')).toBeNull();
    });
  });

  describe('normalizarCep', () => {
    it('mantém só dígitos', () => {
      expect(normalizarCep('01001-000')).toBe('01001000');
      expect(normalizarCep(' 01.001-000 ')).toBe('01001000');
      expect(normalizarCep(null)).toBe('');
    });
  });
});
