import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { EditarIgrejaComponent } from './editar-igreja.component';
import { AuthService } from '../../../../core/services/auth.service';
import { ResponsavelService } from '../../../../core/services/responsavel.service';
import { ChurchesService } from '../../../../core/services/churches.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { MetricasService } from '../../../../core/services/metricas.service';

// Qualquer método não previsto devolve um Observable vazio: o teste só quer a lista de missas.
const stub = (base: Record<string, unknown>) =>
  new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : () => of([])) });

const dados = (missas: unknown[]) => ({
  igrejaNome: 'Igreja Teste',
  contato: {},
  redesSociais: [],
  missas,
  sessoes: [],
  endereco: { cep: '01001000', logradouro: 'Rua A', localidade: 'São Paulo', uf: 'SP', numero: 1 },
  circunscricao: null,
  capelasComunidades: [],
  tipoIgreja: 'Paroquia',
});

describe('EditarIgrejaComponent — horários de missa', () => {
  const montar = (missas: unknown[]) => {
    TestBed.configureTestingModule({
      imports: [EditarIgrejaComponent],
      providers: [
        { provide: AuthService, useValue: { estaLogado: true } },
        { provide: Router, useValue: { navigate: () => {}, createUrlTree: () => ({}), serializeUrl: () => '', events: of() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        { provide: ResponsavelService, useValue: stub({ obterDados: () => of(dados(missas)), obterMetricas: () => of(null) }) },
        { provide: ChurchesService, useValue: stub({}) },
        { provide: MetricasService, useValue: stub({ registrarVisualizacaoPagina: () => {} }) },
        { provide: LoggerService, useValue: { logError: () => {} } },
      ],
    });
    const f = TestBed.createComponent(EditarIgrejaComponent);
    f.detectChanges();
    f.detectChanges();
    return f;
  };

  const missas = [
    { diaSemana: 0, horario: '08:00', tipoRecorrencia: 0 },
    { diaSemana: 0, horario: '10:00', tipoRecorrencia: 0 },
    { diaSemana: 3, horario: '15:00', observacao: 'adoracao', tipoRecorrencia: 0 },
    { diaSemana: 5, horario: '19:00', tipoRecorrencia: 1, semanasDoMes: 1 },
    { diaSemana: 4, horario: '17:00', tipoRecorrencia: 3, data: '2026-12-25', nome: 'Natal', substituiMissasDoDia: true },
  ];

  const titulos = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.grupo-missas__titulo')).map((t) => t.textContent!.trim());
  const linhas = (el: HTMLElement) => el.querySelectorAll('.lista-missas .linha-missa').length;

  it('mostra só os horários da frequência escolhida', () => {
    const f = montar(missas);
    const el: HTMLElement = f.nativeElement;
    expect(titulos(el)).toEqual(['Semanais']);
    expect(linhas(el)).toBe(3);

    f.componentInstance.nova.freq = 'data';
    f.detectChanges();
    expect(titulos(el)).toEqual(['Datas especiais']);
    expect(linhas(el)).toBe(1);
    expect(el.querySelector('.lista-missas')!.textContent).toContain('25/12/2026');

    f.componentInstance.nova.freq = 'ocorrencia';
    f.detectChanges();
    expect(titulos(el)).toEqual(['Dia da semana no mês']);
    expect(linhas(el)).toBe(1);
  });

  it('avisa quando não há horário na frequência escolhida e mostra a contagem nos botões', () => {
    const f = montar(missas);
    const el: HTMLElement = f.nativeElement;
    f.componentInstance.nova.freq = 'diaFixo';
    f.detectChanges();
    expect(el.querySelector('.vazio-missas')!.textContent).toContain('Nenhum horário cadastrado aqui');
    const qtds = Array.from(el.querySelectorAll('.chip-freq__qtd')).map((q) => q.textContent!.trim());
    expect(qtds).toEqual(['3', '1', '1']); // semanal, ocorrência, data (dia fixo está vazio)
  });

  it('não recria as linhas a cada ciclo de detecção de mudanças', () => {
    const f = montar(missas);
    const el: HTMLElement = f.nativeElement;
    const antes = Array.from(el.querySelectorAll('.lista-missas .linha-missa'));
    f.detectChanges();
    f.detectChanges();
    const depois = Array.from(el.querySelectorAll('.lista-missas .linha-missa'));
    expect(depois.filter((n, i) => n !== antes[i]).length).toBe(0);
  });

  it('preserva as datas especiais no envio', () => {
    const f = montar(missas);
    const c = f.componentInstance;
    const especial = c.missas.controls.find((g) => g.value.diaSemana === c.DATA_ESPECIFICA)!;
    expect(especial.value.data).toBe('2026-12-25');
    expect(especial.value.nome).toBe('Natal');
    expect(especial.value.substituiMissasDoDia).toBeTrue();
  });

  it('adiciona e remove horários mantendo a lista organizada', () => {
    const f = montar(missas);
    const c = f.componentInstance;
    const el: HTMLElement = f.nativeElement;
    c.nova = { ...c.nova, freq: 'data', data: '2026-12-24', nome: 'Missa do Galo', horario: '22:00' };
    expect(c.podeAdicionarNova).toBeTrue();
    c.adicionarNova();
    f.detectChanges();
    // a frequência escolhida continua "data": lista só as datas especiais, a mais cedo primeiro
    expect(el.querySelectorAll('.lista-missas .linha-missa').length).toBe(2);
    const especiais = el.querySelectorAll('.linha-missa__descricao');
    expect(especiais[0].textContent).toContain('24/12/2026');

    c.removerMissa(c.gruposMissas[3].itens[0].ctrl);
    f.detectChanges();
    expect(el.querySelectorAll('.lista-missas .linha-missa').length).toBe(1);
    expect(c.missas.length).toBe(5);
  });
});
