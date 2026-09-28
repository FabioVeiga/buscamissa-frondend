import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Router, provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

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
