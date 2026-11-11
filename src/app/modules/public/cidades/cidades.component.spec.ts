import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CidadesComponent } from './cidades.component';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { BuscaLocalService } from '../../../core/services/busca-local.service';

/**
 * Contrato de `/cidades` depois da reformulação do hero (etapa 2).
 *
 * Duas coisas são fixadas aqui, no nível do componente:
 *  - a ESTRUTURA que o SEO depende: um único <h1> e todos os links de cidade no DOM
 *    com o acordeão fechado (o guard `scripts/verificar-seo-cidades.mjs` confere o
 *    mesmo no HTML prerenderizado);
 *  - o botão "Buscar": nenhum clique fica sem resposta.
 */
describe('CidadesComponent — hero e busca', () => {
  let fixture: ComponentFixture<CidadesComponent>;
  let raiz: HTMLElement;
  let router: Router;

  const ESTADOS = [
    {
      uf: 'PR', estado: 'Paraná', totalCidades: 2, totalParoquias: 130,
      cidades: [
        { cidadeSlug: 'curitiba', cidade: 'Curitiba', totalParoquias: 126 },
        { cidadeSlug: 'itapejara-d-oeste', cidade: "Itapejara d'Oeste", totalParoquias: 4 },
      ],
    },
    {
      uf: 'SP', estado: 'São Paulo', totalCidades: 1, totalParoquias: 509,
      cidades: [{ cidadeSlug: 'sao-paulo', cidade: 'São Paulo', totalParoquias: 509 }],
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CidadesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SeoPaginasService, useValue: { getEstados: () => of(ESTADOS) } },
      ],
    });
    // O índice de igrejas "responde vazio": a busca por cidade não depende dele.
    spyOn(TestBed.inject(BuscaLocalService), 'carregarIndice').and.returnValue(of(false));
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(CidadesComponent);
    fixture.detectChanges();
    raiz = fixture.nativeElement;
  });

  const campo = () => raiz.querySelector('.busca input') as HTMLInputElement;
  const botao = () => raiz.querySelector('.busca__btn') as HTMLButtonElement;

  const digitar = (texto: string) => {
    campo().value = texto;
    campo().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('tem um único <h1>, com o texto aprovado', () => {
    const h1 = raiz.querySelectorAll('h1');
    expect(h1.length).toBe(1);
    expect(h1[0].textContent!.replace(/\s+/g, ' ').trim()).toBe('Encontre a missa na sua cidade');
  });

  it('usa a variante compacta do hero', () => {
    expect(raiz.querySelector('.ph-hero')!.classList.contains('ph-hero--compacto')).toBeTrue();
  });

  it('mantém os <h2> das seções', () => {
    const h2 = [...raiz.querySelectorAll('h2')].map((h) => h.textContent!.trim());
    expect(h2).toContain('Capitais e principais cidades');
    expect(h2).toContain('Escolha uma cidade');
  });

  it('todas as cidades têm link no DOM com o acordeão fechado', () => {
    expect(raiz.querySelectorAll('.estado-header[aria-expanded="true"]').length).toBe(0);
    const hrefs = [...raiz.querySelectorAll('a.cidade-link')].map((a) => a.getAttribute('href'));
    expect(hrefs.sort()).toEqual([
      '/missas/pr/curitiba',
      '/missas/pr/itapejara-d-oeste',
      '/missas/sp/sao-paulo',
    ]);
  });

  it('o botão "Buscar" tem nome acessível e não submete formulário', () => {
    expect(botao().textContent!.trim()).toBe('Buscar');
    expect(botao().type).toBe('button');
  });

  it('"Buscar" sem texto devolve o foco ao campo e não navega', () => {
    botao().click();
    expect(document.activeElement).toBe(campo());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('"Buscar" com cidade que casa vai para a página da cidade', () => {
    digitar('curitiba');
    botao().click();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/missas', 'pr', 'curitiba']);
  });

  it('"Buscar" com texto que não casa abre o painel com a mensagem, sem navegar', () => {
    digitar('xyzxyz');
    botao().click();
    fixture.detectChanges();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(raiz.querySelector('.sugestoes__vazio')!.textContent).toContain('Não encontramos nada');
  });

  it('Enter continua levando ao primeiro resultado', () => {
    digitar('sao paulo');
    campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(router.navigate).toHaveBeenCalledOnceWith(['/missas', 'sp', 'sao-paulo']);
  });
});
