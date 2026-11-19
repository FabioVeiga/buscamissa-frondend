import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { HomeMissasMapaComponent } from './home-missas-mapa.component';

/**
 * Cobre o rótulo de ORIGEM das distâncias. Sem geolocalização a API mede tudo a
 * partir do centro de São Paulo (fallback do ProximasMissasService), então a seção
 * precisa dizer isso — e o rótulo não pode existir no prerender, onde `origem` é
 * null, senão "São Paulo" entra no HTML indexado da home.
 */
describe('HomeMissasMapaComponent — rótulo de origem', () => {
  let fixture: ComponentFixture<HomeMissasMapaComponent>;
  let c: HomeMissasMapaComponent;

  const texto = () => fixture.nativeElement.querySelector('.missas-chip')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeMissasMapaComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeMissasMapaComponent);
    c = fixture.componentInstance;
    c.titulo = 'Missas acontecendo agora';
    c.cards = [];
    c.todasAsCards = [];
  });

  it('não renderiza rótulo nenhum quando origem é null (prerender)', () => {
    fixture.detectChanges();

    expect(texto()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('São Paulo');
  });

  it('diz que São Paulo é referência quando não há geolocalização', () => {
    c.origem = 'referencia';
    fixture.detectChanges();

    expect(texto()).toContain('São Paulo');
    expect(texto()).toContain('referência');
  });

  it('mostra a cidade do usuário quando há geolocalização', () => {
    c.origem = 'usuario';
    c.cidadeNome = 'Recife';
    c.cidadeUf = 'pe';
    fixture.detectChanges();

    expect(texto()).toBe('Recife/PE');
  });

  it('degrada para "Perto de você" quando o reverse geocode não devolveu cidade', () => {
    c.origem = 'usuario';
    fixture.detectChanges();

    expect(texto()).toBe('Perto de você');
  });

  it('emite o pedido de localização no clique do rótulo de referência', () => {
    c.origem = 'referencia';
    fixture.detectChanges();
    const spy = jasmine.createSpy('pedirLocalizacao');
    c.pedirLocalizacao.subscribe(spy);

    fixture.nativeElement.querySelector('.missas-origem__btn--sec').click();

    expect(spy).toHaveBeenCalled();
  });

  it('emite alterarCidade no clique de "Alterar cidade", com ou sem geolocalização', () => {
    const spy = jasmine.createSpy('alterarCidade');
    c.alterarCidade.subscribe(spy);
    for (const origem of ['usuario', 'referencia'] as const) {
      c.origem = origem;
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.missas-origem__btn').click();
    }

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

/**
 * Estado vazio da seção. A janela dela é de 2 horas; o atalho NUNCA pode levar à
 * `/missa-agora` (mesma janela, mesmo vazio). Com cidade confiável vai à página da
 * cidade (sem `?dia=`, que poderia cair em outro vazio); sem ela, oferece buscar outra cidade.
 */
describe('HomeMissasMapaComponent — estado vazio', () => {
  let fixture: ComponentFixture<HomeMissasMapaComponent>;
  let c: HomeMissasMapaComponent;
  let router: Router;

  @Component({ standalone: true, template: '' })
  class DestinoStub {}

  const el = (): HTMLElement => fixture.nativeElement;
  const texto = () => el().querySelector('.proximas-vazia__texto')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const acao = () => el().querySelector('.proximas-vazia__link') as HTMLElement | null;
  const href = () => acao()?.getAttribute('href') ?? null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeMissasMapaComponent],
      providers: [
        provideRouter([
          { path: 'missas/:uf/:cidade', component: DestinoStub },
          { path: 'missa-agora', component: DestinoStub },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HomeMissasMapaComponent);
    c = fixture.componentInstance;
    c.titulo = 'Missas acontecendo agora';
    c.cards = [];
    c.todasAsCards = [];
    c.isLoading = false;
  });

  const comCidade = (nome = 'Curitiba', uf = 'pr', slug = 'curitiba') => {
    c.origem = 'usuario';
    c.cidadeNome = nome;
    c.cidadeUf = uf;
    c.cidadeSlug = slug;
  };

  it('GPS com cidade confiável: leva à página da cidade', () => {
    comCidade();
    fixture.detectChanges();

    expect(texto()).toBe('Não encontramos missas próximas. Veja os horários de missa em Curitiba.');
    expect(acao()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ver horários de missa em Curitiba →');
    expect(href()).toBe('/missas/pr/curitiba');
  });

  it('usa o slug do backend como veio, sem derivá-lo do nome (cidade pequena com apóstrofo/distrito)', () => {
    comCidade("Pau d'Alho", 'pe', 'sao-joao-do-pau-d-alho');
    fixture.detectChanges();

    expect(href()).toBe('/missas/pe/sao-joao-do-pau-d-alho');
  });

  it('o link não leva filtro de dia (uma cidade sem missa semanal hoje cairia em outro vazio)', () => {
    comCidade();
    fixture.detectChanges();

    expect(href()).not.toContain('?');
    expect(href()).not.toContain('dia=');
  });

  it('GPS sem cidade identificada: oferece buscar em outra cidade, sem link', () => {
    c.origem = 'usuario';
    fixture.detectChanges();

    expect(texto()).toBe('Não encontramos missas próximas.');
    expect(acao()?.tagName).toBe('BUTTON');
    expect(acao()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Buscar em outra cidade →');
    expect(el().querySelector('.proximas-vazia a')).toBeNull();
  });

  it('cidade com nome mas sem slug: não gera link (evitaria 404), oferece outra cidade', () => {
    comCidade('Itapejara d\'Oeste', 'pr', '');
    fixture.detectChanges();

    expect(el().querySelector('.proximas-vazia a')).toBeNull();
    expect(acao()?.textContent).toContain('Buscar em outra cidade');
  });

  it('sem GPS e sem CEP (referência São Paulo): oferece outra cidade', () => {
    c.origem = 'referencia';
    fixture.detectChanges();

    expect(acao()?.textContent).toContain('Buscar em outra cidade');
    expect(el().querySelector('.proximas-vazia a')).toBeNull();
  });

  it('cidade do GPS anterior não vale depois de "Alterar" (origem volta a referência)', () => {
    comCidade();
    c.origem = 'referencia';
    fixture.detectChanges();

    expect(el().querySelector('.proximas-vazia a')).toBeNull();
    expect(texto()).toBe('Não encontramos missas próximas.');
  });

  it('o botão "Buscar em outra cidade" emite alterarCidade', () => {
    c.origem = 'usuario';
    fixture.detectChanges();
    const spy = jasmine.createSpy('alterarCidade');
    c.alterarCidade.subscribe(spy);

    acao()!.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('nenhum cenário do vazio aponta para /missa-agora (mesma janela de 2 horas)', () => {
    const cenarios: Array<() => void> = [
      () => comCidade(),
      () => { c.origem = 'usuario'; },
      () => { c.origem = 'referencia'; },
      () => comCidade('X', 'sp', ''),
    ];
    for (const montar of cenarios) {
      fixture = TestBed.createComponent(HomeMissasMapaComponent);
      c = fixture.componentInstance;
      c.cards = []; c.todasAsCards = []; c.isLoading = false;
      montar();
      fixture.detectChanges();
      expect(el().querySelector('.proximas-vazia')?.innerHTML).not.toContain('missa-agora');
    }
  });

  it('com filtro ativo (há missas, nenhuma passa no filtro) mantém o texto do filtro e o atalho', () => {
    comCidade();
    c.todasAsCards = [{ churchId: 1 } as any];
    fixture.detectChanges();

    expect(texto()).toBe('Nenhuma missa encontrada para este filtro.');
    expect(href()).toBe('/missas/pr/curitiba');
  });

  it('não mostra o estado vazio enquanto carrega nem quando há cards', () => {
    comCidade();
    c.isLoading = true;
    fixture.detectChanges();
    expect(el().querySelector('.proximas-vazia')).toBeNull();

    c.isLoading = false;
    c.cards = [{ churchId: 1, mass: { horario: '19:00' } } as any];
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture = TestBed.createComponent(HomeMissasMapaComponent);
    c = fixture.componentInstance;
    comCidade();
    c.cards = [{ churchId: 1, mass: { horario: '19:00' } } as any];
    c.todasAsCards = c.cards;
    fixture.detectChanges();
    expect(el().querySelector('.proximas-vazia')).toBeNull();
  });

  it('o clique no link navega para a página da cidade (e não para /missa-agora)', async () => {
    comCidade();
    fixture.detectChanges();

    acao()!.click();
    await fixture.whenStable();

    expect(router.url).toBe('/missas/pr/curitiba');
  });
});
