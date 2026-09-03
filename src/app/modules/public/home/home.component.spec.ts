import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { HomeComponent } from './home.component';
import { ChurchesService } from '../../../core/services/churches.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { FavoritesService } from '../../../core/services/favorites.service';
import { RedesSociaisService } from '../../../core/services/redes-sociais.service';
import { GeolocationService } from '../../../core/services/geolocation.service';
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
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep']) },
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
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep']) },
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
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep']) },
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
