import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PageHeroComponent } from './page-hero.component';

/**
 * Contrato da variante `compacto` (criada para `/cidades`).
 *
 * O hero é compartilhado com `/estados`, `/dias` e `/missas/:uf`. Todas as regras da
 * variante vivem sob `.ph-hero--compacto` no SCSS — então "os outros hubs não mudam"
 * se reduz a: sem pedir a variante, a classe NÃO aparece. É isso que este spec fixa.
 */
@Component({
  standalone: true,
  imports: [PageHeroComponent],
  template: `
    <app-page-hero id="padrao" titulo="Missas por estado" />
    <app-page-hero id="compacto" titulo="Encontre a missa" variante="compacto" />
  `,
})
class HostComponent {}

describe('PageHeroComponent — variante compacta', () => {
  let raiz: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    raiz = fixture.nativeElement;
  });

  const hero = (id: string) => raiz.querySelector(`#${id} .ph-hero`) as HTMLElement;

  it('sem `variante`, o hero não recebe a classe da variante', () => {
    expect(hero('padrao').className.trim()).toBe('ph-hero');
  });

  it('`variante="compacto"` acrescenta só a classe modificadora', () => {
    expect(hero('compacto').classList.contains('ph-hero')).toBeTrue();
    expect(hero('compacto').classList.contains('ph-hero--compacto')).toBeTrue();
  });

  it('a variante não altera a estrutura: um <h1> em cada hero', () => {
    expect(raiz.querySelectorAll('#padrao h1').length).toBe(1);
    expect(raiz.querySelectorAll('#compacto h1').length).toBe(1);
  });
});
