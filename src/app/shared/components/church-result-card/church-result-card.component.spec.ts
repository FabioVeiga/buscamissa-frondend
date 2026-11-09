import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ChurchResultCardComponent } from './church-result-card.component';
import { FavoritesService } from '../../../core/services/favorites.service';
import { MetricasService } from '../../../core/services/metricas.service';
import { calcularProximaMissaCard } from '../../utils/proxima-missa-card.utils';

describe('ChurchResultCardComponent', () => {
  // 09/11/2026 é uma segunda-feira.
  const agora = new Date(2026, 10, 9, 18, 0);
  const semanal = (diaSemana: number, horario: string) => ({ diaSemana, horario, tipoRecorrencia: 0 });
  const diaFixo = (diaDoMes: number, horario: string, diasSemanaExcecao?: number) =>
    ({ diaSemana: 0, horario, tipoRecorrencia: 2, diaDoMes, diasSemanaExcecao });

  let fixture: ComponentFixture<ChurchResultCardComponent>;

  function montar(missas: any[]): HTMLElement {
    TestBed.configureTestingModule({
      imports: [ChurchResultCardComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: { isFavorita: () => false, alternar: () => false } },
        { provide: MetricasService, useValue: jasmine.createSpyObj('MetricasService', ['registrarFavorito']) },
      ],
    });
    fixture = TestBed.createComponent(ChurchResultCardComponent);
    fixture.componentRef.setInput('igreja', { id: 1, nome: 'Matriz', slug: 'matriz', missas, endereco: { uf: 'SP', cidadeSlug: 'sp' } });
    fixture.componentRef.setInput('proxima', calcularProximaMissaCard(missas, null, agora));
    fixture.componentRef.setInput('agora', agora);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const texto = (el: HTMLElement) => el.textContent ?? '';
  const botao = (el: HTMLElement) => el.querySelector('.city-card__btn--primary')?.textContent?.trim();

  it('sem horários cadastrados', () => {
    const el = montar([]);

    expect(texto(el)).toContain('Horários não informados');
    expect(botao(el)).toBe('Ver paróquia');
    expect(el.querySelector('app-confidence-badge')).toBeNull();
    expect(el.querySelector('.city-card__hora')).toBeNull();
  });

  it('com horários, sem ocorrência futura', () => {
    const el = montar([diaFixo(13, '19:00:00', 127)]);

    expect(texto(el)).toContain('Não há próxima missa futura informada');
    expect(botao(el)).toBe('Ver horários');
    expect(el.querySelector('app-confidence-badge')).toBeNull();
    expect(el.querySelector('.city-card__hora')).toBeNull();
  });

  it('dia fixo não aparece como domingo', () => {
    const el = montar([diaFixo(13, '08:00:00')]);

    expect(el.querySelector('.city-card__dia')?.textContent).toContain('Sexta');
    expect(texto(el)).not.toContain('Domingo');
    expect(el.querySelector('.city-card__dia-missa')).toBeNull();
  });

  it('a linha de dias só lista missas semanais', () => {
    const el = montar([semanal(0, '08:00:00'), semanal(5, '08:00:00'), diaFixo(13, '08:00:00')]);

    expect(el.querySelector('.city-card__dia-missa')?.textContent).toContain('Domingo, Sexta');
  });

  it('a linha de dias some quando repetiria o único dia mostrado', () => {
    const el = montar([semanal(1, '19:00:00')]);

    expect(el.querySelector('.city-card__dia')?.textContent).toContain('Hoje · Segunda');
    expect(el.querySelector('.city-card__dia-missa')).toBeNull();
  });
});
