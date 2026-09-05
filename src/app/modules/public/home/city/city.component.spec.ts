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
