import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeCidadesComponent } from './home-cidades.component';

/**
 * O slot do card "Sua cidade" tem altura reservada para o card não empurrar os chips
 * quando a geolocalização resolve. Só que, quando o pedido FALHA, o card nunca chega e
 * a reserva vira um buraco de 56px entre o título e os chips — visível em produção.
 *
 * A reserva só pode cair depois da falha: enquanto o pedido está pendente ela tem de
 * continuar de pé, senão o CLS volta.
 */
describe('HomeCidadesComponent — slot do card "Sua cidade"', () => {
  let fixture: ComponentFixture<HomeCidadesComponent>;
  let c: HomeCidadesComponent;

  const colapsado = () =>
    fixture.nativeElement
      .querySelector('.cidades-chips__geo-wrap')
      .classList.contains('cidades-chips__geo-wrap--vazio');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeCidadesComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeCidadesComponent);
    c = fixture.componentInstance;
    c.cidades = [{ nome: 'São Paulo', uf: 'SP', slug: 'sao-paulo' }];
  });

  it('mantém a reserva enquanto a geolocalização está pendente', () => {
    fixture.detectChanges();

    expect(colapsado()).toBeFalse();
  });

  it('mantém a reserva quando a geolocalização resolveu', () => {
    c.geoEncontrada = true;
    c.cidadeDetectada = { nome: 'São Paulo', uf: 'SP', slug: 'sao-paulo' };
    fixture.detectChanges();

    expect(colapsado()).toBeFalse();
  });

  it('colapsa o slot depois que a geolocalização falhou', () => {
    c.geoFalhou = true;
    fixture.detectChanges();

    expect(colapsado()).toBeTrue();
  });

  it('mostra título, UF de cada cidade e o acesso a todas as cidades', () => {
    c.cidades = [
      { nome: 'São Paulo', uf: 'SP', slug: 'sao-paulo' },
      { nome: 'Curitiba', uf: 'PR', slug: 'curitiba' },
    ];
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('h2')?.textContent).toContain('Encontre missas por cidade');
    const cards = Array.from(el.querySelectorAll('.cidade-card:not(.cidade-card--todas)'));
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(['/missas/sp/sao-paulo', '/missas/pr/curitiba']);
    expect(cards[1].textContent).toContain('PR');
    expect(el.querySelector('.cidade-card--todas')?.getAttribute('href')).toBe('/cidades');
  });
});
