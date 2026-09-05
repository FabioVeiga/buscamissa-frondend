import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, Subject, concat, of, throwError } from 'rxjs';

import { DetailsComponent } from './details.component';
import { ChurchesService } from '../../../../core/services/churches.service';

/**
 * Mesmo contrato de CLS defendido em city.component.spec.ts, para a página de
 * paróquia — o outro template do grupo de 3.159 URLs do Search Console.
 *
 * Aqui o conteúdo é ainda mais sensível: `*ngIf="!isLoading && churchInfo"` embrulha
 * a página inteira (header, scoreboard, horários, contato), então ligar `isLoading`
 * durante a revalidação apagava tudo. Medido na auditoria: par de shifts de ~0,466.
 */
describe('DetailsComponent — skeleton não pode substituir conteúdo já renderizado', () => {
  let fixture: ComponentFixture<DetailsComponent>;
  let c: DetailsComponent;

  const resposta = (nome: string) => ({
    data: {
      igreja: {
        id: 1,
        nome,
        imagemUrl: null,
        statusConfianca: 2,
        endereco: {
          localidade: 'João Pessoa', uf: 'PB', bairro: 'Centro',
          logradouro: 'Praça Dom Ulrico', numero: '1', cep: '58010-000',
          latitude: -7.11, longitude: -34.87,
        },
        missas: [{ id: 1, diaSemana: 0, horario: '12:00:00' }],
        contato: {},
        redesSociais: [],
      },
      seo: { title: `${nome} | BuscaMissa`, canonicalUrl: 'https://buscamissa.com.br/paroquia/pb/joao-pessoa/x' },
    },
  });

  /** O conteúdo real da paróquia. */
  const conteudo = () => fixture.nativeElement.querySelectorAll('app-details-header').length;
  /** O estado de carregamento. */
  const skeletons = () => fixture.nativeElement.querySelectorAll('p-skeleton').length;

  const montar = (resposta$: Observable<any>) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DetailsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ uf: 'pb', cidade: 'joao-pessoa', slug: 'catedral' }),
            queryParams: of({}),
            snapshot: { params: {}, queryParams: {}, data: {} },
          },
        },
        {
          provide: ChurchesService,
          useValue: {
            getByCidadeESlug: () => resposta$,
            getByNomeUnico: () => resposta$,
            gerarFingerprint: () => 'teste',
            // Usados pelos filhos (details-confirmar / details-reportar-modal):
            // sem eles o TestBed quebra antes de chegar no que este spec defende.
            getResumoConfirmacoes: () => of({ data: { confirmacoes: 0, reports: 0 } }),
            confirmarHorarios: () => of({ data: {} }),
            reportarProblema: () => of({ data: {} }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(DetailsComponent);
    c = fixture.componentInstance;
  };

  // ── A. Primeiro carregamento SEM dados ────────────────────────────────────
  it('A) sem conteúdo: mostra skeleton, e o troca pela paróquia quando o dado chega', () => {
    const rede = new Subject<any>();
    montar(rede);

    fixture.detectChanges();
    expect(c.isLoading).toBeTrue();
    expect(skeletons()).toBeGreaterThan(0);
    expect(conteudo()).toBe(0);

    rede.next(resposta('Catedral Basílica Nossa Senhora das Neves'));
    fixture.detectChanges();

    expect(c.isLoading).toBeFalse();
    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });

  // ── B. Conteúdo vindo do TransferState/cache ──────────────────────────────
  it('B) com cache síncrono: renderiza a paróquia direto, sem passar por skeleton', () => {
    const revalidacao = new Subject<any>();
    montar(concat(of(resposta('Catedral')), revalidacao));

    fixture.detectChanges();

    expect(c.isLoading).withContext('loading encerrado na 1ª emissão').toBeFalse();
    expect(skeletons()).withContext('nenhum skeleton deve ser pintado').toBe(0);
    expect(conteudo()).toBe(1);

    revalidacao.next(resposta('Catedral'));
    fixture.detectChanges();
    expect(skeletons()).toBe(0);
    expect(conteudo()).toBe(1);
  });

  // ── C. Revalidação lenta ──────────────────────────────────────────────────
  it('C) revalidação lenta: a paróquia permanece na tela durante toda a espera', () => {
    montar(concat(of(resposta('Catedral')), new Subject<any>()));

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
    montar(concat(of(resposta('Catedral')), throwError(() => ({ status: 500 }))));

    fixture.detectChanges();

    expect(conteudo()).withContext('a falha da revalidação não derruba a página').toBe(1);
    expect(skeletons()).toBe(0);
    expect(c.erroCarregar).toBeFalse();
    expect(c.naoEncontrada).withContext('nem mesmo um 404 pode apagar conteúdo já visível').toBeFalse();
  });

  it('D2) erro SEM conteúdo prévio: mantém o estado de erro com retry', () => {
    montar(throwError(() => ({ status: 500 })));

    fixture.detectChanges();

    expect(c.erroCarregar).toBeTrue();
    expect(conteudo()).toBe(0);
  });
});
