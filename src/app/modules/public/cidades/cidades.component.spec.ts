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
    // "Capitais" saiu: o critério é número de paróquias, e Guarulhos ou São
    // Bernardo não são capitais.
    expect(h2).toContain('Principais cidades');
    expect(h2).not.toContain('Escolha uma cidade');
    expect(raiz.querySelectorAll('.estado-card, a.cidade-link').length).toBe(0);
  });

  it('linka as principais cidades, da mais para a menos paróquias', () => {
    const hrefs = [...raiz.querySelectorAll('a.destaque')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/missas/sp/sao-paulo', '/missas/pr/curitiba', '/missas/pr/itapejara-d-oeste']);
  });

  it('cada cartão mostra o total real de paróquias e a UF', () => {
    const metas = [...raiz.querySelectorAll('a.destaque .destaque__meta')].map((m) => m.textContent!.trim());
    expect(metas).toEqual(['509 paróquias · SP', '126 paróquias · PR', '4 paróquias · PR']);
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

  // ── Teclado no autocomplete (etapa 6) ───────────────────────────────────────
  describe('navegação por teclado', () => {
    const tecla = (key: string) => {
      const ev = new KeyboardEvent('keydown', { key, cancelable: true });
      campo().dispatchEvent(ev);
      fixture.detectChanges();
      return ev;
    };
    const opcoes = () => [...raiz.querySelectorAll('.sugestoes [role="option"]')] as HTMLElement[];
    const ativas = () => opcoes().filter((o) => o.getAttribute('aria-selected') === 'true');

    /** Abre o painel e garante que há mais de uma opção para navegar. */
    const abrirCom = (texto: string) => {
      digitar(texto);
      expect(opcoes().length).withContext(`"${texto}" deveria abrir o painel com 2+ opções`).toBeGreaterThan(1);
    };

    it('sem seta, nenhuma opção está ativa e o campo não aponta para nenhuma', () => {
      abrirCom('i');
      expect(ativas().length).toBe(0);
      expect(campo().getAttribute('aria-activedescendant')).toBeNull();
      expect(opcoes().every((o) => o.getAttribute('aria-selected') === 'false')).toBeTrue();
    });

    it('↓ ativa a primeira opção: aria-selected, destaque e aria-activedescendant', () => {
      abrirCom('i');
      const ev = tecla('ArrowDown');
      expect(ev.defaultPrevented).withContext('a seta não pode mover o cursor do texto').toBeTrue();
      expect(ativas()).toEqual([opcoes()[0]]);
      expect(opcoes()[0].classList.contains('sugestoes__opcao--ativa')).toBeTrue();
      expect(campo().getAttribute('aria-activedescendant')).toBe(opcoes()[0].id);
    });

    it('↓ dá a volta da última para a primeira; ↑ sem opção ativa vai à última', () => {
      abrirCom('i');
      const n = opcoes().length;
      tecla('ArrowUp');
      expect(ativas()).toEqual([opcoes()[n - 1]]);
      tecla('ArrowDown');
      expect(ativas()).toEqual([opcoes()[0]]);
    });

    it('Enter vai para a opção ativa, não para a primeira', () => {
      abrirCom('i');
      tecla('ArrowDown');
      tecla('ArrowDown');
      const destino = opcoes()[1].getAttribute('href')!.split('/').filter(Boolean);
      tecla('Enter');
      expect(router.navigate).toHaveBeenCalledOnceWith(['/' + destino[0], ...destino.slice(1)]);
    });

    it('Esc fecha o painel, mantém o texto e zera a opção ativa', () => {
      abrirCom('i');
      tecla('ArrowDown');
      const ev = tecla('Escape');
      expect(ev.defaultPrevented).toBeTrue();
      expect(raiz.querySelector('.sugestoes')).toBeNull();
      expect(campo().value).toBe('i');
      expect(campo().getAttribute('aria-activedescendant')).toBeNull();
    });

    it('com o painel fechado, a seta reabre sem ativar nada ainda', () => {
      abrirCom('i');
      tecla('Escape');
      tecla('ArrowDown');
      expect(opcoes().length).toBeGreaterThan(1);
      expect(ativas().length).toBe(0);
    });

    it('digitar de novo descarta a opção ativa', () => {
      abrirCom('i');
      tecla('ArrowDown');
      digitar('it');
      expect(ativas().length).toBe(0);
    });

    it('o campo se declara combobox com lista', () => {
      expect(campo().getAttribute('role')).toBe('combobox');
      expect(campo().getAttribute('aria-autocomplete')).toBe('list');
      expect(campo().getAttribute('aria-controls')).toBe('sugestoes-busca');
    });
  });

  it('Enter continua levando ao primeiro resultado', () => {
    digitar('sao paulo');
    campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(router.navigate).toHaveBeenCalledOnceWith(['/missas', 'sp', 'sao-paulo']);
  });
});
