import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { defer, of } from 'rxjs';

import { CityComponent } from './city.component';
import { ChurchesService } from '../../../../core/services/churches.service';
import { DIAS } from './city.constants';
import { diasDaIgreja, igrejaNoDiaDaSemana, intercalarComServidor, missaNoDiaDaSemana } from './city-filtro-dia';
import { TIPO_RECORRENCIA } from '../../../../shared/utils/recorrencia-missa';

/**
 * A7 — ?dia= na 1ª pintura. O CSS (html[data-dia] × data-dias) e o aplicarFiltros do
 * Angular têm de mostrar os MESMOS cards; senão a lista muda na hidratação.
 */
const semanal = (diaSemana: number, horario = '19:00:00') => ({ diaSemana, horario });
const IGREJAS = [
  { id: 1, nome: 'Matriz', missas: [semanal(0), semanal(6, '18:00:00')] },
  { id: 2, nome: 'Rosário', missas: [semanal(1), semanal(3)] },
  // Dia fixo do mês e ocorrência no mês têm diaSemana, mas não contam no filtro de dia da semana.
  { id: 3, nome: 'Santa Luzia', missas: [{ diaSemana: 6, horario: '08:00:00', tipoRecorrencia: TIPO_RECORRENCIA.DiaDoMes, diaDoMes: 13 }] },
  { id: 4, nome: 'São Judas', missas: [{ diaSemana: 5, horario: '19:00:00', tipoRecorrencia: TIPO_RECORRENCIA.OcorrenciaNoMes, semanasDoMes: 1 }, semanal(0, '07:00:00')] },
  { id: 5, nome: 'Capela', missas: [] },
  { id: 6, nome: 'Aparecida', missas: [semanal(6, '07:00:00'), semanal(2)] },
  { id: 7, nome: 'Bom Jesus', missas: [semanal(4)] },
].map((ig) => ({ ...ig, imagemUrl: null, endereco: { bairro: 'Centro', latitude: null, longitude: null } }));

describe('A7 — regra do filtro por dia (city-filtro-dia)', () => {
  it('só missa semanal conta: dia fixo do mês e ocorrência no mês ficam fora', () => {
    expect(missaNoDiaDaSemana(semanal(6), 6)).toBeTrue();
    expect(missaNoDiaDaSemana(IGREJAS[2].missas[0], 6)).toBeFalse();
    expect(missaNoDiaDaSemana(IGREJAS[3].missas[0], 5)).toBeFalse();
    expect(diasDaIgreja(IGREJAS[0])).toBe('0 6');
    expect(diasDaIgreja(IGREJAS[2])).toBe('');
    expect(diasDaIgreja(IGREJAS[3])).toBe('0');
    expect(diasDaIgreja(IGREJAS[4])).toBe('');
    expect(diasDaIgreja({})).toBe('');
  });

  it('data-dias e igrejaNoDiaDaSemana são a mesma regra', () => {
    for (const ig of IGREJAS) {
      for (let d = 0; d < 7; d++) {
        expect(diasDaIgreja(ig).split(' ').includes(String(d))).toBe(igrejaNoDiaDaSemana(ig, d));
      }
    }
  });

  it('intercalarComServidor: visíveis nas posições do servidor, ocultas nas demais', () => {
    const [a, b, c, d] = IGREJAS;
    // Servidor: a(0 6) b(1 3) c() d(0); dia 0 → posições 0 e 3. Cliente ordenou d antes de a.
    const r = intercalarComServidor([a, b, c, d], [d, a], ['0 6', '1 3', '', '0'], 0)!;
    expect(r.map((i) => i.igreja.id)).toEqual([4, 2, 3, 1]);
    expect(r.map((i) => i.oculta)).toEqual([false, true, true, false]);
    expect(r.map((i) => i.pos)).toEqual([0, -1, -1, 1]);
  });

  it('intercalarComServidor: DOM sem cards ou com contagem diferente → null (lista normal)', () => {
    const [a, b] = IGREJAS;
    expect(intercalarComServidor([a, b], [a], [], 0)).toBeNull();
    expect(intercalarComServidor([a, b], [a], ['0 6'], 0)).toBeNull();
    expect(intercalarComServidor([a, b], [a, b], ['0 6', '1 3'], 0)).toBeNull();
  });
});

describe('A7 — CSS × igrejasFiltradas na página de cidade', () => {
  const raiz = document.documentElement;
  const fixtures: ComponentFixture<CityComponent>[] = [];

  let qp: Record<string, unknown> = {};
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CityComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ uf: 'mg', cidade: 'alfenas' }),
            queryParams: defer(() => of(qp)),
            snapshot: { params: { uf: 'mg', cidade: 'alfenas' }, queryParams: {}, data: {} },
          },
        },
        { provide: ChurchesService, useValue: { getByCidade: () => of({ data: { cidade: 'Alfenas', igrejas: IGREJAS } }) } },
      ],
    });
  });

  /** Vários componentes no mesmo módulo: o "servidor" (sem query) e o "cliente" (com ?dia=). */
  const montar = (queryParams: Record<string, unknown>) => {
    qp = queryParams;
    const f = TestBed.createComponent(CityComponent);
    document.body.appendChild(f.nativeElement);
    fixtures.push(f);
    return f;
  };

  const visivel = (el: Element) => getComputedStyle(el).display !== 'none';
  const nomesVisiveis = (f: ComponentFixture<CityComponent>) =>
    Array.from(f.nativeElement.querySelectorAll('.city-lista > app-city-card') as NodeListOf<Element>)
      .filter(visivel)
      .map((el) => el.querySelector('.city-card__nome')!.textContent!.trim());
  const limpar = (f: ComponentFixture<CityComponent>) => f.nativeElement.querySelectorAll('.city-filtros__limpar');

  afterEach(() => {
    delete raiz.dataset['dia'];
    fixtures.splice(0).forEach((f) => { f.destroy(); f.nativeElement.remove(); });
  });

  for (const dia of DIAS) {
    it(`${dia.slug}: o HTML sem filtro + html[data-dia="${dia.idx}"] mostra exatamente igrejasFiltradas`, () => {
      // "Servidor": página renderizada sem query, como o prerender.
      const servidor = montar({});
      servidor.detectChanges();
      TestBed.inject(ApplicationRef).tick(); // roda o afterNextRender do "servidor" antes de marcar o <html>
      expect(nomesVisiveis(servidor).length).toBe(IGREJAS.length);

      // O script inline marca o <html>; o CSS filtra o HTML do servidor.
      raiz.dataset['dia'] = String(dia.idx);
      const peloCss = nomesVisiveis(servidor);
      const posServidor = Array.from(servidor.nativeElement.querySelectorAll('.city-lista > app-city-card') as NodeListOf<Element>)
        .map((el, i) => (visivel(el) ? i : -1)).filter((i) => i >= 0);
      const esperados = IGREJAS.filter((ig) => igrejaNoDiaDaSemana(ig, dia.idx));
      const plural = esperados.length !== 1 ? 's' : '';
      const esperado = `${esperados.length} de ${IGREJAS.length} igreja${plural} encontrada${plural}`;

      // Contador da 1ª pintura = texto que o Angular escreve depois.
      const sub = servidor.nativeElement.querySelector('.city-header__sub-dia') as HTMLElement;
      expect(visivel(sub)).toBeTrue();
      expect(visivel(servidor.nativeElement.querySelector('.city-header__sub-total'))).toBeFalse();
      expect(getComputedStyle(sub, '::before').content).toBe(`"${esperado}"`);

      // Dia sem igreja: o aviso de vazio já aparece e o convite some, como no Angular.
      const vazio = servidor.nativeElement.querySelector('.city-vazio--filtro') as HTMLElement;
      expect(visivel(vazio)).toBe(esperados.length === 0);
      const convite = servidor.nativeElement.querySelector('app-convite-anuncie') as HTMLElement;
      expect(visivel(convite)).toBe(esperados.length > 0);

      // "Cliente": o mesmo componente com ?dia= — o que o Angular filtra.
      const cliente = montar({ dia: dia.slug });
      document.body.appendChild(servidor.nativeElement); // o TestBed tira a raiz anterior do documento
      raiz.dataset['dia'] = String(dia.idx);
      cliente.componentInstance.ngOnInit();
      const filtradas = cliente.componentInstance.igrejasFiltradas.map((ig: any) => ig.nome);
      expect([...peloCss].sort()).toEqual([...filtradas].sort());

      // Hidratação: o cliente lê o DOM do "servidor" e casa posição a posição, com as
      // visíveis nos mesmos lugares em que o CSS as mostrava.
      const itens = cliente.componentInstance.itensLista;
      expect(itens.length).toBe(IGREJAS.length);
      const posCliente = itens.map((it, i) => (it.oculta ? -1 : i)).filter((i) => i >= 0);
      expect(posCliente).toEqual(posServidor);
      expect(itens.filter((it) => !it.oculta).map((it) => it.igreja.nome)).toEqual(filtradas);

      // Depois da hidratação o atributo sai e o Angular sozinho mostra o mesmo.
      cliente.detectChanges();
      expect(raiz.dataset['dia']).toBeUndefined();
      expect(nomesVisiveis(cliente)).toEqual(filtradas);
      expect(cliente.nativeElement.querySelector('.city-header__sub-total').textContent.replace(/\s+/g, ' ').trim())
        .toBe(esperado);
    });
  }

  it('"Limpar" é um nó único: oculto (fora do foco/leitor) sem filtro, visível com html[data-dia] e com filtro', () => {
    const f = montar({});
    f.detectChanges();
    expect(limpar(f).length).toBe(1);
    const botao = limpar(f)[0] as HTMLElement;
    expect(visivel(botao)).toBeFalse(); // display:none → fora da árvore de acessibilidade e do Tab

    raiz.dataset['dia'] = '6';
    expect(visivel(botao)).withContext('1ª pintura com ?dia=').toBeTrue();
    delete raiz.dataset['dia'];

    f.componentInstance.setDia(6);
    f.detectChanges();
    expect(limpar(f).length).toBe(1);
    expect(limpar(f)[0]).withContext('mesmo nó').toBe(botao);
    expect(visivel(botao)).toBeTrue();

    f.componentInstance.limparFiltros();
    f.detectChanges();
    expect(limpar(f)[0]).toBe(botao);
    expect(visivel(botao)).toBeFalse();
  });

  it('convite é nó único: some por classe num dia sem igreja e volta ao limpar', () => {
    const f = montar({});
    f.detectChanges();
    const convite = f.nativeElement.querySelector('app-convite-anuncie') as HTMLElement;
    expect(visivel(convite)).toBeTrue();
    f.componentInstance.setDia(1);
    f.componentInstance.setDia(1); // alterna: liga e desliga segunda (Rosário tem)
    f.componentInstance.setDia(5); // sexta: nenhuma semanal na base de teste
    f.detectChanges();
    expect(f.componentInstance.igrejasFiltradas.length).toBe(0);
    expect(f.nativeElement.querySelector('app-convite-anuncie')).withContext('mesmo nó').toBe(convite);
    expect(visivel(convite)).toBeFalse();
    f.componentInstance.limparFiltros();
    f.detectChanges();
    expect(visivel(convite)).toBeTrue();
  });

  it('host vazio do anúncio não ocupa o gap da lista (sem salto de ±10 px na hidratação)', () => {
    const f = montar({});
    f.detectChanges();
    const anuncio = f.nativeElement.querySelector('.city-lista > app-anuncio') as HTMLElement;
    expect(anuncio).withContext('anúncio após o 3º card').not.toBeNull();
    expect(anuncio.childElementCount).toBe(0);
    expect(visivel(anuncio)).toBeFalse();
  });

  it('?dia= inválido, ausente ou repetido: sem filtro', () => {
    for (const qp of [{}, { dia: 'feriado' }, { dia: ['sabado', 'domingo'] }]) {
      const f = montar(qp);
      f.componentInstance.ngOnInit();
      expect(f.componentInstance.diaAtivo).withContext(JSON.stringify(qp)).toBeNull();
      expect(f.componentInstance.igrejasFiltradas.length).toBe(IGREJAS.length);
    }
  });

  it('filtro no SPA depois da hidratação: só o Angular manda (sem data-dia no <html>)', () => {
    raiz.dataset['dia'] = '6';
    const f = montar({ dia: 'sabado' });
    f.detectChanges();
    expect(raiz.dataset['dia']).toBeUndefined();
    f.componentInstance.setDia(1);
    f.detectChanges();
    expect(nomesVisiveis(f)).toEqual(f.componentInstance.igrejasFiltradas.map((ig: any) => ig.nome));
    expect(nomesVisiveis(f)).toEqual(['Rosário']);
  });
});
