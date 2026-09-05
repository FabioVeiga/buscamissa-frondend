import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, concat, of, throwError } from 'rxjs';

import { IntencaoComponent } from './intencao.component';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';

/**
 * Mesmo contrato de CLS de city/details/estado, para a árvore de intenção por dia.
 *
 * Como em estado, skeleton/erro/"não encontrado"/conteúdo são ramos do MESMO `@if`.
 * Os hubs (`/missa-{dia}` e `/missa-{dia}/{uf}`) são prerenderizados e têm
 * TransferState — ali o skeleton não pode aparecer.
 *
 * A folha `/missa-{dia}/{uf}/{cidade}` é RenderMode.Client e NÃO tem TransferState:
 * lá o skeleton É o comportamento correto, e o último teste trava isso para a
 * correção não ter apagado o loading legítimo do CSR.
 */
describe('IntencaoComponent — skeleton não pode substituir conteúdo já renderizado', () => {
  let fixture: ComponentFixture<IntencaoComponent>;
  let c: IntencaoComponent;

  const arvore = (ufs: string[]) => ({
    estados: ufs.map((uf) => ({ uf, estado: uf.toUpperCase(), cidades: [] })),
    seo: { title: 'Missa de domingo | BuscaMissa', canonicalUrl: 'https://buscamissa.com.br/missa-domingo' },
  });

  const respostaCidade = () => ({
    cidade: 'João Pessoa',
    paroquias: [{ id: 1, nome: 'Catedral', cidadeSlug: 'joao-pessoa', uf: 'pb', slug: 'catedral' }],
    seo: { title: 'Missa de domingo em João Pessoa | BuscaMissa' },
  });

  /** O conteúdo real (o breadcrumb só existe no ramo `@else`). */
  const conteudo = () => fixture.nativeElement.querySelectorAll('nav.breadcrumb').length;
  /** O estado de carregamento. */
  const skeletons = () => fixture.nativeElement.querySelectorAll('p-skeleton').length;

  const montar = (resposta$: Observable<any>, params: Record<string, string> = {}) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [IntencaoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ dia: 'domingo' }),
            paramMap: of(convertToParamMap(params)),
            queryParams: of({}),
            snapshot: { params, queryParams: {}, data: { dia: 'domingo' } },
          },
        },
        {
          provide: SeoPaginasService,
          useValue: { getArvoreDia: () => resposta$, getIntencaoCidade: () => resposta$ },
        },
      ],
    });

    fixture = TestBed.createComponent(IntencaoComponent);
    c = fixture.componentInstance;
  };

  // ── A. Primeiro carregamento SEM dados ────────────────────────────────────
  it('A) sem conteúdo: mostra skeleton, e o troca pelo hub quando o dado chega', () => {
    const rede = new Subject<any>();
    montar(rede);

    fixture.detectChanges();
    expect(c.isLoading).toBeTrue();
    expect(skeletons()).toBeGreaterThan(0);
    expect(conteudo()).toBe(0);

    rede.next(arvore(['pb', 'sp']));
    fixture.detectChanges();

    expect(c.isLoading).toBeFalse();
    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });

  // ── B. Conteúdo vindo do TransferState/cache ──────────────────────────────
  it('B) com cache síncrono: renderiza o hub direto, sem passar por skeleton', () => {
    const revalidacao = new Subject<any>();
    montar(concat(of(arvore(['pb', 'sp'])), revalidacao));

    fixture.detectChanges();

    expect(c.isLoading).withContext('loading encerrado na 1ª emissão').toBeFalse();
    expect(skeletons()).withContext('nenhum skeleton deve ser pintado').toBe(0);
    expect(conteudo()).toBe(1);

    revalidacao.next(arvore(['pb', 'sp', 'rj']));
    fixture.detectChanges();
    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });

  // ── C. Revalidação lenta ──────────────────────────────────────────────────
  it('C) revalidação lenta: o hub permanece na tela durante toda a espera', () => {
    montar(concat(of(arvore(['pb'])), new Subject<any>()));

    fixture.detectChanges();
    expect(conteudo()).toBe(1);

    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      expect(skeletons()).withContext(`ciclo ${i} não pode virar skeleton`).toBe(0);
      expect(conteudo()).toBe(1);
    }

    expect(c.isLoading).toBeFalse();
  });

  // ── D. Erro de API ────────────────────────────────────────────────────────
  it('D) erro na revalidação: conteúdo preservado, sem estado de erro por cima', () => {
    montar(concat(of(arvore(['pb'])), throwError(() => ({ status: 500 }))));

    fixture.detectChanges();

    expect(conteudo()).withContext('a falha da revalidação não derruba o hub').toBe(1);
    expect(skeletons()).toBe(0);
    expect(c.erroCarregar).toBeFalse();
    expect(c.naoEncontrado).toBeFalse();
  });

  it('D2) erro SEM conteúdo prévio: mantém o estado de erro com retry', () => {
    montar(throwError(() => ({ status: 500 })));

    fixture.detectChanges();

    expect(c.erroCarregar).toBeTrue();
    expect(conteudo()).toBe(0);
  });

  // ── Controle: a folha CSR não pode ter perdido o skeleton ─────────────────
  it('folha /missa-{dia}/{uf}/{cidade} (CSR, sem TransferState) ainda mostra skeleton', () => {
    const rede = new Subject<any>();
    montar(rede, { uf: 'pb', cidade: 'joao-pessoa' });

    fixture.detectChanges();
    expect(c.nivel).toBe('cidade');
    expect(skeletons()).withContext('sem cache, o skeleton é o comportamento correto').toBeGreaterThan(0);

    rede.next(respostaCidade());
    fixture.detectChanges();

    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });
});
