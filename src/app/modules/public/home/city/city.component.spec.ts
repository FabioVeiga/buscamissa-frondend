import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, Subject, concat, of, throwError } from 'rxjs';

import { CityComponent } from './city.component';
import { ChurchesService } from '../../../../core/services/churches.service';
import { MetricasService } from '../../../../core/services/metricas.service';
import { SeoService } from '../../../../core/services/seo.service';

/**
 * Trava a regressão de CLS reportada pelo Search Console (grupo de 3.159 URLs,
 * CLS 0,49 em mobile).
 *
 * A página de cidade é prerenderizada e o PrerenderTransferStateInterceptor entrega
 * o conteúdo de forma SÍNCRONA na 1ª emissão. Antes da correção o componente ligava
 * `isLoading = true` e só desligava no `finalize()` — que no `concat` do SWR só roda
 * ao FIM da revalidação de rede. Resultado medido: os 58 cards prerenderizados eram
 * destruídos, viravam 5 skeletons por ~4,2s e voltavam — dois layout shifts de
 * ~0,377 e ~0,386.
 *
 * O contrato defendido aqui: skeleton SÓ quando não há conteúdo, e loading encerrado
 * na PRIMEIRA emissão.
 */
describe('CityComponent — skeleton não pode substituir conteúdo já renderizado', () => {
  let fixture: ComponentFixture<CityComponent>;
  let c: CityComponent;

  const igreja = (id: number, nome: string) => ({
    id,
    nome,
    imagemUrl: null,
    endereco: { bairro: 'Centro', latitude: -7.11, longitude: -34.87 },
    missas: [{ id, diaSemana: 0, horario: '19:00:00' }],
  });

  const resposta = (nomes: string[]) => ({
    data: {
      cidade: 'João Pessoa',
      igrejas: nomes.map((n, i) => igreja(i + 1, n)),
      seo: { title: 'Missas em João Pessoa/PB', canonicalUrl: 'https://buscamissa.com.br/missas/pb/joao-pessoa' },
    },
  });

  /** Cards reais renderizados. */
  const cards = () => fixture.nativeElement.querySelectorAll('app-city-card').length;
  /** Cards de skeleton (o estado de carregamento). */
  const skeletons = () => fixture.nativeElement.querySelectorAll('.city-card--skeleton').length;

  const montar = (resposta$: Observable<any>, plataforma: 'browser' | 'server' = 'browser') => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CityComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: plataforma },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ uf: 'pb', cidade: 'joao-pessoa' }),
            queryParams: of({}),
            snapshot: { params: { uf: 'pb', cidade: 'joao-pessoa' }, queryParams: {}, data: {} },
          },
        },
        { provide: ChurchesService, useValue: { getByCidade: () => resposta$ } },
      ],
    });

    fixture = TestBed.createComponent(CityComponent);
    c = fixture.componentInstance;
  };

  // ── A. Primeiro carregamento SEM dados ────────────────────────────────────
  it('A) sem conteúdo: mostra skeleton, e o troca pelos cards quando o dado chega', () => {
    const rede = new Subject<any>();
    montar(rede);

    fixture.detectChanges();
    expect(c.isLoading).withContext('deve carregar quando não há nada em tela').toBeTrue();
    expect(skeletons()).toBeGreaterThan(0);
    expect(cards()).toBe(0);

    rede.next(resposta(['Catedral', 'Guadalupe', 'Penha']));
    fixture.detectChanges();

    expect(c.isLoading).toBeFalse();
    expect(skeletons()).toBe(0);
    expect(cards()).toBe(3);
  });

  // ── A2. Espaço do cabeçalho reservado durante o carregamento ──────────────
  // Subtítulo e ordenação nasciam junto com os dados (*ngIf) e empurravam filtros
  // e lista na navegação SPA (CLS 0,78 no celular). Agora existem desde o início,
  // invisíveis, e só ganham conteúdo/visibilidade quando o dado chega.
  it('A2) subtítulo e ordenação ocupam o layout desde o skeleton, invisíveis até o dado chegar', () => {
    const rede = new Subject<any>();
    montar(rede);
    const sub = () => fixture.nativeElement.querySelector('.city-header__sub') as HTMLElement | null;
    const sort = () => fixture.nativeElement.querySelector('.city-sort') as HTMLElement | null;

    fixture.detectChanges();
    expect(skeletons()).toBeGreaterThan(0);
    expect(sub()).withContext('subtítulo no DOM durante o skeleton').not.toBeNull();
    expect(sub()!.classList).toContain('city-header__sub--reservado');
    expect(sort()).withContext('ordenação no DOM durante o skeleton').not.toBeNull();
    expect(sort()!.classList).toContain('city-sort--reservado');

    rede.next(resposta(['Catedral', 'Guadalupe', 'Penha']));
    fixture.detectChanges();

    expect(sub()!.classList).not.toContain('city-header__sub--reservado');
    expect(sub()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('3 igrejas encontradas');
    expect(sort()!.classList).not.toContain('city-sort--reservado');
  });

  // ── A3. Botão "Ver mapa" só entra com os dados ────────────────────────────
  // Ele é o último elemento da página e fica no fluxo (sem fixed). Visível durante o
  // skeleton, era empurrado para o fim quando os cards chegavam (CLS 0,016–0,021).
  it('A3) botão "Ver mapa" ausente durante o skeleton e presente com os dados', () => {
    const rede = new Subject<any>();
    montar(rede);
    const botao = () => fixture.nativeElement.querySelector('.city-fab-mapa') as HTMLElement | null;

    fixture.detectChanges();
    expect(skeletons()).toBeGreaterThan(0);
    expect(botao()).withContext('sem botão durante o skeleton').toBeNull();

    rede.next(resposta(['Catedral', 'Guadalupe', 'Penha']));
    fixture.detectChanges();

    expect(botao()).withContext('botão presente com os dados').not.toBeNull();
    expect(botao()!.textContent).toContain('Ver mapa');
  });

  // ── A4. Altura do mapa reservada no prerender ─────────────────────────────
  // O mapa é client-only (@if _isBrowser + @defer). Sem reserva no HTML do servidor
  // a coluna nascia só com o CTA, e o mapa entrava na hidratação empurrando o CTA
  // ~400px (CLS 0,017–0,042 na carga direta no desktop).
  it('A4) o slot do mapa existe no servidor (prerender) e no browser', () => {
    const slot = () => fixture.nativeElement.querySelector('.city-mapa .city-mapa__slot');

    montar(of(resposta(['Catedral'])), 'server');
    fixture.detectChanges();
    expect(slot()).withContext('prerender').not.toBeNull();

    montar(of(resposta(['Catedral'])));
    fixture.detectChanges();
    expect(slot()).withContext('browser').not.toBeNull();
  });

  // ── B. Conteúdo vindo do TransferState/cache ──────────────────────────────
  it('B) com cache síncrono: renderiza os cards direto, sem passar por skeleton', () => {
    const revalidacao = new Subject<any>();
    montar(concat(of(resposta(['Catedral', 'Guadalupe', 'Penha'])), revalidacao));

    fixture.detectChanges();

    // O `next` síncrono desligou o loading no MESMO tick em que ele foi ligado,
    // antes de a detecção de mudanças rodar — o skeleton nunca chega ao DOM.
    expect(c.isLoading).withContext('loading encerrado na 1ª emissão').toBeFalse();
    expect(skeletons()).withContext('nenhum skeleton deve ser pintado').toBe(0);
    expect(cards()).toBe(3);

    // E a revalidação viva também não pode piscar skeleton.
    revalidacao.next(resposta(['Catedral', 'Guadalupe', 'Penha']));
    fixture.detectChanges();
    expect(skeletons()).toBe(0);
    expect(cards()).toBe(3);
  });

  // ── C. Revalidação lenta ──────────────────────────────────────────────────
  it('C) revalidação lenta: os cards permanecem na tela durante toda a espera', () => {
    const revalidacaoLenta = new Subject<any>();
    montar(concat(of(resposta(['Catedral', 'Guadalupe'])), revalidacaoLenta));

    fixture.detectChanges();
    expect(cards()).toBe(2);

    // Vários ciclos de detecção enquanto a rede não responde: em NENHUM deles pode
    // aparecer skeleton (era exatamente a janela de ~4,2s do bug).
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      expect(skeletons()).withContext(`ciclo ${i} não pode virar skeleton`).toBe(0);
      expect(cards()).toBe(2);
    }

    expect(c.isLoading).toBeFalse();
  });

  // ── D. Erro de API ────────────────────────────────────────────────────────
  it('D) erro na revalidação: conteúdo preservado, sem estado de erro por cima', () => {
    montar(concat(of(resposta(['Catedral', 'Guadalupe'])), throwError(() => new Error('500'))));

    fixture.detectChanges();

    expect(cards()).withContext('a falha da revalidação não derruba o conteúdo').toBe(2);
    expect(skeletons()).toBe(0);
    expect(c.erroCarregar).withContext('não anuncia erro com conteúdo em tela').toBeFalse();
  });

  it('D2) erro SEM conteúdo prévio: mantém o estado de erro com retry', () => {
    montar(throwError(() => new Error('500')));

    fixture.detectChanges();

    expect(c.erroCarregar).toBeTrue();
    expect(cards()).toBe(0);
  });

  // ── E. Canonical no erro ──────────────────────────────────────────────────
  describe('canonical no erro', () => {
    const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
    const limparHead = () => document.head.querySelectorAll('link[rel="canonical"], meta[property="og:url"]').forEach((el) => el.remove());

    beforeEach(limparHead);
    afterEach(limparHead);

    it('E1) erro SEM conteúdo: não recria canonical a partir da URL', () => {
      montar(throwError(() => new Error('500')));
      fixture.detectChanges();

      expect(canonical()).toBeNull();
    });

    it('E2) erro na revalidação COM conteúdo: a canonical da API permanece', () => {
      montar(concat(of(resposta(['Catedral'])), throwError(() => new Error('500'))));
      fixture.detectChanges();

      expect(canonical()).toBe('https://buscamissa.com.br/missas/pb/joao-pessoa');
    });
  });
});

/**
 * A FAQ da página de cidade é o texto que o Google exibe como snippet na consulta
 * principal — medido em 2026-09-10 para "missa em campinas". Estes testes travam o
 * contrato de que cada resposta descreve o que a página REALMENTE entrega.
 *
 * As três afirmações anteriores divergiam do comportamento real: a página nunca
 * agrupou por dia da semana, 66% das cidades saíam como "das 1 paróquia(s)", e 27%
 * afirmavam ter missa de domingo sem ter nenhuma cadastrada.
 */
describe('CityComponent — a FAQ tem de descrever o que a página entrega', () => {
  let fixture: ComponentFixture<CityComponent>;
  let c: CityComponent;

  const igreja = (id: number, nome: string, dias: number[]) => ({
    id,
    nome,
    imagemUrl: null,
    endereco: { bairro: 'Centro', latitude: -7.11, longitude: -34.87 },
    missas: dias.map((d, i) => ({ id: id * 10 + i, diaSemana: d, horario: '19:00:00' })),
  });

  const montar = (igrejas: any[]) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CityComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ uf: 'sp', cidade: 'campinas' }),
            queryParams: of({}),
            snapshot: { params: { uf: 'sp', cidade: 'campinas' }, queryParams: {}, data: {} },
          },
        },
        {
          provide: ChurchesService,
          useValue: { getByCidade: () => of({ data: { cidade: 'Campinas', igrejas, seo: {} } }) },
        },
      ],
    });
    fixture = TestBed.createComponent(CityComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  };

  const respostas = () => c.faqs.map((f) => f.resposta).join(' | ');

  it('não promete agrupamento por dia da semana, que a página não faz', () => {
    montar([igreja(1, 'Catedral', [0, 3]), igreja(2, 'Santa Rita', [0])]);
    expect(respostas()).not.toContain('organizados por dia da semana');
  });

  it('usa singular quando a cidade tem uma só paróquia', () => {
    montar([igreja(1, 'Matriz', [0])]);
    const r = respostas();
    expect(r).not.toContain('1 paróquia(s)');
    expect(r).not.toContain('Diversas paróquias');
    expect(c.faqs[0].resposta).toContain('da paróquia cadastrada');
  });

  it('usa plural com a contagem real quando há várias', () => {
    montar([igreja(1, 'Catedral', [0]), igreja(2, 'Santa Rita', [0]), igreja(3, 'São José', [3])]);
    expect(c.faqs[0].resposta).toContain('cada uma das 3 paróquias');
  });

  it('conta as paróquias que realmente têm missa de domingo', () => {
    montar([igreja(1, 'Catedral', [0, 3]), igreja(2, 'Santa Rita', [0]), igreja(3, 'São José', [5])]);
    expect(c.faqs[1].resposta).toContain('2 paróquias');
    expect(c.faqs[1].resposta).toContain('missa de domingo');
  });

  it('não afirma que há missa de domingo quando não há nenhuma', () => {
    // 27% das cidades caem neste caso e a resposta anterior dizia "Sim" mesmo assim.
    montar([igreja(1, 'Matriz', [3]), igreja(2, 'São José', [5])]);
    expect(c.faqs[1].resposta).not.toContain('Sim');
    expect(c.faqs[1].resposta).toContain('Ainda não há missa de domingo');
  });

  it('não afirma listar TODAS as paróquias da cidade', () => {
    // A base é mantida pela comunidade e é incompleta: São Paulo tem 156 paróquias
    // sem nenhum horário cadastrado.
    montar([igreja(1, 'Matriz', [0])]);
    expect(respostas()).not.toContain('todas as paróquias');
  });

  it('cidade sem nenhum horário não ganha perguntas sobre horário', () => {
    montar([igreja(1, 'Matriz', []), igreja(2, 'São José', [])]);
    expect(c.faqs.length).toBe(1);
    expect(c.faqs[0].pergunta).toContain('Onde ficam as igrejas católicas');
    expect(c.faqs[0].resposta).toContain('2 igrejas católicas');
    expect(respostas()).not.toContain('missa hoje');
    expect(respostas()).not.toContain('missa de domingo');
  });

  it('basta uma paróquia com horário para voltar às três perguntas', () => {
    montar([igreja(1, 'Matriz', []), igreja(2, 'São José', [0])]);
    expect(c.faqs.length).toBe(3);
  });

  it('a FAQ vai para o JSON-LD com o mesmo texto exibido', () => {
    montar([igreja(1, 'Matriz', [0])]);
    const ld = document.querySelector('script[type="application/ld+json"]#faq')
      ?? [...document.querySelectorAll('script[type="application/ld+json"]')]
           .find((s) => (s.textContent || '').includes('FAQPage'));
    expect(ld).withContext('o bloco FAQPage precisa existir').toBeTruthy();
    expect(ld!.textContent).toContain(c.faqs[0].resposta);
  });
});

/**
 * O nome da cidade vem SÓ da API (Plano 2, 11/2026). Antes ele era montado a partir
 * do slug ("itapejara-d-oeste" → "Itapejara D Oeste") e aparecia no H1 até a API
 * responder; se ela falhasse, o title ficava com o slug cru
 * ("Missas em itapejara-d-oeste/PR"). A métrica de visualização também saía antes da
 * resposta, com esse nome inventado.
 */
describe('CityComponent — nome da cidade só da API', () => {
  let fixture: ComponentFixture<CityComponent>;
  let params$: BehaviorSubject<{ uf: string; cidade: string }>;
  let resposta$: () => Observable<any>;
  let metricas: jasmine.Spy;
  let seoUpdate: jasmine.Spy;

  const NOME = "Itapejara d'Oeste";

  const igrejaDe = (id: number) => ({
    id,
    nome: `Paróquia ${id}`,
    imagemUrl: null,
    endereco: { bairro: 'Centro', latitude: -25.9, longitude: -52.8 },
    missas: [{ id, diaSemana: 0, horario: '19:00:00' }],
  });
  const respostaDe = (cidade: string, n = 1) => ({
    data: { cidade, igrejas: Array.from({ length: n }, (_, i) => igrejaDe(i + 1)), seo: {} },
  });

  const texto = (sel: string) =>
    ((fixture.nativeElement.querySelector(sel) as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  const h1 = () => texto('h1');
  const breadcrumb = () => texto('.city-breadcrumb__item--active');
  const titles = () => seoUpdate.calls.all().map((ch) => ch.args[0]?.title).filter(Boolean) as string[];
  const ultimoTitle = () => titles()[titles().length - 1];

  const montar = (plataforma: 'browser' | 'server' = 'browser', inicial = { uf: 'pr', cidade: 'itapejara-d-oeste' }) => {
    TestBed.resetTestingModule();
    params$ = new BehaviorSubject(inicial);
    TestBed.configureTestingModule({
      imports: [CityComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: plataforma },
        {
          provide: ActivatedRoute,
          useValue: {
            params: params$,
            queryParams: of({}),
            snapshot: { params: inicial, queryParams: {}, data: {} },
          },
        },
        { provide: ChurchesService, useValue: { getByCidade: () => resposta$() } },
      ],
    });
    metricas = spyOn(TestBed.inject(MetricasService), 'registrarVisualizacaoCidade');
    seoUpdate = spyOn(TestBed.inject(SeoService), 'update').and.callThrough();
    fixture = TestBed.createComponent(CityComponent);
  };

  /** Nenhum texto visível nem title pode conter o slug ou o nome montado a partir dele. */
  const semNomeInventado = () => {
    for (const t of [h1(), breadcrumb(), ...titles()]) {
      expect(t).not.toContain('itapejara-d-oeste');
      expect(t).not.toContain('Itapejara D Oeste');
    }
  };

  it('sucesso: H1, breadcrumb e title usam o nome da API; métrica uma vez, com esse nome', () => {
    resposta$ = () => of(respostaDe(NOME));
    montar();
    fixture.detectChanges();
    expect(h1()).toBe(`Missas em ${NOME}/PR`);
    expect(breadcrumb()).toBe(`${NOME}/PR`);
    expect(ultimoTitle()).toContain(`${NOME}/PR`);
    expect(metricas).toHaveBeenCalledOnceWith('pr', 'itapejara-d-oeste', NOME);
    semNomeInventado();
  });

  it('carregando: sem nome nenhum, com marcador do tamanho de um nome e sem métrica', () => {
    const rede = new Subject<any>();
    resposta$ = () => rede;
    montar();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1 .city-nome-reservado')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.city-breadcrumb .city-nome-reservado')).not.toBeNull();
    expect(metricas).not.toHaveBeenCalled();
    semNomeInventado();
  });

  it('falha da API sem conteúdo: title e H1 neutros com a UF, nunca o slug; sem métrica', () => {
    resposta$ = () => throwError(() => new Error('rede'));
    montar();
    fixture.detectChanges();
    expect(h1()).toBe('Horários de missa — PR');
    expect(ultimoTitle()).toBe('Horários de missa — PR | BuscaMissa');
    expect(metricas).not.toHaveBeenCalled();
    semNomeInventado();
  });

  it('resposta duplicada (cache + revalidação): uma métrica só e o mesmo nome', () => {
    resposta$ = () => concat(of(respostaDe(NOME)), of(respostaDe(NOME)));
    montar();
    fixture.detectChanges();
    expect(metricas).toHaveBeenCalledTimes(1);
    expect(h1()).toBe(`Missas em ${NOME}/PR`);
  });

  it('revalidação sem `cidade` não apaga o nome nem troca pelo slug', () => {
    resposta$ = () => concat(of(respostaDe(NOME)), of({ data: { igrejas: [igrejaDe(1)], seo: {} } }));
    montar();
    fixture.detectChanges();
    expect(h1()).toBe(`Missas em ${NOME}/PR`);
    semNomeInventado();
  });

  it('cidade sem paróquias (slug inválido): sem métrica', () => {
    resposta$ = () => of({ data: { cidade: 'Lugar Nenhum', igrejas: [], seo: {} } });
    montar();
    fixture.detectChanges();
    expect(metricas).not.toHaveBeenCalled();
  });

  it('navegação interna: o nome da cidade anterior some até a nova responder', () => {
    resposta$ = () => of(respostaDe(NOME));
    montar();
    fixture.detectChanges();
    expect(h1()).toBe(`Missas em ${NOME}/PR`);

    const rede = new Subject<any>();
    resposta$ = () => rede;
    params$.next({ uf: 'pr', cidade: 'francisco-beltrao' });
    fixture.detectChanges();
    expect(h1()).not.toContain('Itapejara');
    expect(h1()).not.toContain('Francisco Beltrao');
    expect(fixture.nativeElement.querySelector('h1 .city-nome-reservado')).not.toBeNull();

    rede.next(respostaDe('Francisco Beltrão'));
    fixture.detectChanges();
    expect(h1()).toBe('Missas em Francisco Beltrão/PR');
    expect(metricas.calls.allArgs()).toEqual([
      ['pr', 'itapejara-d-oeste', NOME],
      ['pr', 'francisco-beltrao', 'Francisco Beltrão'],
    ]);
  });

  it('prerender (servidor) com dados: H1, breadcrumb e title como antes, sem marcador', () => {
    resposta$ = () => of({
      data: {
        cidade: 'Curitiba',
        igrejas: [igrejaDe(1), igrejaDe(2)],
        seo: { title: 'Missa hoje em Curitiba/PR: horários | BuscaMissa', canonicalUrl: 'https://buscamissa.com.br/missas/pr/curitiba' },
      },
    });
    montar('server', { uf: 'pr', cidade: 'curitiba' });
    fixture.detectChanges();
    expect(h1()).toBe('Missas em Curitiba/PR');
    expect(breadcrumb()).toBe('Curitiba/PR');
    expect(ultimoTitle()).toBe('Missa hoje em Curitiba/PR: horários | BuscaMissa');
    expect(fixture.nativeElement.querySelector('.city-nome-reservado')).toBeNull();
  });
});
