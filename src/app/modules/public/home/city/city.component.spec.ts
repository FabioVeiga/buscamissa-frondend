import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, Subject, concat, of, throwError } from 'rxjs';

import { CityComponent } from './city.component';
import { ChurchesService } from '../../../../core/services/churches.service';

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

  const montar = (resposta$: Observable<any>) => {
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

  it('a FAQ vai para o JSON-LD com o mesmo texto exibido', () => {
    montar([igreja(1, 'Matriz', [0])]);
    const ld = document.querySelector('script[type="application/ld+json"]#faq')
      ?? [...document.querySelectorAll('script[type="application/ld+json"]')]
           .find((s) => (s.textContent || '').includes('FAQPage'));
    expect(ld).withContext('o bloco FAQPage precisa existir').toBeTruthy();
    expect(ld!.textContent).toContain(c.faqs[0].resposta);
  });
});
