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
 *  - a ESTRUTURA que o SEO depende: um único <h1>, os links das principais cidades e
 *    o link para /estados (o guard `scripts/verificar-seo-cidades.mjs` confere o
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

  // Foto do hero (etapa 3): reaproveita a imagem de /missas/:uf e não pode custar
  // rede no mobile nem causar CLS.
  describe('foto do hero', () => {
    const foto = () => raiz.querySelector('picture.hero-foto') as HTMLElement;

    it('reaproveita a catedral-estado.webp, só a partir de 900px', () => {
      const sources = foto().querySelectorAll('source');
      expect(sources.length).toBe(1);
      expect(sources[0].getAttribute('media')).toBe('(min-width: 900px)');
      expect(sources[0].getAttribute('srcset')).toBe('assets/images/catedral-estado.webp');
    });

    it('abaixo de 900px o <img> cai num GIF inline — nenhuma requisição', () => {
      expect(foto().querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
    });

    it('reserva a proporção (anti-CLS) e é decorativa', () => {
      const img = foto().querySelector('img')!;
      expect(img.getAttribute('width')).toBe('1200');
      expect(img.getAttribute('height')).toBe('1801');
      expect(img.getAttribute('alt')).toBe('');
      expect(foto().closest('.ph-hero__arte')!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('mantém o <h2> das principais cidades e não tem mais a lista por estado', () => {
    const h2 = [...raiz.querySelectorAll('h2')].map((h) => h.textContent!.trim());
    expect(h2).toContain('Capitais e principais cidades');
    expect(h2).not.toContain('Escolha uma cidade');
    expect(raiz.querySelectorAll('.estado-card, a.cidade-link').length).toBe(0);
  });

  it('linka as principais cidades, da mais para a menos paróquias', () => {
    const hrefs = [...raiz.querySelectorAll('a.destaque')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/missas/sp/sao-paulo', '/missas/pr/curitiba', '/missas/pr/itapejara-d-oeste']);
  });

  it('o bloco "Procurando outra cidade?" leva a /estados com o total de cidades', () => {
    const link = raiz.querySelector('a.ver-estados') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/estados');
    expect(link.textContent).toContain('todas as 3 cidades');
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
