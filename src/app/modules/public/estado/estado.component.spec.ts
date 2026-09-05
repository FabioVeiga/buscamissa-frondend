import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, concat, of, throwError } from 'rxjs';

import { EstadoComponent } from './estado.component';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';

/**
 * Mesmo contrato de CLS de city/details, para o hub de estado.
 *
 * Aqui o risco é o maior dos quatro: skeleton, "não encontrado", erro e conteúdo são
 * ramos do MESMO `@if`, então qualquer um deles apaga o hub inteiro (hero + destaques
 * + índice A–Z). Medido na auditoria: par de shifts de ~0,551 (CLS 1,10 — o pior).
 *
 * Componente OnPush: os pontos que mudam `isLoading` precisam de markForCheck, senão
 * a view não reflete o estado — por isso os asserts são sobre o DOM, não só o campo.
 */
describe('EstadoComponent — skeleton não pode substituir conteúdo já renderizado', () => {
  let fixture: ComponentFixture<EstadoComponent>;
  let c: EstadoComponent;

  const resposta = (cidades: string[]) => ({
    estado: 'Paraíba',
    totalCidades: cidades.length,
    totalParoquias: cidades.length * 3,
    cidades: cidades.map((nome, i) => ({
      cidadeSlug: nome.toLowerCase().replace(/\s/g, '-'),
      cidade: nome,
      totalParoquias: 10 - i,
    })),
    dias: ['domingo', 'sabado'],
    seo: { title: 'Missas na Paraíba | BuscaMissa', canonicalUrl: 'https://buscamissa.com.br/missas/pb' },
  });

  /** O conteúdo real do hub (o hero só existe no ramo `@else`). */
  const conteudo = () => fixture.nativeElement.querySelectorAll('app-page-hero').length;
  /** O estado de carregamento. */
  const skeletons = () => fixture.nativeElement.querySelectorAll('p-skeleton').length;

  const montar = (resposta$: Observable<any>) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EstadoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ uf: 'pb' })),
            params: of({ uf: 'pb' }),
            queryParams: of({}),
            snapshot: { params: { uf: 'pb' }, queryParams: {}, data: {} },
          },
        },
        { provide: SeoPaginasService, useValue: { getEstado: () => resposta$ } },
      ],
    });

    fixture = TestBed.createComponent(EstadoComponent);
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

    rede.next(resposta(['João Pessoa', 'Campina Grande']));
    fixture.detectChanges();

    expect(c.isLoading).toBeFalse();
    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });

  // ── B. Conteúdo vindo do TransferState/cache ──────────────────────────────
  it('B) com cache síncrono: renderiza o hub direto, sem passar por skeleton', () => {
    const revalidacao = new Subject<any>();
    montar(concat(of(resposta(['João Pessoa', 'Campina Grande'])), revalidacao));

    fixture.detectChanges();

    expect(c.isLoading).withContext('loading encerrado na 1ª emissão').toBeFalse();
    expect(skeletons()).withContext('nenhum skeleton deve ser pintado').toBe(0);
    expect(conteudo()).toBe(1);

    revalidacao.next(resposta(['João Pessoa', 'Campina Grande', 'Patos']));
    fixture.detectChanges();
    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });

  // ── C. Revalidação lenta ──────────────────────────────────────────────────
  it('C) revalidação lenta: o hub permanece na tela durante toda a espera', () => {
    montar(concat(of(resposta(['João Pessoa'])), new Subject<any>()));

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
    montar(concat(of(resposta(['João Pessoa'])), throwError(() => ({ status: 500 }))));

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
});
