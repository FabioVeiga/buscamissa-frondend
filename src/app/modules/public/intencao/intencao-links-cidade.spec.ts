import { Component, PLATFORM_ID, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, NavigationEnd, Router, convertToParamMap, provideRouter } from '@angular/router';
import { filter, firstValueFrom, of } from 'rxjs';

import { IntencaoComponent, diaFiltroCidade } from './intencao.component';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { SeoService } from '../../../core/services/seo.service';
import { DIAS_INTENCAO } from '../../../core/constants/dias-intencao';
import { DIAS } from '../home/city/city.constants';

/**
 * Links de cidade da árvore de intenção apontam para `/missas/{uf}/{cidade}?dia=`
 * (prerenderizada, canonical próprio), nunca para a folha CSR
 * `/missa-{dia}/{uf}/{cidade}` — cuja casca inicial é a da home e virava
 * "Duplicate, Google chose different canonical" no GSC.
 */
describe('IntencaoComponent — links de cidade', () => {
  describe('diaFiltroCidade: slug da intenção → ?dia= da página de cidade', () => {
    it('cobre os 7 dias, cada um no MESMO dia da semana do CityComponent', () => {
      expect(DIAS_INTENCAO.length).toBe(7);
      DIAS_INTENCAO.forEach((d, posicao) => {
        const curto = diaFiltroCidade(d.slug);
        const alvo = DIAS.find((x) => x.slug === curto);
        // Posição em DIAS_INTENCAO = dia da semana (0 = domingo), e é o idx que o
        // CityComponent compara com m.diaSemana ao filtrar.
        expect(alvo).withContext(`${d.slug} precisa existir em DIAS`).toBeDefined();
        expect(alvo!.idx).withContext(`${d.slug} → ${curto}`).toBe(posicao);
      });
    });

    it('mapeia explicitamente os slugs com e sem "-feira"', () => {
      expect(diaFiltroCidade('domingo')).toBe('domingo');
      expect(diaFiltroCidade('segunda-feira')).toBe('segunda');
      expect(diaFiltroCidade('terca-feira')).toBe('terca');
      expect(diaFiltroCidade('quarta-feira')).toBe('quarta');
      expect(diaFiltroCidade('quinta-feira')).toBe('quinta');
      expect(diaFiltroCidade('sexta-feira')).toBe('sexta');
      expect(diaFiltroCidade('sabado')).toBe('sabado');
    });

    it('dia desconhecido vira null (o link sai sem ?dia=, não com um valor que o filtro ignora)', () => {
      expect(diaFiltroCidade('hoje')).toBeNull();
      expect(diaFiltroCidade('')).toBeNull();
    });
  });

  @Component({ standalone: true, template: '' })
  class CidadeStub {
    route = inject(ActivatedRoute);
  }

  const montar = (dia: string, params: Record<string, string>, resposta: any) => {
    TestBed.resetTestingModule();
    const seo = jasmine.createSpyObj<SeoService>('SeoService', ['update', 'setJsonLd']);
    TestBed.configureTestingModule({
      imports: [IntencaoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([
          { path: 'origem', component: CidadeStub },
          { path: 'missas/:uf/:cidade', component: CidadeStub },
        ]),
        provideLocationMocks(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SeoService, useValue: seo },
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ dia }),
            paramMap: of(convertToParamMap(params)),
            queryParams: of({}),
            snapshot: { params, queryParams: {}, data: { dia } },
          },
        },
        {
          provide: SeoPaginasService,
          useValue: { getArvoreDia: () => of(resposta), getIntencaoCidade: () => of(resposta) },
        },
      ],
    });
    const fixture = TestBed.createComponent(IntencaoComponent);
    fixture.detectChanges();
    return fixture;
  };

  const arvoreUf = (dia: string) => ({
    estados: [
      {
        uf: 'mg',
        estado: 'Minas Gerais',
        cidades: [
          { cidadeSlug: 'rio-novo', cidade: 'Rio Novo' },
          { cidadeSlug: 'belo-horizonte', cidade: 'Belo Horizonte' },
        ],
      },
    ],
    seo: { title: `Missa de ${dia} em Minas Gerais`, canonicalUrl: `https://buscamissa.com.br/missa-${dia}/mg` },
  });

  const hrefs = (el: HTMLElement, seletor: string) =>
    Array.from(el.querySelectorAll<HTMLAnchorElement>(seletor)).map((a) => a.getAttribute('href') ?? '');

  /** /missa-{dia}/{uf}/{cidade} — o formato que não pode voltar a ser linkado. */
  const FOLHA_ANTIGA = /^\/missa-[a-z-]+\/[a-z]{2}\/[^/?#]+/;

  DIAS_INTENCAO.forEach(({ slug }) => {
    it(`nível UF (${slug}): cidades apontam para /missas/mg/{cidade}?dia=${diaFiltroCidade(slug)}`, () => {
      const fixture = montar(slug, { uf: 'mg' }, arvoreUf(slug));
      const lista = hrefs(fixture.nativeElement, 'ul.grid a');

      expect(lista).toEqual([
        `/missas/mg/rio-novo?dia=${diaFiltroCidade(slug)}`,
        `/missas/mg/belo-horizonte?dia=${diaFiltroCidade(slug)}`,
      ]);
      const todos = hrefs(fixture.nativeElement, 'a');
      expect(todos.filter((h) => FOLHA_ANTIGA.test(h))).toEqual([]);

      // O ItemList (JSON-LD) aponta para a URL canônica da cidade, não para a folha.
      const itemList = TestBed.inject(SeoService).setJsonLd as jasmine.Spy;
      const [, dados] = itemList.calls.allArgs().find(([chave]) => chave === 'itemlist')!;
      expect(dados.itemListElement.map((i: any) => i.item)).toEqual([
        'https://buscamissa.com.br/missas/mg/rio-novo',
        'https://buscamissa.com.br/missas/mg/belo-horizonte',
      ]);
    });
  });

  it('folha de cidade: "outros dias" aponta para a cidade filtrada, nunca para outra folha', () => {
    const fixture = montar('sexta-feira', { uf: 'mg', cidade: 'rio-novo' }, {
      cidade: 'Rio Novo',
      paroquias: [{ id: 1, nome: 'Matriz', slug: 'matriz', missas: [] }],
      seo: { title: 'Missa de sexta-feira em Rio Novo' },
    });
    const outros = hrefs(fixture.nativeElement, 'nav.outros-dias a');

    expect(outros.length).toBe(6);
    expect(outros).not.toContain('/missas/mg/rio-novo?dia=sexta');
    for (const d of ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sabado']) {
      expect(outros).toContain(`/missas/mg/rio-novo?dia=${d}`);
    }
    expect(hrefs(fixture.nativeElement, 'a').filter((h) => FOLHA_ANTIGA.test(h))).toEqual([]);
  });

  it('clique leva à rota de cidade com ?dia= intacto, e voltar/avançar restauram a URL', async () => {
    const fixture = montar('terca-feira', { uf: 'mg' }, arvoreUf('terca-feira'));
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    // Em TestBed o Router só escuta popstate depois da navegação inicial.
    router.initialNavigation();
    await router.navigateByUrl('/origem');

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('ul.grid a');
    link.click();
    await fixture.whenStable();

    expect(router.url).toBe('/missas/mg/rio-novo?dia=terca');
    const qp = router.parseUrl(router.url).queryParams;
    expect(qp['dia']).toBe('terca');
    // O valor chega ao CityComponent como o slug que DIAS reconhece (terça = idx 2).
    expect(DIAS.find((d) => d.slug === qp['dia'])?.idx).toBe(2);

    // back/forward do Location disparam a navegação de forma assíncrona (popstate).
    const navegou = () => firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));

    let fim = navegou();
    location.back();
    await fim;
    expect(router.url).toBe('/origem');

    fim = navegou();
    location.forward();
    await fim;
    expect(router.url).toBe('/missas/mg/rio-novo?dia=terca');
  });
});
