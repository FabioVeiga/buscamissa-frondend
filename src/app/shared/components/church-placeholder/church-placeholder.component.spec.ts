import { TestBed } from '@angular/core/testing';

import { ChurchPlaceholderComponent } from './church-placeholder.component';
import { ChurchPlaceholderSpriteComponent, SPRITE_PLACEHOLDER_IGREJA } from './church-placeholder-sprite.component';

/** Marcação da arte sem atributos do Angular (`_ngcontent-*`), para comparar. */
const arte = (el: Element) =>
  Array.from(el.children)
    .map((c) => c.outerHTML.replace(/\s?_ng[\w-]+="[^"]*"/g, ''))
    .join('');

describe('ChurchPlaceholderComponent — sprite (A2)', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ChurchPlaceholderComponent, ChurchPlaceholderSpriteComponent] }));

  it('sem spriteId: arte inline, como antes', () => {
    const f = TestBed.createComponent(ChurchPlaceholderComponent);
    f.detectChanges();
    const svg = f.nativeElement.querySelector('svg.church-ph__art') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('use')).toBeNull();
    expect(svg.querySelectorAll('rect, ellipse, polygon, path, circle').length).toBeGreaterThan(5);
  });

  it('com spriteId: só um <use> para o símbolo, sem a arte repetida', () => {
    const f = TestBed.createComponent(ChurchPlaceholderComponent);
    f.componentRef.setInput('spriteId', SPRITE_PLACEHOLDER_IGREJA);
    f.detectChanges();
    const svg = f.nativeElement.querySelector('svg.church-ph__art') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 240 200');
    expect(svg.querySelector('use')?.getAttribute('href')).toBe(`#${SPRITE_PLACEHOLDER_IGREJA}`);
    expect(svg.querySelectorAll('rect, ellipse, polygon, path, circle').length).toBe(0);
  });

  it('conteudo=false: host vazio (nem arte, nem rótulo); padrão true mantém as outras páginas', () => {
    const f = TestBed.createComponent(ChurchPlaceholderComponent);
    f.componentRef.setInput('conteudo', false);
    f.componentRef.setInput('showLabel', true);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.church-ph')).toBeNull();
    const padrao = TestBed.createComponent(ChurchPlaceholderComponent);
    padrao.detectChanges();
    expect((padrao.nativeElement as HTMLElement).querySelector('.church-ph svg')).not.toBeNull();
  });

  it('o <symbol> tem exatamente a mesma arte do placeholder inline', () => {
    const inline = TestBed.createComponent(ChurchPlaceholderComponent);
    inline.detectChanges();
    const sprite = TestBed.createComponent(ChurchPlaceholderSpriteComponent);
    sprite.detectChanges();

    const simbolo = sprite.nativeElement.querySelector('symbol') as SVGSymbolElement;
    expect(simbolo.id).toBe(SPRITE_PLACEHOLDER_IGREJA);
    expect(simbolo.getAttribute('viewBox')).toBe('0 0 240 200');
    expect(arte(simbolo)).toBe(arte(inline.nativeElement.querySelector('svg.church-ph__art')));
  });

  it('o sprite fica fora do fluxo e escondido de leitores de tela', () => {
    const f = TestBed.createComponent(ChurchPlaceholderSpriteComponent);
    f.detectChanges();
    document.body.appendChild(f.nativeElement);
    const svg = f.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const r = (f.nativeElement as HTMLElement).getBoundingClientRect();
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
    f.nativeElement.remove();
  });
});
