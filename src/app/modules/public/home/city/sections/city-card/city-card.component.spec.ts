import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';

import { CityCardComponent } from './city-card.component';

/**
 * Trava o contrato entre prerender e browser no card da cidade.
 *
 * O problema que originou estes testes: `diaLabelRelativo()` e o contador rodavam
 * também no prerender, contra o relógio do BUILD. O arquivo estático fica no ar de
 * 1 a 4 dias (não há rebuild agendado), então "Amanhã" e "Começa em 2h30" nasciam
 * com prazo de validade. Chegaram ao índice do Google: em 2026-09-09 havia snippets
 * ativos de /missas/df/sao-sebastiao e /missas/sp/votorantim exibindo
 * "19h30 Hoje Começa em 2h30".
 *
 * Dois contratos distintos são defendidos aqui:
 *
 *  1. O rótulo do dia troca de TEXTO entre server e browser, mas o ELEMENTO
 *     `.city-card__dia` é o mesmo nos dois. Hidratar reescreve um nó de texto, não
 *     reconstrói o card — é o que mantém a hidratação sem mismatch.
 *  2. O contador é o único caso em que o elemento realmente não existe no server.
 *     É deliberado e medido: a coluna de horário ocupa ~39 px num card de ~345 px,
 *     então inserir o chip na hidratação não muda a altura do card.
 */
describe('CityCardComponent — estável no prerender, relativo no browser', () => {
  // quarta-feira, 07/01/2026, 10h00.
  const AGORA = new Date(2026, 0, 7, 10, 0, 0);
  const QUA = 3;

  const igreja = {
    id: 1,
    nome: 'Paróquia de Teste',
    slug: 'paroquia-de-teste',
    endereco: { bairro: 'Centro', uf: 'SP', cidadeSlug: 'santos' },
    missas: [{ diaSemana: QUA, horario: '12:00' }],
  };
  /** Missa hoje às 12h: daqui a 2h, portanto dentro da janela de urgência (3h). */
  const proximaMissa = { diaSemana: QUA, horario: '12:00' };

  async function montar(plataforma: 'server' | 'browser'): Promise<ComponentFixture<CityCardComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CityCardComponent],
      providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: plataforma }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CityCardComponent);
    fixture.componentInstance.igreja = igreja;
    fixture.componentInstance.proximaMissa = proximaMissa;
    fixture.componentInstance.cidadeNome = 'Santos';
    fixture.componentInstance.uf = 'sp';
    fixture.componentInstance.cidadeSlug = 'santos';
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(AGORA);
  });
  afterEach(() => jasmine.clock().uninstall());

  it('no prerender o dia sai como nome do dia, não "Hoje"', async () => {
    const fixture = await montar('server');
    const dia = fixture.nativeElement.querySelector('.city-card__dia');
    expect(dia).withContext('o elemento tem de existir no server').toBeTruthy();
    expect(dia.textContent.trim()).toBe('Quarta');
  });

  it('no browser o mesmo elemento vira "Hoje"', async () => {
    const fixture = await montar('browser');
    const dia = fixture.nativeElement.querySelector('.city-card__dia');
    expect(dia.textContent.trim()).toBe('Hoje');
  });

  it('o elemento .city-card__dia existe nos DOIS — só o texto muda', async () => {
    const noServer = await montar('server');
    const qtdServer = noServer.nativeElement.querySelectorAll('.city-card__dia').length;
    const textoServer = noServer.nativeElement.querySelector('.city-card__dia').textContent.trim();

    const noBrowser = await montar('browser');
    const qtdBrowser = noBrowser.nativeElement.querySelectorAll('.city-card__dia').length;
    const textoBrowser = noBrowser.nativeElement.querySelector('.city-card__dia').textContent.trim();

    expect(qtdServer).toBe(1);
    expect(qtdBrowser).toBe(qtdServer);
    expect(textoBrowser).not.toBe(textoServer);
  });

  it('a classe modificadora --hoje não é resolvida no build', async () => {
    const noServer = await montar('server');
    expect(noServer.nativeElement.querySelector('.city-card__dia--hoje')).toBeNull();

    const noBrowser = await montar('browser');
    expect(noBrowser.nativeElement.querySelector('.city-card__dia--hoje')).toBeTruthy();
  });

  it('o contador não é prerenderizado e aparece no browser', async () => {
    const noServer = await montar('server');
    expect(noServer.componentInstance.ehUrgente(proximaMissa)).toBeFalse();
    expect(noServer.nativeElement.querySelector('.city-card__countdown')).toBeNull();

    const noBrowser = await montar('browser');
    expect(noBrowser.componentInstance.ehUrgente(proximaMissa)).toBeTrue();
    expect(noBrowser.nativeElement.querySelector('.city-card__countdown')).toBeTruthy();
  });

  it('o horário em si é estável e continua no HTML do prerender', async () => {
    // O que sai do HTML é só o rótulo RELATIVO. Hora e nome do dia — a informação
    // que o Google precisa indexar — seguem no server.
    const fixture = await montar('server');
    expect(fixture.nativeElement.querySelector('.city-card__hora').textContent.trim()).toBe('12h00');
    expect(fixture.nativeElement.textContent).toContain('Quarta');
  });

  it('o rótulo do prerender não muda quando o relógio do build anda', async () => {
    const antes = (await montar('server')).nativeElement
      .querySelector('.city-card__dia')
      .textContent.trim();

    jasmine.clock().mockDate(new Date(2026, 0, 10, 23, 0, 0)); // 3 dias depois
    const depois = (await montar('server')).nativeElement
      .querySelector('.city-card__dia')
      .textContent.trim();

    expect(depois).toBe(antes);
  });
});
