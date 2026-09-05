import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MassTimeCardComponent } from './mass-time-card.component';
import { MassCardData } from '../../models/mass-card.model';

/**
 * O separador entre bairro e distância era um `::after` incondicional do bairro. Desde
 * que a distância deixou de aparecer sem geolocalização, o card mostrava "Pinheiros ·"
 * com o ponto pendurado — visível em produção.
 */
describe('MassTimeCardComponent — separador entre bairro e distância', () => {
  let fixture: ComponentFixture<MassTimeCardComponent>;
  let c: MassTimeCardComponent;

  const dados = (distanceMeters?: number): MassCardData => ({
    churchId: 1,
    churchName: 'Paróquia Teste',
    slug: 'paroquia-teste',
    uf: 'sp',
    cidadeSlug: 'sao-paulo',
    bairro: 'Pinheiros',
    localidade: '',
    mass: { id: 1, diaSemana: 0, horario: '15:00:00' } as any,
    distanceMeters,
  });

  const texto = () =>
    fixture.nativeElement
      .querySelector('.mass-time-card__location')
      .textContent.replace(/\s+/g, ' ')
      .trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MassTimeCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MassTimeCardComponent);
    c = fixture.componentInstance;
  });

  it('mostra só o bairro quando não há distância', () => {
    c.data = dados(undefined);
    fixture.detectChanges();

    expect(texto()).toBe('Pinheiros');
    expect(fixture.nativeElement.querySelector('.mass-time-card__separador')).toBeNull();
  });

  it('mostra "Bairro · distância" quando há distância', () => {
    c.data = dados(4500);
    fixture.detectChanges();

    const el = fixture.nativeElement;
    // Sem espaço entre os nós: o respiro vem do `gap` do flex de `&__location`.
    expect(texto()).toBe('Pinheiros· 4,5 km');
    expect(el.querySelector('.mass-time-card__separador').textContent.trim()).toBe('·');
    expect(el.querySelector('.distance-chip').textContent).toContain('4,5 km');
  });
});
