import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

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
