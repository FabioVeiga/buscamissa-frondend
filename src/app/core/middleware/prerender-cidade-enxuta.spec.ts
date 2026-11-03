import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import {
  CAMPOS_ENDERECO_DA_CIDADE,
  CAMPOS_IGREJA_FORA_DA_CIDADE,
  CAMPOS_MISSA_FORA_DA_CIDADE,
  enxugarIgrejasCidade,
} from './prerender-cidade-enxuta';
import { CityComponent } from '../../modules/public/home/city/city.component';
import { ChurchesService } from '../services/churches.service';
import { chaveCidade } from './prerender-state-keys';

/**
 * Base fictícia no formato real do bulk /v2/seo/cidades (conferido no ng-state de
 * produção de /missas/sp/sao-paulo em 03/11/2026), cobrindo os casos que mudam o
 * render: com e sem foto, missa semanal, mensal (semanas do mês), dia do mês com
 * exceção, observação nula e preenchida, validação nula, selo em níveis diferentes,
 * coordenadas nulas, igreja sem missas (lista vazia), contato nulo e igreja com campos
 * AUSENTES (não nulos) já na origem.
 */
function baseFicticia(): any[] {
  const missa = (id: number, extra: Record<string, unknown>) => ({
    id,
    diaSemana: 0,
    horario: '19:00:00',
    observacao: null,
    tipoRecorrencia: 0,
    diaDoMes: null,
    diasSemanaExcecao: null,
    semanasDoMes: null,
    descricaoRecorrencia: 'Toda semana',
    fontePrincipal: 1,
    ultimaValidacao: '2026-10-01T12:00:00',
    statusConfianca: 2,
    scoreConfianca: 80,
    nivelConfianca: 'Alto',
    fonteLabel: 'Paróquia',
    descricaoConfianca: 'Confirmado pela paróquia em 01/10/2026',
    ...extra,
  });
  const endereco = (bairro: string, lat: number | null, lng: number | null) => ({
    id: 1,
    cep: '01000-000',
    logradouro: 'Rua Fictícia',
    complemento: null,
    bairro,
    localidade: 'Cidade Fictícia',
    cidadeSlug: 'cidade-ficticia',
    uf: 'SP',
    latitude: lat,
    longitude: lng,
    estado: 'São Paulo',
    regiao: null,
    numero: '10',
    igrejaId: 1,
  });
  const igreja = (id: number, nome: string, extra: Record<string, unknown>) => ({
    id,
    nome,
    nomeUnico: `igreja-${id}`,
    slug: `igreja-${id}`,
    ativo: true,
    imagemUrl: `https://exemplo.test/igreja/${id}.jpg`,
    statusConfianca: 2,
    alteracao: '2026-10-20T10:00:00',
    paroco: 'Pe. Fictício',
    circunscricao: null,
    reportarProblema: null,
    sessoes: [],
    contato: { ddd: '11', telefone: '00000000', emailContato: 'contato@exemplo.test' },
    redesSociais: [{ id: 1, tipoRedeSocial: 1, nomeDoPerfil: 'perfil', url: 'https://exemplo.test/perfil' }],
    endereco: endereco('Centro', -23.55, -46.63),
    missas: [],
    ...extra,
  });

  return [
    igreja(1, 'Paróquia Alfa', {
      missas: [
        missa(11, { diaSemana: 0, horario: '07:00:00' }),
        missa(12, { diaSemana: 0, horario: '19:00:00', observacao: 'Missa com crianças' }),
        missa(13, { diaSemana: 3, horario: '12:00:00', ultimaValidacao: null, statusConfianca: 0 }),
      ],
    }),
    igreja(2, 'Capela Beta', {
      imagemUrl: '',
      contato: null,
      redesSociais: [],
      endereco: endereco('Vila Nova', null, null),
      missas: [
        // Mensal: 1ª e 3ª semana (bitmask) no sábado.
        missa(21, { diaSemana: 6, horario: '16:00:00', tipoRecorrencia: 1, semanasDoMes: 5, descricaoRecorrencia: '1º e 3º sábado' }),
        // Dia do mês com exceção no domingo.
        missa(22, { diaSemana: 1, horario: '08:30:00', tipoRecorrencia: 2, diaDoMes: 13, diasSemanaExcecao: 1, descricaoRecorrencia: 'Todo dia 13' }),
      ],
    }),
    igreja(3, 'Santuário Gama', {
      statusConfianca: 1,
      missas: [
        missa(31, { diaSemana: 5, horario: '18:30:00', fontePrincipal: 3, statusConfianca: 1 }),
        missa(32, { diaSemana: 2, horario: '06:45:00', observacao: 'Em latim' }),
      ],
    }),
    // Sem missas cadastradas (lista vazia).
    igreja(4, 'Paróquia Delta', { missas: [], paroco: null }),
    // Campos AUSENTES na origem (não nulos): sem contato, sem redes, sem foto, missa enxuta.
    (() => {
      const i: any = igreja(5, 'Igreja Épsilon', {
        missas: [{ id: 51, diaSemana: 4, horario: '20:00:00', tipoRecorrencia: 0, descricaoRecorrencia: 'Toda semana', fontePrincipal: 2, statusConfianca: 3 }],
      });
      delete i.contato;
      delete i.redesSociais;
      delete i.imagemUrl;
      delete i.paroco;
      return i;
    })(),
  ];
}

describe('enxugarIgrejasCidade', () => {
  it('remove exatamente os campos listados da igreja e da missa', () => {
    const [alfa] = enxugarIgrejasCidade(baseFicticia()) as any[];
    for (const campo of CAMPOS_IGREJA_FORA_DA_CIDADE) expect(campo in alfa).withContext(campo).toBeFalse();
    for (const m of alfa.missas) {
      for (const campo of CAMPOS_MISSA_FORA_DA_CIDADE) expect(campo in m).withContext(campo).toBeFalse();
    }
  });

  it('mantém os campos da grade, do selo, da imagem e do link', () => {
    const [alfa, beta] = enxugarIgrejasCidade(baseFicticia()) as any[];
    for (const campo of ['id', 'nome', 'nomeUnico', 'slug', 'ativo', 'imagemUrl', 'statusConfianca', 'endereco', 'missas']) {
      expect(campo in alfa).withContext(campo).toBeTrue();
    }
    const mensal = beta.missas[0];
    for (const campo of ['id', 'diaSemana', 'horario', 'tipoRecorrencia', 'semanasDoMes', 'descricaoRecorrencia', 'statusConfianca', 'ultimaValidacao', 'fontePrincipal']) {
      expect(campo in mensal).withContext(campo).toBeTrue();
    }
    expect(beta.missas[1].diaDoMes).toBe(13);
    expect(beta.missas[1].diasSemanaExcecao).toBe(1);
    expect(alfa.endereco.latitude).toBe(-23.55);
  });

  it('com semNulos (padrão) tira só as chaves null; arrays vazias e strings vazias ficam', () => {
    const [alfa, beta, , delta] = enxugarIgrejasCidade(baseFicticia()) as any[];
    expect('observacao' in alfa.missas[0]).toBeFalse();
    expect(alfa.missas[1].observacao).toBe('Missa com crianças');
    expect('ultimaValidacao' in alfa.missas[2]).toBeFalse();
    expect('complemento' in alfa.endereco).toBeFalse();
    expect('latitude' in beta.endereco).toBeFalse();
    expect(beta.imagemUrl).toBe('');
    expect(delta.missas).toEqual([]);
  });

  it('com semNulos: false mantém os null', () => {
    const [alfa, beta] = enxugarIgrejasCidade(baseFicticia(), { semNulos: false }) as any[];
    expect(alfa.missas[0].observacao).toBeNull();
    expect(beta.endereco.latitude).toBeNull();
  });

  it('endereço fica só com bairro, coordenadas, uf e cidadeSlug', () => {
    const [alfa, beta] = enxugarIgrejasCidade(baseFicticia()) as any[];
    expect(Object.keys(alfa.endereco).sort()).toEqual([...CAMPOS_ENDERECO_DA_CIDADE].sort());
    expect(alfa.endereco).toEqual({ bairro: 'Centro', latitude: -23.55, longitude: -46.63, uf: 'SP', cidadeSlug: 'cidade-ficticia' });
    // Coordenadas nulas somem com semNulos; o resto fica.
    expect(beta.endereco).toEqual({ bairro: 'Vila Nova', uf: 'SP', cidadeSlug: 'cidade-ficticia' });
  });

  it('endereço ausente ou sem algum campo permitido não ganha chaves', () => {
    const base = baseFicticia();
    delete base[0].endereco;
    delete base[1].endereco.bairro;
    const [alfa, beta] = enxugarIgrejasCidade(base) as any[];
    expect('endereco' in alfa).toBeFalse();
    expect('bairro' in beta.endereco).toBeFalse();
  });

  it('não altera a entrada (o bulk em memória é compartilhado entre rotas)', () => {
    const base = baseFicticia();
    const copia = JSON.parse(JSON.stringify(base));
    enxugarIgrejasCidade(base);
    expect(base).toEqual(copia);
  });

  it('só a rota de CIDADE é enxugada: detalhe, home e /missa-agora seguem com a resposta completa', () => {
    // O PrerenderCidadeInterceptor só age quando chaveCidade casa; o resto vai inteiro.
    expect(chaveCidade('v2/Igreja/cidade/sp/sao-paulo')).toBe('sp/sao-paulo');
    for (const url of [
      'v2/Igreja/paroquia/sp/sao-paulo/paroquia-x', // detalhe da paróquia
      'v2/Igreja/paroquia-x', // detalhe por nomeUnico
      'v2/Igreja/proximas-missas', // home e /missa-agora
      'v1/Igreja/buscar-por-filtro', // busca
      'v1/Igreja/buscar-por-cep?cep=01000000',
      'v2/Confiabilidade/1/resumo',
    ]) {
      expect(chaveCidade(url)).withContext(url).toBeNull();
    }
  });

  it('entrada que não é lista passa intacta', () => {
    expect(enxugarIgrejasCidade(undefined)).toBeUndefined();
    expect(enxugarIgrejasCidade(null)).toBeNull();
  });

  it('a JSON enxuta não traz nenhum dos campos removidos', () => {
    const json = JSON.stringify(enxugarIgrejasCidade(baseFicticia()));
    for (const campo of [...CAMPOS_IGREJA_FORA_DA_CIDADE, ...CAMPOS_MISSA_FORA_DA_CIDADE]) {
      expect(json).withContext(campo).not.toContain(`"${campo}"`);
    }
  });
});

/**
 * Paridade de render: a página de cidade com a base completa, enxuta com null e enxuta
 * sem null tem de produzir o MESMO DOM — em todos os filtros e ordenações. É o que
 * garante que o HTML prerenderizado e a hidratação não mudam com o estado enxuto.
 */
describe('CityComponent — paridade de render com o estado enxuto (A2)', () => {
  const FORMATOS = {
    completa: () => baseFicticia(),
    enxutaComNull: () => enxugarIgrejasCidade(baseFicticia(), { semNulos: false }),
    enxutaSemNull: () => enxugarIgrejasCidade(baseFicticia()),
  } as const;

  beforeEach(() => {
    jasmine.clock().install();
    // Quarta-feira, 04/11/2026, 10:00 (horário local): "próxima missa" e "hoje" estáveis.
    jasmine.clock().mockDate(new Date(2026, 10, 4, 10, 0, 0));
  });
  afterEach(() => jasmine.clock().uninstall());

  function montar(igrejas: unknown, plataforma: 'browser' | 'server'): ComponentFixture<CityComponent> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CityComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: plataforma },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ uf: 'sp', cidade: 'cidade-ficticia' }),
            queryParams: of({}),
            snapshot: { params: { uf: 'sp', cidade: 'cidade-ficticia' }, queryParams: {}, data: {} },
          },
        },
        {
          provide: ChurchesService,
          useValue: {
            getByCidade: () =>
              of({ data: { cidade: 'Cidade Fictícia', uf: 'SP', igrejas, seo: { title: 'Missas em Cidade Fictícia', canonicalUrl: 'https://buscamissa.com.br/missas/sp/cidade-ficticia' } } }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CityComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** DOM do componente, sem os `ng-reflect-*` (espelho de debug dos inputs). */
  const dom = (f: ComponentFixture<CityComponent>) =>
    (f.nativeElement as HTMLElement).innerHTML.replace(/\s?ng-reflect-[\w-]+="[^"]*"/g, '');

  type Acao = { nome: string; aplicar: (c: CityComponent) => void };
  const ACOES: Acao[] = [
    { nome: 'sem filtro', aplicar: () => {} },
    ...(['hoje', 'amanha', 'fds'] as const).map((f) => ({ nome: `rápido ${f}`, aplicar: (c: CityComponent) => c.setQuickFilter(f) })),
    ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ nome: `dia ${d}`, aplicar: (c: CityComponent) => c.setDia(d) })),
    ...['manha', 'tarde', 'noite'].map((p) => ({ nome: `período ${p}`, aplicar: (c: CityComponent) => c.setPeriodo(p) })),
    ...(['az', 'za', 'proximidade', 'proxima-missa'] as const).map((o) => ({ nome: `ordem ${o}`, aplicar: (c: CityComponent) => c.setOrdenacao(o) })),
  ];

  for (const plataforma of ['server', 'browser'] as const) {
    it(`${plataforma}: o DOM é idêntico nos três formatos, em todos os filtros e ordenações`, () => {
      for (const acao of ACOES) {
        const doms = Object.entries(FORMATOS).map(([nome, base]) => {
          const f = montar(base(), plataforma);
          acao.aplicar(f.componentInstance);
          f.detectChanges();
          const html = dom(f);
          f.destroy();
          return { nome, html };
        });
        const [ref, ...outros] = doms;
        expect(ref.html.length).withContext(`${acao.nome}: render vazio`).toBeGreaterThan(500);
        for (const o of outros) expect(o.html).withContext(`${acao.nome}: ${o.nome} × ${ref.nome}`).toBe(ref.html);
      }
    });
  }

  it('o render cobre os casos: cards, selo, imagem, links e contagem', () => {
    const f = montar(FORMATOS.enxutaSemNull(), 'server');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-city-card').length).toBe(5);
    expect(el.querySelectorAll('a[href*="/paroquia/"]').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('img.city-card__img').length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Paróquia Alfa');
    f.destroy();
  });

  it('sprite: um único <symbol> na página, todos os cards apontam para ele, sem id duplicado', () => {
    const f = montar(FORMATOS.enxutaSemNull(), 'server');
    const el = f.nativeElement as HTMLElement;
    const simbolos = el.querySelectorAll('symbol');
    expect(simbolos.length).toBe(1);
    // Só os 2 cards sem foto (Beta: imagemUrl vazia; Épsilon: sem imagemUrl) têm a arte.
    const usos = Array.from(el.querySelectorAll('app-city-card use'));
    expect(usos.length).toBe(2);
    for (const u of usos) expect(u.getAttribute('href')).toBe(`#${simbolos[0].id}`);
    // Todo card tem o host do placeholder (o [hidden] alterna); com foto ele vem vazio.
    const hosts = Array.from(el.querySelectorAll('app-city-card app-church-placeholder'));
    expect(hosts.length).toBe(5);
    expect(hosts.filter((h) => h.hasAttribute('hidden')).length).toBe(3);
    for (const h of hosts.filter((h) => h.hasAttribute('hidden'))) expect(h.querySelector('svg')).toBeNull();
    // Nenhuma cópia da arte inline nos cards.
    expect(el.querySelectorAll('app-city-card svg ellipse').length).toBe(0);
    const ids = Array.from(el.querySelectorAll('[id]')).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    f.destroy();
  });
});
