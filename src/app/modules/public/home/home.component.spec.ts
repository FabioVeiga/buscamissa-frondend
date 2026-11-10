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

  function montar(queryParams: Record<string, string>, data: Record<string, unknown> = {}): HomeComponent {
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
        { provide: GeolocationService, useValue: jasmine.createSpyObj('GeolocationService', ['obterPosicaoAtual', 'reverseGeocode', 'consultarCep']) },
        { provide: SeoService, useValue: jasmine.createSpyObj('SeoService', ['update', 'setJsonLd', 'removeJsonLd']) },
        { provide: MetricasService, useValue: jasmine.createSpyObj('MetricasService', ['registrarVisualizacaoHome', 'registrarVisualizacaoPagina']) },
        { provide: SeoPaginasService, useValue: { getEstados: () => of([]) } },
      ],
    });

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

  describe('ordenação em /buscar', () => {
    const semanal = { diaSemana: 0, horario: '19:00:00', tipoRecorrencia: 0 };
    const igreja = (id: number, nome: string, grupoBusca: 1 | 2 | 3) =>
      ({ id, nome, grupoBusca, missas: grupoBusca === 3 ? [] : [semanal] }) as any;
    const responder = (items: unknown[], totaisPorGrupo: unknown = null, totalItems = items.length) =>
      churches.searchByFilters.and.returnValue(of({ data: { items, totalItems, totaisPorGrupo } } as any));
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

    it('Mais próximas sem localização não refaz a busca', () => {
      responder([igreja(1, 'A', 1)]);
      const c = montar({ uf: 'SP' }, RES);
      const chamadas = churches.searchByFilters.calls.count();

      c.setOrdenacaoResultados('proximidade');

      expect(churches.searchByFilters.calls.count()).toBe(chamadas);
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

    describe('busca vinda do CEP', () => {
      const json = (corpo: unknown) => Promise.resolve({ json: () => Promise.resolve(corpo) } as Response);
      const esvaziar = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

      it('espera a geocodificação e pede proximidade à API', async () => {
        spyOn(window, 'fetch').and.callFake((url: any) => String(url).includes('viacep')
          ? json({ logradouro: 'Praça da Sé', localidade: 'São Paulo', uf: 'SP' })
          : json([{ lat: '-23.55052', lon: '-46.63331' }]));

        const c = montar({ uf: 'SP', cidade: 'São Paulo', cep: '01001000' }, RES);
        expect(churches.searchByFilters).not.toHaveBeenCalled();

        await esvaziar();

        expect(ultimaBusca().Ordenacao).toBe(2);
        expect(ultimaBusca().Lat).toBe(-23.5505);
        expect(c.ordenacaoResultados).toBe('proximidade');
      });

      it('sem coordenadas, busca na ordem padrão', async () => {
        spyOn(window, 'fetch').and.returnValue(Promise.reject(new Error('offline')));

        const c = montar({ uf: 'SP', cep: '01001000' }, RES);
        await esvaziar();

        expect(ultimaBusca().Ordenacao).toBeUndefined();
        expect(c.ordenacaoResultados).toBe('az');
      });

      it('geocodificação lenta: busca sem proximidade e ignora a resposta tardia', async () => {
        jasmine.clock().install();
        let responderNominatim!: (r: Response) => void;
        spyOn(window, 'fetch').and.callFake((url: any) => String(url).includes('viacep')
          ? json({ localidade: 'São Paulo', uf: 'SP' })
          : new Promise<Response>(r => { responderNominatim = r; }));
        try {
          const c = montar({ uf: 'SP', cep: '01001000' }, RES);
          await esvaziar();
          jasmine.clock().tick(4000);
          await esvaziar();

          expect(ultimaBusca().Ordenacao).toBeUndefined();

          responderNominatim({ json: () => Promise.resolve([{ lat: '-23.5', lon: '-46.6' }]) } as Response);
          await esvaziar();
          expect(c.ordenacaoResultados).toBe('az');
        } finally {
          jasmine.clock().uninstall();
        }
      });
    });
  });
});
