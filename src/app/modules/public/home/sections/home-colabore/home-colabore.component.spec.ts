import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomeColaboreComponent } from './home-colabore.component';

describe('HomeColaboreComponent', () => {
  let fixture: ComponentFixture<HomeColaboreComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HomeColaboreComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(HomeColaboreComponent);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('mostra a mensagem institucional colaborativa', () => {
    expect(el.querySelector('h2')?.textContent).toContain('O Busca Missa é feito por todos nós.');
    expect(el.textContent).toContain('Sua colaboração faz a diferença!');
  });

  it('tem um único botão "Cadastrar ou atualizar igreja" que leva ao fluxo atual (/nova)', () => {
    const links = el.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toContain('Cadastrar ou atualizar igreja');
    expect(links[0].getAttribute('href')).toBe('/nova');
  });

  it('esconde a ilustração decorativa de leitores de tela', () => {
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
