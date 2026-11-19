import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, Subject } from 'rxjs';

import { HomeComponent } from './home.component';
import { ChurchesService } from '../../../core/services/churches.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { FavoritesService } from '../../../core/services/favorites.service';
import { RedesSociaisService } from '../../../core/services/redes-sociais.service';
import { ErroGeolocalizacao, GeolocationService } from '../../../core/services/geolocation.service';
import { SeoService } from '../../../core/services/seo.service';
import { MetricasService } from '../../../core/services/metricas.service';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { BuscaLocalService, IgrejaBusca } from '../../../core/services/busca-local.service';
import { CIDADES_POPULARES } from '../../../core/constants/cidades-populares';

/**
 * Cobre só o caminho `/buscar?nome=...` SEM UF — a URL que o `SearchAction` do
 * JSON-LD declara ao Google e que, até então, chegava e era descartada: o valor
 * era restaurado da query e apagado no mesmo tick pelo `form.reset()`.
 *
 * O componente é construído fora do template (`runInInjectionContext`): o que
 * está sob teste é a decisão — preservar o nome, não chamar a API sem UF, e
 * navegar apenas quando o destino é inequívoco —, não a renderização.
 */
describe('HomeComponent — /buscar?nome= sem UF', () => {
  const igreja = (nome: string, slug: string, cidadeSlug = 'sao-jose-dos-campos'): IgrejaBusca => ({
    nome, slug, cidadeSlug, cidade: 'São José dos Campos', uf: 'sp', bairro: 'Centro',
  });

  let router: jasmine.SpyObj<Router>;
  let churches: jasmine.SpyObj<ChurchesService>;
  let busca: jasmine.SpyObj<BuscaLocalService>;

  // Os spies nascem aqui, e não em `montar`, porque cada teste ajusta o retorno
  // ANTES de montar o componente.
  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    churches = jasmine.createSpyObj<ChurchesService>('ChurchesService', [
      'addressRange', 'searchByFilters', 'getInfo', 'proximasMissas', 'cidadesProximas',
    ]);
    // `addressRange` é o gatilho: `_restoreFromQueryParams` roda no `finalize` dele.
    churches.addressRange.and.returnValue(of({ data: {} } as any));
    churches.getInfo.and.returnValue(of({ data: {} } as any));
    churches.searchByFilters.and.returnValue(of({ data: { items: [], totalItems: 0 } } as any));

    busca = jasmine.createSpyObj<BuscaLocalService>('BuscaLocalService', [
      'carregarIndice', 'buscarIgrejas', 'correspondenciasExatas',
    ]);
    busca.carregarIndice.and.returnValue(of(true));
    busca.buscarIgrejas.and.returnValue({ igrejas: [], total: 0 });
    busca.correspondenciasExatas.and.returnValue([]);
  });

  /** Monta o componente com os params de query informados e roda `ngOnInit`. */
  function montar(queryParams: Record<string, string>): HomeComponent {
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        DatePipe,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: router },
        { provide: ChurchesService, useValue: churches },
        { provide: BuscaLocalService, useValue: busca },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams, data: {} }, queryParams: of(queryParams), data: of({}) } },
        { provide: MessageService, useValue: jasmine.createSpyObj('MessageService', ['add']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['searchStarted', 'trackEvent']) },
        { provide: FavoritesService, useValue: { favoritos$: of([]), listar: () => [], ehFavorita: () => false } },
        { provide: RedesSociaisService, useValue: { obterTipos: () => of([]) } },
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep', 'consultarCepDetalhado', 'geocodificarCepProvisorio']) },
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['update', 'setJsonLd', 'removeJsonLd']) },
        { provide: MetricasService, useValue: jasmine.createSpyObj('MetricasService', ['registrarVisualizacaoHome', 'registrarVisualizacaoPagina']) },
        // Dependência que a home ganhou em 1d43291 (cidadeSlug real vindo de
        // `/v2/seo/estados`). Só é usada no caminho da geolocalização, que estes
        // testes não exercitam — sem o stub, o serviço real puxa `HttpClient` e o
        // TestBed quebra por NullInjector.
        { provide: SeoPaginasService, useValue: { getEstados: () => of([]) } },
      ],
    });

    const c = TestBed.runInInjectionContext(() => new HomeComponent());
    (c as any).resultsMode = true;
    c.ngOnInit();
    return c;
  }

  it('preserva o Nome vindo da URL, sem exigir Uf', () => {
    busca.buscarIgrejas.and.returnValue({
      igrejas: [igreja('Catedral São Dimas', 'catedral-sao-dimas'), igreja('Catedral de Taubaté', 'catedral-taubate')],
      total: 32,
    });
    const c = montar({ nome: 'catedral' });

    expect(c.form.get('Nome')?.value).toBe('catedral');
  });

  it('NÃO chama a API quando não há Uf — buscar-por-filtro exige UF', () => {
    busca.buscarIgrejas.and.returnValue({ igrejas: [igreja('Catedral A', 'a')], total: 1 });
    montar({ nome: 'catedral' });

    expect(churches.searchByFilters).not.toHaveBeenCalled();
  });

  it('carrega o índice sob demanda e abre a lista', () => {
    busca.buscarIgrejas.and.returnValue({ igrejas: [igreja('Catedral A', 'a'), igreja('Catedral B', 'b')], total: 2 });
    const c = montar({ nome: 'catedral' });

    expect(busca.carregarIndice).toHaveBeenCalled();
    expect(c.painelAberto).toBeTrue();
    expect(c.mostrarSugestoes).toBeTrue();
    expect(c.totalSugestoes).toBe(2);
  });

  it('navega direto quando há exatamente uma correspondência', () => {
    busca.buscarIgrejas.and.returnValue({ igrejas: [igreja('Catedral São Dimas', 'catedral-sao-dimas')], total: 1 });
    montar({ nome: 'catedral sao dimas' });

    expect(router.navigate).toHaveBeenCalledWith(['/paroquia', 'sp', 'sao-jose-dos-campos', 'catedral-sao-dimas']);
  });

  it('NÃO navega quando há várias — a regra de ambiguidade vale igual à da home', () => {
    busca.buscarIgrejas.and.returnValue({
      igrejas: [igreja('Catedral A', 'a'), igreja('Catedral B', 'b')],
      total: 32,
    });
    const c = montar({ nome: 'catedral' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(c.sugestaoAtiva).toBe(0);
    expect(c.erroFormulario).toContain('32');
  });

  it('navega quando há uma única correspondência EXATA entre várias', () => {
    busca.buscarIgrejas.and.returnValue({
      igrejas: [igreja('Catedral', 'catedral'), igreja('Catedral Velha', 'catedral-velha')],
      total: 2,
    });
    busca.correspondenciasExatas.and.returnValue([igreja('Catedral', 'catedral')]);
    montar({ nome: 'catedral' });

    expect(router.navigate).toHaveBeenCalledWith(['/paroquia', 'sp', 'sao-jose-dos-campos', 'catedral']);
  });

  it('avisa quando o nome não casa nada', () => {
    busca.buscarIgrejas.and.returnValue({ igrejas: [], total: 0 });
    const c = montar({ nome: 'zzzzz' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(c.erroFormulario).toContain('Não encontramos essa igreja');
  });

  it('com Uf presente segue o fluxo da API, sem tocar no índice', () => {
    const c = montar({ uf: 'SP', nome: 'catedral', pagina: '1' });

    expect(churches.searchByFilters).toHaveBeenCalled();
    const filtros = churches.searchByFilters.calls.mostRecent().args[0];
    expect(filtros.Uf).toBe('SP');
    expect(filtros.Nome).toBe('catedral');
    expect(busca.carregarIndice).not.toHaveBeenCalled();
    expect(c.painelAberto).toBeFalse();
  });

  it('sem uf e sem nome, o formulário é limpo como antes', () => {
    const c = montar({});

    expect(c.form.get('Nome')?.value).toBeNull();
    expect(busca.carregarIndice).not.toHaveBeenCalled();
  });
});

/**
 * Sem coordenadas do usuário, `ProximasMissasService` cai no fallback de São Paulo
 * (-23.5505/-46.6333) e devolve `distanciaKm` medido do centro de SP. Exibir isso
 * como "a 20 m" é errado para quem está em qualquer outro lugar — então a home só
 * propaga distância quando a busca levou as coordenadas.
 */
describe('HomeComponent — origem das distâncias', () => {
  let churches: jasmine.SpyObj<ChurchesService>;

  const itemApi = {
    igrejaId: 7,
    nome: 'Paróquia Teste',
    slug: 'paroquia-teste',
    uf: 'SP',
    cidadeSlug: 'sao-paulo',
    bairro: 'Sé',
    missa: { id: 1, diaSemana: 0, horario: '19:00' },
    distanciaKm: 1.6,
    latitude: -23.55,
    longitude: -46.63,
  };

  function montar(platform: 'browser' | 'server'): HomeComponent {
    churches = jasmine.createSpyObj<ChurchesService>('ChurchesService', [
      'addressRange', 'searchByFilters', 'getInfo', 'proximasMissas', 'cidadesProximas',
    ]);
    churches.proximasMissas.and.returnValue(of({ data: [itemApi] } as any));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        DatePipe,
        { provide: PLATFORM_ID, useValue: platform },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
        { provide: ChurchesService, useValue: churches },
        { provide: BuscaLocalService, useValue: jasmine.createSpyObj('BuscaLocalService', ['carregarIndice', 'buscarIgrejas', 'correspondenciasExatas']) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {}, data: {} }, queryParams: of({}), data: of({}) } },
        { provide: MessageService, useValue: jasmine.createSpyObj('MessageService', ['add']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['searchStarted', 'trackEvent']) },
        { provide: FavoritesService, useValue: { favoritos$: of([]), listar: () => [], ehFavorita: () => false } },
        { provide: RedesSociaisService, useValue: { obterTipos: () => of([]) } },
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep', 'consultarCepDetalhado', 'geocodificarCepProvisorio']) },
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['update', 'setJsonLd', 'removeJsonLd']) },
        { provide: MetricasService, useValue: jasmine.createSpyObj('MetricasService', ['registrarVisualizacaoHome', 'registrarVisualizacaoPagina']) },
        { provide: SeoPaginasService, useValue: { getEstados: () => of([]) } },
      ],
    });
    // Sem `ngOnInit`: o que está sob teste é a decisão do mapeamento, não o ciclo
    // de vida (que dispararia geolocalização de verdade no headless).
    return TestBed.runInInjectionContext(() => new HomeComponent());
  }

  it('nasce carregando, para o prerender não assar "nenhuma missa encontrada"', () => {
    expect(montar('server').isLoadingProximas).toBeTrue();
  });

  it('NÃO expõe distância quando a busca foi feita sem coordenadas', () => {
    const c = montar('browser');
    (c as any)._loadProximasMissas();

    expect(churches.proximasMissas).toHaveBeenCalledWith(undefined, undefined, 10);
    expect(c.proximasMissasCards[0].distanceMeters).toBeUndefined();
  });

  it('expõe a distância quando a busca levou as coordenadas do usuário', () => {
    const c = montar('browser');
    (c as any)._loadProximasMissas(-23.5, -46.6);

    expect(c.proximasMissasCards[0].distanceMeters).toBe(1600);
  });

  describe('cargas simultâneas de próximas missas', () => {
    it('resposta antiga (do GPS descartado) não sobrescreve a carga mais recente', () => {
      const c = montar('browser');
      const antiga = new Subject<any>();
      const recente = new Subject<any>();
      churches.proximasMissas.and.returnValues(antiga, recente);

      (c as any)._loadProximasMissas(-23.5, -46.6); // carga 1: com a posição do GPS
      (c as any)._loadProximasMissas(); // carga 2: depois de "Alterar", sem localização
      recente.next({ data: [{ ...itemApi, nome: 'Recente' }] });
      expect(c.isLoadingProximas).toBeFalse();

      antiga.next({ data: [{ ...itemApi, nome: 'Antiga' }] }); // chega tarde

      expect(c.proximasMissasCards.length).toBe(1);
      expect(c.proximasMissasCards[0].churchName).toBe('Recente');
      expect(c.proximasMissasCards[0].distanceMeters).toBeUndefined();
      expect(c.isLoadingProximas).toBeFalse();
    });

    it('erro de uma carga antiga não encerra o loading da carga mais nova', () => {
      const c = montar('browser');
      const antiga = new Subject<any>();
      const recente = new Subject<any>();
      churches.proximasMissas.and.returnValues(antiga, recente);

      (c as any)._loadProximasMissas(-23.5, -46.6);
      (c as any)._loadProximasMissas();
      antiga.error(new Error('falhou'));

      expect(c.isLoadingProximas).toBeTrue(); // a carga nova ainda está em andamento

      recente.next({ data: [itemApi] });
      expect(c.isLoadingProximas).toBeFalse();
      expect(c.proximasMissasCards.length).toBe(1);
    });
  });

  it('mantém as cidades curadas mesmo com a geolocalização concedida', () => {
    const c = montar('browser');

    // O `geoStatus` costumava trocar a lista pelas 7 primeiras cidades do estado em
    // ordem ALFABÉTICA ("Adolfo, Alumínio, Anhumas…" sob o título "Cidades populares").
    (c as any).geoStatus = 'found';
    (c as any).cidadeDetectada = { nome: 'São José dos Campos', uf: 'SP', slug: 'sao-jose-dos-campos' };

    expect(c.cidadesExibidas).toBe(CIDADES_POPULARES);
  });

  it('rotula a origem: "referencia" sem geo, "usuario" com geo, null no servidor', () => {
    const c = montar('browser');
    expect(c.origemDistancia).toBe('referencia');

    (c as any)._userLat = -23.5;
    (c as any)._userLng = -46.6;
    expect(c.origemDistancia).toBe('usuario');

    expect(montar('server').origemDistancia).toBeNull();
  });

  it('mantém o título "Missas acontecendo agora" mesmo com a geolocalização concedida', async () => {
    const c = montar('browser');
    const geo = TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>;
    geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
    geo.reverseGeocode.and.resolveTo(null);

    await (c as any)._solicitarLocalizacao();

    expect(c.tituloProximasMissas).toBe('Missas acontecendo agora');
    expect(c.geoStatus).toBe('found');
  });

  /** Roda o ngOnInit real (monta o formulário) sem deixar timers de página aberta. */
  const iniciar = (c: HomeComponent) => {
    churches.addressRange.and.returnValue(of({ data: {} } as any));
    spyOn(c as any, '_agendarRefreshProximas');
    spyOn(c as any, '_iniciarRelogioResultados');
    c.ngOnInit();
  };

  describe('localização por GPS', () => {
    let geo: jasmine.SpyObj<GeolocationService>;
    const comGeo = () => {
      const c = montar('browser');
      geo = TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>;
      geo.reverseGeocode.and.resolveTo(null);
      return c;
    };

    it('o carregamento da Home NÃO pede a localização', () => {
      const c = comGeo();
      iniciar(c);

      expect(geo.obterPosicaoAtual).not.toHaveBeenCalled();
      expect(c.geoStatus).toBe('idle');
      // A lista de próximas missas carrega sem coordenadas (referência), sem pedir GPS.
      expect(churches.proximasMissas).toHaveBeenCalledWith(undefined, undefined, 10);
    });

    it('só marca "found" quando as coordenadas chegam, e as aplica na busca', async () => {
      const c = comGeo();
      let entregar!: (v: { lat: number; lng: number }) => void;
      geo.obterPosicaoAtual.and.returnValue(new Promise(r => { entregar = r; }));

      const pedido = (c as any)._solicitarLocalizacao() as Promise<boolean>;
      expect(c.geoStatus).toBe('loading');
      expect(c.temGeolocalizacao).toBeFalse();

      entregar({ lat: -23.5, lng: -46.6 });
      expect(await pedido).toBeTrue();

      expect(c.geoStatus).toBe('found');
      expect(c.origemLocalizacao).toBe('gps');
      expect(churches.proximasMissas).toHaveBeenCalledWith(-23.5, -46.6, 10);
    });

    const motivos: [string, string][] = [
      ['negada', 'denied'],
      ['indisponivel', 'unavailable'],
      ['sem-suporte', 'unavailable'],
      ['timeout', 'timeout'],
      ['inseguro', 'error'],
      ['inesperado', 'error'],
    ];
    motivos.forEach(([motivo, esperado]) => {
      it(`falha "${motivo}" vira o estado "${esperado}" sem coordenadas nem proximidade`, async () => {
        const c = comGeo();
        geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao(motivo as any));

        expect(await (c as any)._solicitarLocalizacao()).toBeFalse();

        expect(c.geoStatus).toBe(esperado as any);
        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.origemLocalizacao).toBeNull();
        expect(c.mensagemErroGeo).toContain('Não foi possível obter sua localização');
        expect(churches.proximasMissas).not.toHaveBeenCalledWith(jasmine.any(Number), jasmine.any(Number), jasmine.anything());
      });
    });

    it('permissão negada orienta a liberar no navegador ou usar o CEP; timeout não culpa a permissão', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('negada', 1));
      await (c as any)._solicitarLocalizacao();
      expect(c.mensagemErroGeo).toContain('Permita o acesso à localização nas configurações do navegador ou informe seu CEP');

      geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('timeout', 3));
      await (c as any)._solicitarLocalizacao();
      expect(c.mensagemErroGeo).not.toContain('Permita');
    });

    // Regressão (correção A): erro síncrono nos efeitos pós-sucesso não pode prender 'loading'.
    it('erro síncrono ao carregar as próximas missas não deixa o estado preso em "loading"', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      churches.proximasMissas.and.throwError('boom');

      const ok = await (c as any)._solicitarLocalizacao();

      expect(ok).toBeTrue(); // a posição foi obtida
      expect(c.geoStatus).toBe('found');
      expect(c.temGeolocalizacao).toBeTrue();
      expect(c.isLoadingProximas).toBeFalse(); // sem skeleton eterno na seção secundária
      expect((c as any)._pedidoGps).toBeNull();
    });

    it('erro síncrono no reverse geocode não deixa o estado preso em "loading" e marca a cidade como não resolvida', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      geo.reverseGeocode.and.throwError('boom');

      const ok = await (c as any)._solicitarLocalizacao();

      expect(ok).toBeTrue();
      expect(c.geoStatus).toBe('found');
      expect(c.cidadeNaoResolvida).toBeTrue();
      expect((c as any)._pedidoGps).toBeNull();
    });

    it('permite nova tentativa depois de uma falha', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('timeout', 3));
      expect(await (c as any)._solicitarLocalizacao()).toBeFalse();

      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      expect(await (c as any)._solicitarLocalizacao()).toBeTrue();

      expect(geo.obterPosicaoAtual).toHaveBeenCalledTimes(2);
      expect(c.geoStatus).toBe('found');
      expect(c.mensagemErroGeo).toBeNull();
    });

    it('cliques repetidos compartilham UM pedido; já localizado, não pede de novo', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });

      const [a, b] = await Promise.all([(c as any)._solicitarLocalizacao(), (c as any)._solicitarLocalizacao()]);
      expect(a && b).toBeTrue();
      await (c as any)._solicitarLocalizacao();

      expect(geo.obterPosicaoAtual).toHaveBeenCalledTimes(1);
    });

    it('falha ao identificar a cidade NÃO desfaz a localização encontrada', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      geo.reverseGeocode.and.resolveTo(null);

      await (c as any)._solicitarLocalizacao();
      await new Promise(r => setTimeout(r));

      expect(c.geoStatus).toBe('found');
      expect(c.temGeolocalizacao).toBeTrue();
      expect(c.cidadeNaoResolvida).toBeTrue();
    });

    it('chip "Perto de mim" só fica ativo com localização válida', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('negada', 1));
      c.setQuickFilter('perto');
      await new Promise(r => setTimeout(r));
      expect(c.quickFilter).toBeNull();

      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      c.setQuickFilter('perto');
      await new Promise(r => setTimeout(r));
      expect(c.quickFilter).toBe('perto');
    });

    // Regressão (correção B)
    it('"Alterar" desativa o chip "Perto de mim"', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      c.setQuickFilter('perto');
      await new Promise(r => setTimeout(r));
      expect(c.quickFilter).toBe('perto');

      c.alterarLocalizacao();

      expect(c.quickFilter).toBeNull();
      expect(c.temGeolocalizacao).toBeFalse();
    });

    // Regressão (correção C)
    describe('CEP substitui a localização do GPS', () => {
      const comGpsAtivo = async () => {
        const c = comGeo();
        geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
        await (c as any)._solicitarLocalizacao();
        c.cidadeDetectada = { nome: 'São José dos Campos', uf: 'SP', slug: 'sao-jose-dos-campos' };
        c.quickFilter = 'perto';
        return c;
      };

      it('zera geoStatus, cidade detectada e chip do GPS, mesmo quando a consulta do CEP falha', async () => {
        const c = await comGpsAtivo();
        expect(c.geoStatus).toBe('found');
        geo.consultarCepDetalhado.and.resolveTo({ status: 'inexistente' });

        await (c as any)._resolverLocalizacaoPorCep('99999999');

        expect(c.geoStatus).toBe('idle');
        expect(c.cidadeDetectada).toBeNull();
        expect(c.cidadeNaoResolvida).toBeFalse();
        expect(c.quickFilter).toBeNull();
        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.estadoDetectado).toBeNull();
        expect(c.urgencyBadgeText).toBeNull();
      });

      it('também zera o estado de erro de um GPS anterior', async () => {
        const c = comGeo();
        geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('negada', 1));
        await (c as any)._solicitarLocalizacao();
        expect(c.geoStatus).toBe('denied');
        geo.consultarCepDetalhado.and.resolveTo({ status: 'rede' });

        await (c as any)._resolverLocalizacaoPorCep('01001000');

        expect(c.geoStatus).toBe('idle');
        expect(c.mensagemErroGeo).toBeNull();
      });

      it('torna obsoleto um GPS ainda em andamento: o estado deixa de ser "loading"', async () => {
        const c = comGeo();
        geo.obterPosicaoAtual.and.returnValue(new Promise(() => {})); // nunca responde
        (c as any)._solicitarLocalizacao();
        expect(c.geoStatus).toBe('loading');
        geo.consultarCepDetalhado.and.resolveTo({ status: 'inexistente' });

        await (c as any)._resolverLocalizacaoPorCep('01001000');

        expect(c.geoStatus).toBe('idle');
      });

      it('CEP bem-sucedido limpa os dados anteriores do GPS e passa a ser a origem', async () => {
        const c = await comGpsAtivo();
        geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END_CEP });
        geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });

        await (c as any)._resolverLocalizacaoPorCep('01001000');

        expect(c.geoStatus).toBe('idle');
        expect(c.cidadeDetectada).toBeNull();
        expect(c.quickFilter).toBeNull();
        expect(c.origemLocalizacao).toBe('cep');
        expect(c.enderecoCep).toEqual(END_CEP);
        expect(c.geoLat).toBe(-23.55); // coordenadas do CEP, não as do GPS (-23.5)
        expect(c.localizacaoUsada?.tipo).toBe('cep');
        expect(c.estadoDetectado).toBeNull();
        expect(c.urgencyBadgeText).toBeNull();
      });
    });

    const END_CEP = { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };
    const esperar = () => new Promise(r => setTimeout(r));

    // Corrida GPS × CEP: a ÚLTIMA ação explícita do usuário prevalece.
    describe('corrida entre GPS e CEP', () => {
      it('GPS tardio não sobrescreve o CEP escolhido depois', async () => {
        const c = comGeo();
        let entregarGps!: (v: { lat: number; lng: number }) => void;
        geo.obterPosicaoAtual.and.returnValue(new Promise(r => { entregarGps = r; }));
        (c as any)._solicitarLocalizacao(); // 1ª ação: GPS, pendente
        geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END_CEP });
        geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
        await (c as any)._resolverLocalizacaoPorCep('01001000'); // 2ª ação (última): CEP
        expect(c.origemLocalizacao).toBe('cep');

        entregarGps({ lat: -10, lng: -10 }); // o GPS responde tarde
        await esperar();

        expect(c.origemLocalizacao).toBe('cep');
        expect(c.geoLat).toBe(-23.55);
        expect(c.enderecoCep).not.toBeNull();
        expect(c.geoStatus).toBe('idle');
        expect(geo.reverseGeocode).not.toHaveBeenCalled(); // efeitos do GPS obsoleto não rodam
      });

      it('CEP tardio não sobrescreve o GPS escolhido depois', async () => {
        const c = comGeo();
        let entregarCep!: (v: any) => void;
        geo.consultarCepDetalhado.and.returnValue(new Promise(r => { entregarCep = r; }));
        geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
        const cep = (c as any)._resolverLocalizacaoPorCep('01001000'); // 1ª ação: CEP, pendente
        geo.obterPosicaoAtual.and.resolveTo({ lat: -10, lng: -10 });
        await (c as any)._solicitarLocalizacao(); // 2ª ação (última): GPS
        expect(c.origemLocalizacao).toBe('gps');

        entregarCep({ status: 'ok', endereco: END_CEP }); // o CEP responde tarde
        await cep;

        expect(c.origemLocalizacao).toBe('gps');
        expect(c.geoLat).toBe(-10);
        expect(c.enderecoCep).toBeNull();
        expect(geo.geocodificarCepProvisorio).not.toHaveBeenCalled();
      });

      // Ao digitar um CEP válido a Home navega para /buscar e é destruída; o GPS que ela
      // havia pedido responde depois e não pode disparar consulta nenhuma (reverse geocode,
      // próximas missas) nem escrever estado numa Home que já saiu de cena.
      describe('Home destruída antes da resposta', () => {
        it('GPS que responde depois da destruição não dispara reverse geocode nem próximas missas', async () => {
          const c = comGeo();
          let entregarGps!: (v: { lat: number; lng: number }) => void;
          geo.obterPosicaoAtual.and.returnValue(new Promise(r => { entregarGps = r; }));
          (c as any)._solicitarLocalizacao(); // GPS pendente
          churches.proximasMissas.calls.reset();

          TestBed.resetTestingModule(); // destrói a Home (ex.: navegou para /buscar)
          entregarGps({ lat: -25.43, lng: -49.27 });
          await esperar();

          expect(geo.reverseGeocode).not.toHaveBeenCalled();
          expect(churches.proximasMissas).not.toHaveBeenCalled();
          expect(c.origemLocalizacao).toBeNull();
          expect(c.geoStatus).toBe('loading');
        });

        it('CEP que responde depois da destruição não segue para a geocodificação', async () => {
          const c = comGeo();
          let entregarCep!: (v: any) => void;
          geo.consultarCepDetalhado.and.returnValue(new Promise(r => { entregarCep = r; }));
          geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
          const cep = (c as any)._resolverLocalizacaoPorCep('01001000');

          TestBed.resetTestingModule();
          entregarCep({ status: 'ok', endereco: END_CEP });
          await cep;

          expect(geo.geocodificarCepProvisorio).not.toHaveBeenCalled();
          expect(c.origemLocalizacao).toBeNull();
        });
      });

      it('falha tardia de um GPS obsoleto não altera o estado atual', async () => {
        const c = comGeo();
        let falharGps!: (e: unknown) => void;
        geo.obterPosicaoAtual.and.returnValue(new Promise((_, rej) => { falharGps = rej; }));
        (c as any)._solicitarLocalizacao();
        geo.consultarCepDetalhado.and.resolveTo({ status: 'inexistente' });
        await (c as any)._resolverLocalizacaoPorCep('01001000');

        falharGps(new ErroGeolocalizacao('negada', 1));
        await esperar();

        expect(c.geoStatus).toBe('idle');
        expect(c.mensagemErroGeo).toBeNull();
      });

      it('"Alterar" invalida o GPS pendente: a resposta tardia não reaplica a localização', async () => {
        const c = comGeo();
        let entregarGps!: (v: { lat: number; lng: number }) => void;
        geo.obterPosicaoAtual.and.returnValue(new Promise(r => { entregarGps = r; }));
        (c as any)._solicitarLocalizacao();
        expect(c.geoStatus).toBe('loading');

        c.alterarLocalizacao();
        expect(c.geoStatus).toBe('idle');

        entregarGps({ lat: -23.5, lng: -46.6 });
        await esperar();

        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.origemLocalizacao).toBeNull();
        expect(c.geoStatus).toBe('idle');
      });

      it('"Alterar" invalida a consulta de CEP pendente', async () => {
        const c = comGeo();
        let entregarCep!: (v: any) => void;
        geo.consultarCepDetalhado.and.returnValue(new Promise(r => { entregarCep = r; }));
        geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
        const cep = (c as any)._resolverLocalizacaoPorCep('01001000');

        c.alterarLocalizacao();
        entregarCep({ status: 'ok', endereco: END_CEP });
        await cep;

        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.enderecoCep).toBeNull();
      });

      // Segurança da promessa compartilhada `_pedidoGps` entre gerações.
      it('depois de um CEP, novo clique em GPS cria pedido novo; o antigo, ao terminar, não apaga o novo', async () => {
        const c = comGeo();
        let entregar1!: (v: { lat: number; lng: number }) => void;
        let entregar3!: (v: { lat: number; lng: number }) => void;
        const p1 = new Promise<{ lat: number; lng: number }>(r => { entregar1 = r; });
        const p3 = new Promise<{ lat: number; lng: number }>(r => { entregar3 = r; });
        geo.obterPosicaoAtual.and.returnValues(p1, p3);
        geo.consultarCepDetalhado.and.resolveTo({ status: 'inexistente' });

        (c as any)._solicitarLocalizacao(); // geração 1 (GPS)
        await (c as any)._resolverLocalizacaoPorCep('01001000'); // geração 2 (CEP) torna a 1 obsoleta
        const novo = (c as any)._solicitarLocalizacao() as Promise<boolean>; // geração 3 (GPS)
        expect(geo.obterPosicaoAtual).toHaveBeenCalledTimes(2); // não reaproveitou o pedido obsoleto

        entregar1({ lat: -10, lng: -10 }); // o antigo termina primeiro...
        await esperar();
        expect((c as any)._pedidoGps).not.toBeNull(); // ...e NÃO apaga o registro do pedido novo
        expect(c.temGeolocalizacao).toBeFalse(); // nem aplica coordenadas obsoletas

        // um clique repetido na geração atual ainda compartilha o pedido novo
        (c as any)._solicitarLocalizacao();
        expect(geo.obterPosicaoAtual).toHaveBeenCalledTimes(2);

        entregar3({ lat: -23.5, lng: -46.6 });
        expect(await novo).toBeTrue();
        expect(c.geoLat).toBe(-23.5);
        expect(c.origemLocalizacao).toBe('gps');
        expect((c as any)._pedidoGps).toBeNull();
      });

      it('cidade do GPS que responde depois de um CEP não reaparece em "Sua cidade"', async () => {
        const c = comGeo();
        let entregarCidade!: (v: null) => void;
        geo.reverseGeocode.and.returnValue(new Promise(r => { entregarCidade = r; }));
        geo.obterPosicaoAtual.and.resolveTo({ lat: -10, lng: -10 });
        await (c as any)._solicitarLocalizacao(); // GPS aplicado; a cidade ainda está sendo resolvida
        geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END_CEP });
        geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
        await (c as any)._resolverLocalizacaoPorCep('01001000'); // CEP é a última escolha
        expect(c.cidadeNaoResolvida).toBeFalse();

        entregarCidade(null); // o reverse geocode do GPS antigo termina tarde
        await esperar();

        expect(c.cidadeDetectada).toBeNull();
        expect(c.cidadeNaoResolvida).toBeFalse();
        expect(c.origemLocalizacao).toBe('cep');
      });

      it('falha do reverse geocode de um GPS obsoleto não marca a cidade como não resolvida', async () => {
        const c = comGeo();
        let falhar!: (e: unknown) => void;
        geo.reverseGeocode.and.returnValue(new Promise((_, rej) => { falhar = rej; }));
        geo.obterPosicaoAtual.and.resolveTo({ lat: -10, lng: -10 });
        await (c as any)._solicitarLocalizacao();
        c.alterarLocalizacao(); // descarta a posição
        expect(c.cidadeNaoResolvida).toBeFalse();

        falhar(new Error('rede'));
        await esperar();

        expect(c.cidadeNaoResolvida).toBeFalse();
      });

      it('GPS obsoleto devolve false sem toast enganoso ao pedir "Mais próximas"', async () => {
        const c = comGeo();
        let entregarGps!: (v: { lat: number; lng: number }) => void;
        geo.obterPosicaoAtual.and.returnValue(new Promise(r => { entregarGps = r; }));
        const toast = (c as any)._toast.add as jasmine.Spy;
        c.setOrdenacaoResultados('proximidade'); // dispara o pedido de GPS
        geo.consultarCepDetalhado.and.resolveTo({ status: 'inexistente' });
        await (c as any)._resolverLocalizacaoPorCep('01001000'); // torna o GPS obsoleto
        toast.calls.reset();

        entregarGps({ lat: -10, lng: -10 });
        await esperar();

        expect(toast).not.toHaveBeenCalled();
        expect(c.ordenacaoResultados).toBe('az');
      });
    });

    it('"Alterar" desativa o chip "Perto de mim" mesmo sem coordenadas', () => {
      const c = comGeo();
      c.quickFilter = 'perto';
      expect(c.temGeolocalizacao).toBeFalse();

      c.alterarLocalizacao();

      expect(c.quickFilter).toBeNull();
    });

    it('em /buscar, os efeitos secundários da Home (cidade e próximas missas) não executam', async () => {
      const c = comGeo();
      (c as any).resultsMode = true;
      churches.proximasMissas.calls.reset();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });

      expect(await (c as any)._solicitarLocalizacao()).toBeTrue();

      expect(c.geoStatus).toBe('found');
      expect(c.temGeolocalizacao).toBeTrue();
      expect(geo.reverseGeocode).not.toHaveBeenCalled();
      expect(churches.proximasMissas).not.toHaveBeenCalled();
    });

    it('nova tentativa de GPS funciona depois de cada tipo de falha', async () => {
      for (const motivo of ['negada', 'indisponivel', 'timeout', 'inesperado'] as const) {
        const c = comGeo();
        geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao(motivo));
        expect(await (c as any)._solicitarLocalizacao()).toBeFalse();
        expect(c.geoStatus).not.toBe('loading');
        expect((c as any)._pedidoGps).toBeNull();

        geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
        expect(await (c as any)._solicitarLocalizacao()).toBeTrue();
        expect(c.geoStatus).toBe('found');
      }
    });

    describe('registro de falhas dos efeitos secundários', () => {
      const registrado = (c: HomeComponent) => (c as any)._logger.logError as jasmine.Spy;

      it('registra com contexto, sem coordenadas nem dados do usuário, e mantém a degradação', async () => {
        const c = comGeo();
        const log = spyOn((c as any)._logger, 'logError');
        geo.obterPosicaoAtual.and.resolveTo({ lat: -23.512345, lng: -46.698765 });
        geo.reverseGeocode.and.throwError('falha-1');
        churches.proximasMissas.and.throwError('falha-2');

        expect(await (c as any)._solicitarLocalizacao()).toBeTrue();

        expect(registrado(c)).toHaveBeenCalledTimes(2);
        const chamadas = log.calls.allArgs();
        expect(chamadas.map(a => a[1])).toEqual(['home:geo:reverseGeocode', 'home:geo:proximasMissas']);
        expect((chamadas[0][0] as Error).message).toBe('falha-1');
        expect((chamadas[1][0] as Error).message).toBe('falha-2');
        const tudo = JSON.stringify(chamadas.map(a => [String(a[0]), a[1]]));
        expect(tudo).not.toContain('23.51');
        expect(tudo).not.toContain('46.69');
        // degradação controlada
        expect(c.geoStatus).toBe('found');
        expect(c.cidadeNaoResolvida).toBeTrue();
        expect(c.isLoadingProximas).toBeFalse();
      });

      it('erro que não é Error não vaza o conteúdo: registra um texto genérico', async () => {
        const c = comGeo();
        const log = spyOn((c as any)._logger, 'logError');
        geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
        geo.reverseGeocode.and.callFake(() => { throw { url: 'x?lat=-23.5&lng=-46.6' }; });

        await (c as any)._solicitarLocalizacao();

        expect(log.calls.mostRecent().args[0]).toBe('erro não identificado');
      });
    });

    it('"Alterar" descarta a posição em uso e volta ao CEP', async () => {
      const c = comGeo();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.5, lng: -46.6 });
      await (c as any)._solicitarLocalizacao();

      c.alterarLocalizacao();

      expect(c.temGeolocalizacao).toBeFalse();
      expect(c.origemLocalizacao).toBeNull();
      expect(c.searchTab).toBe('local');
      expect(c.localizacaoUsada).toBeNull();
    });
  });

  describe('CEP na Home', () => {
    let geo: jasmine.SpyObj<GeolocationService>;
    const comGeo = () => {
      const c = montar('browser');
      geo = TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>;
      iniciar(c);
      return c;
    };
    const aviso = (c: HomeComponent) => ((c as any)._toast.add as jasmine.Spy).calls.mostRecent().args[0];

    it('aceita CEP com e sem hífen e navega para /buscar com o CEP só em dígitos', async () => {
      for (const digitado of ['01001-000', '01001000']) {
        const c = comGeo();
        geo.consultarCepDetalhado.and.resolveTo({
          status: 'ok',
          endereco: { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' },
        });
        c.form.get('Cep')?.setValue(digitado);

        c.onCepSearch();
        await new Promise(r => setTimeout(r));

        expect(geo.consultarCepDetalhado).toHaveBeenCalledWith('01001000');
        expect(((c as any)._router.navigate as jasmine.Spy).calls.mostRecent().args[1].queryParams)
          .toEqual({ uf: 'SP', cidade: 'São Paulo', cep: '01001000', pagina: 1 });
        TestBed.resetTestingModule();
      }
    });

    it('CEP incompleto não consulta o serviço', () => {
      const c = comGeo();
      c.form.get('Cep')?.setValue('0100');
      c.onCepSearch();

      expect(geo.consultarCepDetalhado).not.toHaveBeenCalled();
      expect(aviso(c).summary).toBe('CEP inválido');
    });

    const falhas: [string, string, string][] = [
      ['inexistente', 'CEP não encontrado', 'Confira o número'],
      ['rede', 'Sem conexão com o serviço de CEP', 'conexão'],
      ['timeout', 'A consulta demorou demais', 'não respondeu a tempo'],
    ];
    falhas.forEach(([status, titulo, trecho]) => {
      it(`CEP "${status}" tem mensagem própria e não navega`, async () => {
        const c = comGeo();
        geo.consultarCepDetalhado.and.resolveTo({ status } as any);
        c.form.get('Cep')?.setValue('01001-000');

        c.onCepSearch();
        await new Promise(r => setTimeout(r));

        expect(aviso(c).summary).toBe(titulo);
        expect(aviso(c).detail).toContain(trecho);
        expect(((c as any)._router.navigate as jasmine.Spy)).not.toHaveBeenCalled();
        expect(c.isLoadingCep).toBeFalse();
      });
    });
  });

  describe('Alterar cidade', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('volta para a aba de busca por cidade, foca o Estado e dá retorno visual temporário', () => {
      const c = montar('browser');
      const focar = jasmine.createSpy('focus');
      (c as any)._ufSelect = { focus: focar };
      c.searchTab = 'local';

      c.alterarCidade();
      expect(c.destacarBusca).toBeFalse();

      jasmine.clock().tick(60);
      expect(c.searchTab).toBe('cidade');
      expect(focar).toHaveBeenCalled();
      expect(c.destacarBusca).toBeTrue();
      expect(c.avisoBusca).toContain('Escolha o estado');

      jasmine.clock().tick(1800);
      expect(c.destacarBusca).toBeFalse();
      expect(c.avisoBusca).toBe('');
    });

    it('não faz nada no servidor (prerender)', () => {
      const c = montar('server');
      c.alterarCidade();
      jasmine.clock().tick(2000);
      expect(c.destacarBusca).toBeFalse();
    });
  });
});

/**
 * `proximasFiltradas` memoiza o array que vai para os filhos OnPush. A chave antiga
 * (`quickFilter|length|churchId[0]`) descrevia a FORMA da lista, não o conteúdo: uma
 * recarga com o mesmo tamanho e a mesma primeira igreja devolvia os cards antigos.
 *
 * Isso ficou visível quando a distância passou a existir só com geolocalização — que é
 * exatamente a sequência abaixo, e o caso mais comum, já que o fallback da API também
 * é São Paulo. Verificado em dados reais: com 1 card da mesma igreja o chip nunca
 * aparecia; com a lista mudando de 1 para 2 cards, aparecia.
 */
describe('HomeComponent — cache de proximasFiltradas', () => {
  let churches: jasmine.SpyObj<ChurchesService>;

  /** Mesma igreja nas duas cargas: é o que fazia a chave antiga não invalidar. */
  const itemApi = {
    igrejaId: 66,
    nome: 'Paróquia Santa Generosa',
    slug: 'paroquia-santa-generosa',
    uf: 'SP',
    cidadeSlug: 'sao-paulo',
    bairro: 'Paraíso',
    missa: { id: 547, diaSemana: 1, horario: '10:00:00' },
    distanciaKm: 2.86,
    latitude: -23.5748,
    longitude: -46.6422,
  };

  function montar(): HomeComponent {
    churches = jasmine.createSpyObj<ChurchesService>('ChurchesService', [
      'addressRange', 'searchByFilters', 'getInfo', 'proximasMissas', 'cidadesProximas',
    ]);
    churches.proximasMissas.and.returnValue(of({ data: [itemApi] } as any));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        DatePipe,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
        { provide: ChurchesService, useValue: churches },
        { provide: BuscaLocalService, useValue: jasmine.createSpyObj('BuscaLocalService', ['carregarIndice', 'buscarIgrejas', 'correspondenciasExatas']) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {}, data: {} }, queryParams: of({}), data: of({}) } },
        { provide: MessageService, useValue: jasmine.createSpyObj('MessageService', ['add']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['searchStarted', 'trackEvent']) },
        { provide: FavoritesService, useValue: { favoritos$: of([]), listar: () => [], ehFavorita: () => false } },
        { provide: RedesSociaisService, useValue: { obterTipos: () => of([]) } },
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep', 'consultarCepDetalhado', 'geocodificarCepProvisorio']) },
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['update', 'setJsonLd', 'removeJsonLd']) },
        { provide: MetricasService, useValue: jasmine.createSpyObj('MetricasService', ['registrarVisualizacaoHome', 'registrarVisualizacaoPagina']) },
        { provide: SeoPaginasService, useValue: { getEstados: () => of([]) } },
      ],
    });
    return TestBed.runInInjectionContext(() => new HomeComponent());
  }

  it('propaga a distância para os cards exibidos quando a localização é concedida', () => {
    const c = montar();

    // 1. Primeira carga, sem localização: a API mede do centro de SP, então a home
    //    não propaga distância nenhuma.
    (c as any)._loadProximasMissas();
    expect(c.proximasFiltradas.length).toBe(1);
    expect(c.proximasFiltradas[0].distanceMeters).toBeUndefined();

    // 2. Segunda carga, com localização: MESMA quantidade e MESMA primeira igreja —
    //    a forma da lista não mudou, só o conteúdo.
    (c as any)._loadProximasMissas(-23.5505, -46.6333);
    expect(c.proximasMissasCards.length).toBe(1);
    expect(c.proximasMissasCards[0].churchId).toBe(66);

    // 3. O que chega ao template precisa ter a distância — era aqui que o cache
    //    devolvia o card antigo e o chip nunca aparecia.
    expect(c.proximasFiltradas[0].distanceMeters).toBe(2860);
  });

  it('mantém a mesma referência enquanto nada muda — o memo continua valendo', () => {
    const c = montar();
    (c as any)._loadProximasMissas(-23.5505, -46.6333);

    const primeira = c.proximasFiltradas;

    expect(c.proximasFiltradas).toBe(primeira);
    expect(c.proximasFiltradas).toBe(primeira);
  });

  it('reage ao quickFilter sem depender de uma nova carga', () => {
    const c = montar();
    (c as any)._loadProximasMissas(-23.5505, -46.6333);
    const semFiltro = c.proximasFiltradas;

    c.quickFilter = 'noite'; // a missa é às 10h — o filtro tem que esvaziar a lista
    const comFiltro = c.proximasFiltradas;

    expect(comFiltro).not.toBe(semFiltro);
    expect(comFiltro.length).toBe(0);

    c.quickFilter = null;
    expect(c.proximasFiltradas.length).toBe(1);
  });
});

/**
 * Filtro de dia em /buscar. Domingo é o valor 0: vindo da URL (toda busca feita na
 * home abre /buscar?dia=0) ele era descartado por `params.dia || undefined`, e a API
 * devolvia igrejas de qualquer dia. "Todos" gera `dia=` na URL, e `Number('')` também
 * é 0: tratar o vazio como número transformaria "Todos" em domingo.
 */
describe('HomeComponent — filtro de dia em /buscar', () => {
  let router: jasmine.SpyObj<Router>;
  let churches: jasmine.SpyObj<ChurchesService>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    churches = jasmine.createSpyObj<ChurchesService>('ChurchesService', [
      'addressRange', 'searchByFilters', 'getInfo', 'proximasMissas', 'cidadesProximas',
    ]);
    churches.addressRange.and.returnValue(of({ data: {} } as any));
    churches.getInfo.and.returnValue(of({ data: {} } as any));
    churches.searchByFilters.and.returnValue(of({ data: { items: [], totalItems: 0 } } as any));
  });

  function montar(
    queryParams: Record<string, string>,
    data: Record<string, unknown> = {},
    prep?: (geo: jasmine.SpyObj<GeolocationService>) => void,
  ): HomeComponent {
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        DatePipe,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: router },
        { provide: ChurchesService, useValue: churches },
        { provide: BuscaLocalService, useValue: jasmine.createSpyObj('BuscaLocalService', ['carregarIndice', 'buscarIgrejas', 'correspondenciasExatas']) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams, data }, queryParams: of(queryParams), data: of(data) } },
        { provide: MessageService, useValue: jasmine.createSpyObj('MessageService', ['add']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['searchStarted', 'trackEvent']) },
        { provide: FavoritesService, useValue: { favoritos$: of([]), listar: () => [], ehFavorita: () => false } },
        { provide: RedesSociaisService, useValue: { obterTipos: () => of([]) } },
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep', 'consultarCepDetalhado', 'geocodificarCepProvisorio']) },
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['update', 'setJsonLd', 'removeJsonLd']) },
        { provide: MetricasService, useValue: jasmine.createSpyObj('MetricasService', ['registrarVisualizacaoHome', 'registrarVisualizacaoPagina']) },
        { provide: SeoPaginasService, useValue: { getEstados: () => of([]) } },
      ],
    });

    // Mocks da localização precisam existir ANTES do ngOnInit (a busca por CEP roda nele).
    prep?.(TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>);
    const c = TestBed.runInInjectionContext(() => new HomeComponent());
    (c as any).resultsMode = true;
    c.ngOnInit();
    return c;
  }

  const ultimaBusca = () => churches.searchByFilters.calls.mostRecent().args[0];
  const ultimaUrl = () => router.navigate.calls.mostRecent().args[1]?.queryParams as Record<string, unknown>;

  [0, 1, 2, 3, 4, 5, 6].forEach(dia => {
    it(`dia=${dia} na URL chega à API como o número ${dia}`, () => {
      montar({ uf: 'SP', dia: String(dia) });

      expect(ultimaBusca().DiaDaSemana).toBe(dia);
    });
  });

  ['', 'abc', '7', '-1', '1.5'].forEach(valor => {
    it(`dia="${valor}" na URL busca sem filtro de dia`, () => {
      const c = montar({ uf: 'SP', dia: valor });

      expect(ultimaBusca().DiaDaSemana).toBeUndefined();
      expect(c.form.get('DiaDaSemana')?.value).toBeNull();
    });
  });

  it('restaura o dia como texto, o formato das opções do campo', () => {
    const c = montar({ uf: 'SP', dia: '0' });

    expect(c.form.get('DiaDaSemana')?.value).toBe('0');
  });

  it('mantém dia=0 na URL ao refazer a busca', () => {
    montar({ uf: 'SP', dia: '0' });

    expect(ultimaUrl()['dia']).toBe('0');
  });

  it('selecionar Domingo no campo envia 0', () => {
    const c = montar({ uf: 'SP' });

    c.form.get('DiaDaSemana')?.setValue('0');
    c.searchFilter();

    expect(ultimaBusca().DiaDaSemana).toBe(0);
    expect(ultimaUrl()['dia']).toBe('0');
  });

  it('a opção Todos busca sem filtro de dia e tira o dia da URL', () => {
    const c = montar({ uf: 'SP', dia: '3' });

    c.form.get('DiaDaSemana')?.setValue('');
    c.searchFilter();

    expect(ultimaBusca().DiaDaSemana).toBeUndefined();
    expect(ultimaUrl()['dia']).toBeNull();
  });

  describe('próxima missa dos resultados', () => {
    const semanal = (diaSemana: number, horario: string) => ({ diaSemana, horario, tipoRecorrencia: 0 });
    const igreja = (id: number, nome: string, missas: unknown[]) => ({ id, nome, missas }) as any;
    const responder = (items: unknown[]) =>
      churches.searchByFilters.and.returnValue(of({ data: { items, totalItems: items.length } } as any));

    it('usa o filtro da busca feita, não a edição ainda não aplicada', () => {
      const a = igreja(1, 'A', [semanal(0, '19:00:00'), semanal(4, '19:00:00')]);
      responder([a]);
      const c = montar({ uf: 'SP', dia: '0' });

      expect(c.proximaMissaDe(a).inicio?.getDay()).toBe(0);

      c.form.get('DiaDaSemana')?.setValue('4');
      (c as any)._proximasFonte = null;

      expect(c.proximaMissaDe(a).inicio?.getDay()).toBe(0);
    });

    it('a ordenação por próxima missa desempata pelo nome e concorda com o card', () => {
      const zelia = igreja(1, 'Zélia', [semanal(0, '19:00:00')]);
      const avila = igreja(2, 'Ávila', [semanal(0, '19:00:00')]);
      const sem = igreja(3, 'Bento', []);
      responder([sem, zelia, avila]);
      const c = montar({ uf: 'SP', dia: '0' }, { resultsMode: true });

      c.setOrdenacaoResultados('proxima-missa');

      expect(c.churchInfoOrdenaFiltrado.map(x => x.nome)).toEqual(['Ávila', 'Zélia', 'Bento']);
      expect(c.proximaMissaDe(sem).estado).toBe('sem-horarios');
    });

    describe('com a página aberta', () => {
      const RES = { resultsMode: true };
      const tick30 = (n = 1) => jasmine.clock().tick(30_000 * n);

      beforeEach(() => jasmine.clock().install());
      afterEach(() => jasmine.clock().uninstall());

      it('passa para a ocorrência seguinte quando a missa começa', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 18, 59, 0));
        const a = igreja(1, 'A', [semanal(1, '19:00:00')]);
        responder([a]);
        const c = montar({ uf: 'SP' }, RES);
        expect(c.proximaMissaDe(a).inicio).toEqual(new Date(2026, 10, 9, 19, 0));

        tick30(3);

        expect(c.proximaMissaDe(a).inicio).toEqual(new Date(2026, 10, 16, 19, 0));
      });

      it('atualiza o instante na meia-noite', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 23, 59, 40));
        const a = igreja(1, 'A', [semanal(2, '19:00:00')]);
        responder([a]);
        const c = montar({ uf: 'SP' }, RES);
        const versao = (c as any)._proximasVersao;
        c.proximaMissaDe(a);

        tick30();

        expect(c.agoraResultados.getDate()).toBe(10);
        c.proximaMissaDe(a);
        expect((c as any)._proximasVersao).toBeGreaterThan(versao);
      });

      [
        ['mês', new Date(2026, 0, 31, 23, 59, 40), new Date(2026, 1, 1, 8, 0)],
        ['ano', new Date(2026, 11, 31, 23, 59, 40), new Date(2027, 0, 1, 8, 0)],
      ].forEach(([nome, inicio, esperado]) => {
        it(`atravessa a virada do ${nome}`, () => {
          jasmine.clock().mockDate(inicio as Date);
          const a = igreja(1, 'A', [{ diaSemana: 0, horario: '08:00:00', tipoRecorrencia: 2, diaDoMes: 1 }]);
          responder([a]);
          const c = montar({ uf: 'SP' }, RES);

          tick30();

          expect(c.proximaMissaDe(a).inicio).toEqual(esperado as Date);
          expect(c.agoraResultados.getTime()).toBeGreaterThanOrEqual((esperado as Date).getTime() - 8 * 3_600_000);
        });
      });

      it('confere ao voltar para a aba, sem esperar o intervalo', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 18, 0));
        const a = igreja(1, 'A', [semanal(1, '19:00:00')]);
        responder([a]);
        const c = montar({ uf: 'SP' }, RES);
        c.proximaMissaDe(a);

        jasmine.clock().mockDate(new Date(2026, 10, 12, 7, 0));
        document.dispatchEvent(new Event('visibilitychange'));

        expect(c.proximaMissaDe(a).inicio).toEqual(new Date(2026, 10, 16, 19, 0));
      });

      it('recalcula se o relógio do aparelho voltar', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 20, 0));
        const a = igreja(1, 'A', [semanal(1, '19:00:00')]);
        responder([a]);
        const c = montar({ uf: 'SP' }, RES);
        expect(c.proximaMissaDe(a).inicio).toEqual(new Date(2026, 10, 16, 19, 0));

        jasmine.clock().mockDate(new Date(2026, 10, 9, 18, 0));
        tick30();

        expect(c.proximaMissaDe(a).inicio).toEqual(new Date(2026, 10, 9, 19, 0));
      });

      it('não recalcula em ciclos sem mudança', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 10, 0));
        const lista = Array.from({ length: 20 }, (_, i) => igreja(i, `I${i}`, [semanal(1, '19:00:00')]));
        responder(lista);
        const c = montar({ uf: 'SP' }, RES);
        c.setOrdenacaoResultados('proxima-missa');
        const primeira = c.churchInfoOrdenaFiltrado;
        const versao = (c as any)._proximasVersao;

        for (let i = 0; i < 200; i++) {
          lista.forEach(x => c.proximaMissaDe(x));
          expect(c.churchInfoOrdenaFiltrado).toBe(primeira);
        }
        tick30(4); // o minuto muda, mas nada venceu
        c.proximaMissaDe(lista[0]);

        expect((c as any)._proximasVersao).toBe(versao);
        expect(c.churchInfoOrdenaFiltrado).toBe(primeira);
      });

      it('fora de /buscar não cria o relógio', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 10, 0));
        const c = montar({ uf: 'SP' });
        const antes = c.agoraResultados;

        tick30(4);

        expect(c.agoraResultados).toBe(antes);
      });

      it('para o relógio ao sair da tela', () => {
        jasmine.clock().mockDate(new Date(2026, 10, 9, 10, 0));
        const c = montar({ uf: 'SP' }, RES);
        const antes = c.agoraResultados;

        TestBed.resetTestingModule();
        tick30(4);

        expect(c.agoraResultados).toBe(antes);
      });
    });

    it('A → Z e Z → A mostram a página na ordem da API', () => {
      responder([igreja(1, 'Bento', []), igreja(2, 'Ávila', [])]);
      const c = montar({ uf: 'SP' }, { resultsMode: true });

      expect(c.churchInfoOrdenaFiltrado.map(x => x.nome)).toEqual(['Bento', 'Ávila']);
      c.setOrdenacaoResultados('za');
      expect(c.churchInfoOrdenaFiltrado.map(x => x.nome)).toEqual(['Bento', 'Ávila']);
    });
  });

  describe('ordenação e grupos em /buscar', () => {
    const semanal = { diaSemana: 0, horario: '19:00:00', tipoRecorrencia: 0 };
    const igreja = (id: number, nome: string, grupoBusca: 1 | 2 | 3) =>
      ({ id, nome, grupoBusca, missas: grupoBusca === 3 ? [] : [semanal] }) as any;
    const responder = (items: unknown[], totaisPorGrupo: unknown = null, totalItems = items.length) =>
      churches.searchByFilters.and.returnValue(of({ data: { items, totalItems, totaisPorGrupo } } as any));
    const totais = (comProximaMissa: number, semProximaData: number, semHorarios: number) =>
      ({ comProximaMissa, semProximaData, semHorarios });
    const titulos = (c: HomeComponent) => c.churchInfoOrdenaFiltrado.map((_, i) => c.tituloGrupo(i));
    const RES = { resultsMode: true };

    it('a busca padrão não manda ordenação nem coordenadas', () => {
      montar({ uf: 'SP' }, RES);

      expect(ultimaBusca().Ordenacao).toBeUndefined();
      expect(ultimaBusca().Lat).toBeUndefined();
    });

    it('Z → A pede a ordem à API a partir da página 1, e A → Z volta ao padrão', () => {
      responder([igreja(1, 'A', 1)]);
      const c = montar({ uf: 'SP', pagina: '3' }, RES);

      c.setOrdenacaoResultados('za');
      expect(ultimaBusca().Ordenacao).toBe(1);
      expect(ultimaBusca()['Paginacao.PageIndex']).toBe(1);

      c.setOrdenacaoResultados('az');
      expect(ultimaBusca().Ordenacao).toBeUndefined();
      expect(churches.searchByFilters).toHaveBeenCalledTimes(3);
    });

    it('Próxima missa reordena só a página, sem nova busca, e põe horários sem data antes de sem horários', () => {
      responder([igreja(1, 'Zélia', 3), igreja(2, 'Bento', 2), igreja(3, 'Ávila', 1)]);
      const c = montar({ uf: 'SP' }, RES);
      const chamadas = churches.searchByFilters.calls.count();
      // Grupo 2 com regra sem próxima ocorrência no navegador também (dia fixo 31 com exceção em todos os dias).
      c.churchInfo[1].missas = [{ diaSemana: 0, horario: '19:00:00', tipoRecorrencia: 2, diaDoMes: 31, diasSemanaExcecao: 0b1111111 } as any];
      (c as any)._proximasFonte = null;

      c.setOrdenacaoResultados('proxima-missa');

      expect(churches.searchByFilters.calls.count()).toBe(chamadas);
      expect(c.churchInfoOrdenaFiltrado.map(x => x.nome)).toEqual(['Ávila', 'Bento', 'Zélia']);
    });

    it('Mais próximas com localização negada: não refaz a busca, não marca o chip e avisa o motivo', async () => {
      responder([igreja(1, 'A', 1)]);
      const c = montar({ uf: 'SP' }, RES, g => g.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('negada', 1)));
      const chamadas = churches.searchByFilters.calls.count();
      const toast = (c as any)._toast.add as jasmine.Spy;
      toast.calls.reset();

      c.setOrdenacaoResultados('proximidade');
      await new Promise(r => setTimeout(r));

      expect(churches.searchByFilters.calls.count()).toBe(chamadas);
      expect(c.ordenacaoResultados).toBe('az');
      expect(toast.calls.mostRecent().args[0].detail).toContain('Permita o acesso à localização');
    });

    it('Mais próximas com localização concedida: marca o chip e busca com a origem', async () => {
      responder([igreja(1, 'A', 1)]);
      const c = montar({ uf: 'SP' }, RES, g => {
        g.obterPosicaoAtual.and.resolveTo({ lat: -23.5505199, lng: -46.6333094 });
        g.reverseGeocode.and.resolveTo(null);
      });

      c.setOrdenacaoResultados('proximidade');
      await new Promise(r => setTimeout(r));

      expect(c.ordenacaoResultados).toBe('proximidade');
      expect(ultimaBusca().Ordenacao).toBe(2);
      expect(ultimaBusca().Lat).toBe(-23.5505);
    });

    it('Mais próximas com localização manda a origem com 4 casas', () => {
      responder([igreja(1, 'A', 1)]);
      const c = montar({ uf: 'SP' }, RES);
      (c as any)._userLat = -23.5505199;
      (c as any)._userLng = -46.6333094;

      c.setOrdenacaoResultados('proximidade');

      expect(ultimaBusca().Ordenacao).toBe(2);
      expect(ultimaBusca().Lat).toBe(-23.5505);
      expect(ultimaBusca().Lng).toBe(-46.6333);
    });

    it('título antes do primeiro card de cada grupo da página', () => {
      responder(
        [igreja(1, 'A', 1), igreja(2, 'B', 1), igreja(3, 'C', 1), igreja(4, 'D', 2), igreja(5, 'E', 3), igreja(6, 'F', 3)],
        totais(3, 1, 2));
      const c = montar({ uf: 'SP' }, RES);

      expect(titulos(c)).toEqual([
        'Com próximas missas', null, null, 'Horários sem próxima data', 'Sem horários informados', null,
      ]);
    });

    it('página que começa no meio de um grupo não repete o título', () => {
      responder([igreja(3, 'C', 1), igreja(4, 'D', 3)], totais(3, 0, 2), 5);
      const c = montar({ uf: 'SP', pagina: '2' }, RES);
      c.pageSize = 2;

      expect(titulos(c)).toEqual([null, 'Sem horários informados']);
    });

    it('página que começa exatamente no início de um grupo mostra o título', () => {
      responder([igreja(4, 'D', 3), igreja(5, 'E', 3)], totais(3, 0, 2), 5);
      const c = montar({ uf: 'SP', pagina: '2' }, RES);
      c.pageSize = 3;

      expect(titulos(c)).toEqual(['Sem horários informados', null]);
    });

    it('sem títulos quando só há um grupo, fora das ordens por nome ou com filtro da página', () => {
      responder([igreja(1, 'A', 1), igreja(2, 'B', 1)], totais(2, 0, 0));
      const unico = montar({ uf: 'SP' }, RES);
      expect(titulos(unico)).toEqual([null, null]);
      TestBed.resetTestingModule();

      responder([igreja(1, 'A', 1), igreja(2, 'B', 3)], totais(1, 0, 1));
      const c = montar({ uf: 'SP' }, RES);
      expect(titulos(c)).toEqual(['Com próximas missas', 'Sem horários informados']);

      c.setOrdenacaoResultados('proxima-missa');
      expect(titulos(c)).toEqual([null, null]);

      c.setOrdenacaoResultados('az');
      c.quickFilter = 'noite';
      expect(c.churchInfoOrdenaFiltrado.every((_, i) => c.tituloGrupo(i) === null)).toBeTrue();
    });

    it('resposta sem totaisPorGrupo (API antiga) não mostra títulos', () => {
      responder([igreja(1, 'A', 1), igreja(2, 'B', 3)]);
      const c = montar({ uf: 'SP' }, RES);

      expect(titulos(c)).toEqual([null, null]);
    });

    describe('busca vinda do CEP', () => {
      const END = { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };
      const esvaziar = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

      it('com coordenadas: pede proximidade à API, mostra o CEP e marca a localização como aproximada', async () => {
        const c = montar({ uf: 'SP', cidade: 'São Paulo', cep: '01001000' }, RES, g => {
          g.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END });
          g.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55052, lng: -46.63331 } });
        });
        expect(churches.searchByFilters).not.toHaveBeenCalled();

        await esvaziar();

        expect(ultimaBusca().Ordenacao).toBe(2);
        expect(ultimaBusca().Lat).toBe(-23.5505);
        expect(ultimaBusca().Lng).toBe(-46.6333);
        expect(c.ordenacaoResultados).toBe('proximidade');
        expect(c.origemLocalizacao).toBe('cep');
        expect(c.localizacaoUsada?.tipo).toBe('cep');
        expect(c.localizacaoUsada?.texto).toContain('01001-000');
        expect(c.localizacaoUsada?.texto).toContain('aproximada');
      });

      it('endereço sem coordenadas: busca por cidade, sem ordenar por distância nem dizer "aproximada"', async () => {
        const c = montar({ uf: 'SP', cep: '01001000' }, RES, g => {
          g.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END });
          g.geocodificarCepProvisorio.and.resolveTo({ status: 'sem-coordenadas' });
        });
        await esvaziar();

        expect(ultimaBusca().Ordenacao).toBeUndefined();
        expect(ultimaBusca().Lat).toBeUndefined();
        expect(c.ordenacaoResultados).toBe('az');
        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.localizacaoUsada?.tipo).toBe('cep-sem-coordenadas');
        expect(c.localizacaoUsada?.texto).not.toContain('aproximada');
        expect(c.avisoCep).toContain('Não encontramos as coordenadas');
      });

      const falhas: ['inexistente' | 'rede' | 'timeout', string][] = [
        ['inexistente', 'CEP não encontrado'],
        ['rede', 'Sem conexão'],
        ['timeout', 'demorou demais'],
      ];
      falhas.forEach(([status, trecho]) => {
        it(`CEP "${status}" na consulta: busca por cidade/UF, sem distância e com aviso próprio`, async () => {
          const c = montar({ uf: 'SP', cep: '01001000' }, RES, g => {
            g.consultarCepDetalhado.and.resolveTo({ status });
          });
          await esvaziar();

          expect(ultimaBusca().Lat).toBeUndefined();
          expect(c.temGeolocalizacao).toBeFalse();
          expect(c.avisoCep).toContain(trecho);
          expect(c.localizacaoUsada).toBeNull();
        });
      });

      it('falha só na geocodificação (rede/timeout): aviso de distância indisponível', async () => {
        const c = montar({ uf: 'SP', cep: '01001000' }, RES, g => {
          g.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END });
          g.geocodificarCepProvisorio.and.resolveTo({ status: 'timeout' });
        });
        await esvaziar();

        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.avisoCep).toContain('Não foi possível calcular a distância');
        expect(ultimaBusca().Ordenacao).toBeUndefined();
      });

      it('um CEP novo descarta a posição anterior (nada de distância do lugar antigo)', async () => {
        const c = montar({ uf: 'SP', cep: '01001000' }, RES, g => {
          g.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco: END });
          g.geocodificarCepProvisorio.and.resolveTo({ status: 'sem-coordenadas' });
        });
        (c as any)._userLat = -1;
        (c as any)._userLng = -1;
        (c as any).origemLocalizacao = 'gps';

        await (c as any)._resolverLocalizacaoPorCep('01001000');

        expect(c.temGeolocalizacao).toBeFalse();
        expect(c.origemLocalizacao).toBeNull();
      });

      it('consulta lenta: busca sem proximidade e ignora a resposta tardia', async () => {
        jasmine.clock().install();
        let entregarCep!: (r: any) => void;
        try {
          const c = montar({ uf: 'SP', cep: '01001000' }, RES, g => {
            g.consultarCepDetalhado.and.returnValue(new Promise(r => { entregarCep = r; }));
            g.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.5, lng: -46.6 } });
          });
          await esvaziar();
          jasmine.clock().tick(6000);
          await esvaziar();

          expect(ultimaBusca().Ordenacao).toBeUndefined();
          expect(c.avisoCep).toContain('demorou demais');

          entregarCep({ status: 'ok', endereco: END });
          await esvaziar();
          expect(c.ordenacaoResultados).toBe('az');
          expect(c.temGeolocalizacao).toBeFalse();
        } finally {
          jasmine.clock().uninstall();
        }
      });
    });
  });
});
