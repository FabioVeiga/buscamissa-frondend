import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT, Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';

import { AppComponent } from './app.component';
import { AnalyticsService } from './core/services/analytics.service';
import { ClarityService } from './core/services/clarity.service';
import { ConsentService } from './core/services/consent.service';
import { NavigationHistoryService } from './core/services/navigation-history.service';

@Component({ template: '' })
class PaginaVazia {}

/**
 * SEO aplicado pelo `data` da rota a cada navegação.
 *
 * Rota que declara canonical (as páginas estáticas) a mantém. Rota que não declara
 * (paróquia, cidade, estado...) fica SEM canonical até o componente aplicar a que
 * vem da API — em vez de herdar a `document.URL`, que numa URL inexistente é ela
 * própria.
 *
 * PLATFORM_ID 'server': o SEO roda nos dois ambientes; analytics/Clarity, que só
 * existem no browser, ficam de fora do teste.
 */
describe('AppComponent — canonical vinda do data da rota', () => {
  let router: Router;
  let doc: Document;

  const canonical = () => doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  const limparHead = () => doc.querySelectorAll('link[rel="canonical"], meta[property="og:url"]').forEach((el) => el.remove());

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        // O ConsentService é injetado no construtor e pede HttpClient, mesmo sem
        // ser usado no server: sem o dublê, os specs caíam no NullInjectorError.
        { provide: ConsentService, useValue: { iniciar: () => {} } },
        provideRouter([
          {
            path: 'estatica',
            component: PaginaVazia,
            data: { title: 'Estática | BuscaMissa', canonical: 'https://buscamissa.com.br/estatica' },
          },
          { path: 'paroquia/:uf/:cidade/:slug', component: PaginaVazia, data: { title: 'Detalhes da Igreja | BuscaMissa' } },
        ]),
      ],
    });

    doc = TestBed.inject(DOCUMENT);
    limparHead();
    router = TestBed.inject(Router);
    TestBed.createComponent(AppComponent).detectChanges();
  });

  afterEach(limparHead);

  it('rota com data.canonical: cria a canonical declarada', async () => {
    await router.navigateByUrl('/estatica');

    expect(canonical()).toBe('https://buscamissa.com.br/estatica');
  });

  it('rota dinâmica sem data.canonical: fica sem canonical até o dado chegar', async () => {
    await router.navigateByUrl('/estatica');
    expect(canonical()).not.toBeNull();

    await router.navigateByUrl('/paroquia/sp/itapevi/paroquia-sao-judas-tadeu');

    expect(canonical()).withContext('nem a da rota anterior, nem a document.URL').toBeNull();
  });
});

/**
 * Topo da página a cada troca de PÁGINA. Com o <main> em min-height (anti-CLS do
 * footer), o documento não encolhe mais na troca de rota, então o scroll deixou de
 * voltar a 0 sozinho — sem esta regra a rota nova abriria no meio, ainda carregando.
 */
describe('AppComponent — scroll na navegação SPA', () => {
  let router: Router;
  let scrollTo: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        // Os serviços de browser carregam scripts de terceiros: fora do teste.
        { provide: ConsentService, useValue: { iniciar: () => {} } },
        { provide: AnalyticsService, useValue: { initPageTracking: () => {} } },
        { provide: ClarityService, useValue: { setPrevRoute: () => {}, tag: () => {}, detectSessionOrigin: () => '' } },
        { provide: NavigationHistoryService, useValue: { track: () => {} } },
        provideLocationMocks(),
        provideRouter([
          { path: 'missas/:uf/:cidade', component: PaginaVazia },
          { path: 'paroquia/:uf/:cidade/:slug', component: PaginaVazia },
        ]),
      ],
    });

    router = TestBed.inject(Router);
    scrollTo = spyOn(window, 'scrollTo');
    TestBed.createComponent(AppComponent).detectChanges();
  });

  it('troca de página: volta ao topo', async () => {
    await router.navigateByUrl('/missas/sp/campinas');
    await router.navigateByUrl('/paroquia/sp/campinas/catedral');

    expect(scrollTo).toHaveBeenCalledOnceWith(0, 0);
  });

  it('só a query muda (filtro de cidade): mantém a posição', async () => {
    await router.navigateByUrl('/missas/sp/campinas');
    await router.navigateByUrl('/missas/sp/campinas?dia=domingo');

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('voltar pelo histórico: deixa a restauração com o navegador', async () => {
    await router.navigateByUrl('/missas/sp/campinas');
    await router.navigateByUrl('/paroquia/sp/campinas/catedral');
    scrollTo.calls.reset();

    // No app real o bootstrap liga este listener; no TestBed, não.
    router.setUpLocationChangeListener();
    const voltou = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    TestBed.inject(Location).back();
    await voltou;

    expect(router.url).toBe('/missas/sp/campinas');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('URL com âncora: não atropela o fragmento', async () => {
    await router.navigateByUrl('/missas/sp/campinas');
    await router.navigateByUrl('/paroquia/sp/campinas/catedral#horarios');

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
