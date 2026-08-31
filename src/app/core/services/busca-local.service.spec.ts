import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BuscaLocalService } from './busca-local.service';

/**
 * O foco aqui é o que NÃO dá para ver na tela sem um índice montado à mão:
 * a tolerância a índice antigo (sem a tabela `b`), o recorte por escopo, a
 * ordenação que impede a lista de 6 ser preenchida por casamentos de bairro
 * enquanto a igreja procurada fica de fora — e, sobretudo, a garantia de que
 * `buscar()` (o caminho de `/cidades`) NÃO herdou nada disso.
 */
describe('BuscaLocalService', () => {
  let service: BuscaLocalService;
  let http: HttpTestingController;

  /** Índice mínimo no formato compacto de `scripts/gerar-indice-busca.mjs`. */
  const INDICE = {
    c: [
      ['São Paulo', 'sp', 'sao-paulo'],
      ['Cachoeira', 'ba', 'cachoeira'],
      ['Curitiba', 'pr', 'curitiba'],
    ],
    b: ['Bela Vista', 'Centro', 'São Francisco'],
    i: [
      ['Paróquia Nossa Senhora Achiropita', 0, 'paroquia-achiropita', 0],
      ['Igreja Matriz', 1, 'igreja-matriz', 1],
      ['Paróquia Santo Antônio', 2, 'paroquia-santo-antonio', 2],
      ['Paróquia São José', 0, 'paroquia-sao-jose', 1],
      ['Paróquia São José', 2, 'paroquia-sao-jose-cwb', 1],
    ],
  };

  function responder(corpo: object = INDICE): void {
    const req = http.expectOne((r) => r.url.includes('busca-index.json'));
    req.flush(corpo);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BuscaLocalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('materializa nome, cidade, uf, slug e bairro', () => {
    service.carregarIndice().subscribe();
    responder();

    const { igrejas } = service.buscarIgrejas('achiropita');
    expect(igrejas.length).toBe(1);
    expect(igrejas[0]).toEqual({
      nome: 'Paróquia Nossa Senhora Achiropita',
      cidade: 'São Paulo',
      uf: 'sp',
      cidadeSlug: 'sao-paulo',
      slug: 'paroquia-achiropita',
      bairro: 'Bela Vista',
    });
  });

  it('aceita índice antigo, sem a tabela de bairros', () => {
    // Deploy do frontend antes de rebuildar o índice: degrada a linha, não quebra.
    service.carregarIndice().subscribe();
    responder({ c: INDICE.c, i: [['Paróquia Nossa Senhora Achiropita', 0, 'paroquia-achiropita']] });

    const { igrejas } = service.buscarIgrejas('achiropita');
    expect(igrejas.length).toBe(1);
    expect(igrejas[0].bairro).toBeUndefined();
  });

  it('buscarIgrejas casa por bairro', () => {
    service.carregarIndice().subscribe();
    responder();

    const { igrejas } = service.buscarIgrejas('achiropita bela vista');
    expect(igrejas.map((i) => i.slug)).toEqual(['paroquia-achiropita']);
  });

  it('buscarIgrejas põe quem casa no NOME antes de quem casa só pelo local', () => {
    service.carregarIndice().subscribe();
    responder();

    // "sao francisco" é bairro da Santo Antônio (Curitiba). Nenhum nome casa.
    expect(service.buscarIgrejas('sao francisco').igrejas.map((i) => i.slug))
      .toEqual(['paroquia-santo-antonio']);

    // "centro" é bairro de três; "sao jose" casa no NOME de duas delas, que
    // portanto precisam vir antes.
    const mistura = service.buscarIgrejas('sao');
    expect(mistura.igrejas[0].nome).toContain('São José');
  });

  it('buscarIgrejas recorta por UF e por cidade quando há escopo', () => {
    service.carregarIndice().subscribe();
    responder();

    expect(service.buscarIgrejas('sao jose').total).toBe(2);
    expect(service.buscarIgrejas('sao jose', { uf: 'pr' }).total).toBe(1);
    expect(service.buscarIgrejas('sao jose', { cidade: 'São Paulo' }).total).toBe(1);
    expect(service.buscarIgrejas('sao jose', { uf: 'sp', cidade: 'Curitiba' }).total).toBe(0);
  });

  it('total conta antes do corte da lista', () => {
    service.carregarIndice().subscribe();
    responder();

    const r = service.buscarIgrejas('paroquia');
    // 4 paróquias no índice, todas dentro do cap de 6 — os dois números batem aqui.
    expect(r.total).toBe(4);
    expect(r.igrejas.length).toBe(4);
  });

  it('ignora acento, caixa e apóstrofo na consulta', () => {
    service.carregarIndice().subscribe();
    responder();

    expect(service.buscarIgrejas('ACHIROPITA').total).toBe(1);
    expect(service.buscarIgrejas('paroquia sao jose').total).toBe(2);
  });

  it('consulta vazia não devolve nada', () => {
    service.carregarIndice().subscribe();
    responder();

    expect(service.buscarIgrejas('   ')).toEqual({ igrejas: [], total: 0 });
    expect(service.buscar('   ', [])).toEqual({ cidades: [], igrejas: [] });
  });

  // ── A garantia de isolamento: `/cidades` não pode ter mudado ────────────────

  it('buscar() NÃO casa por bairro — é o caminho de /cidades', () => {
    service.carregarIndice().subscribe();
    responder();

    // Na home isto acha a Achiropita (bairro Bela Vista). Em /cidades, não pode.
    expect(service.buscarIgrejas('achiropita bela vista').total).toBe(1);
    expect(service.buscar('achiropita bela vista', []).igrejas).toEqual([]);

    // E "bela vista" sozinho não pode virar resultado em /cidades.
    expect(service.buscar('bela vista', []).igrejas).toEqual([]);
  });

  it('buscar() NÃO reordena por relevância — mantém a ordem do índice', () => {
    service.carregarIndice().subscribe();
    responder();

    // "sao" casa três: a Achiropita pela CIDADE ("São Paulo") e as duas São José
    // pelo NOME. É o contraste exato entre os dois caminhos — mesmo conjunto,
    // ordens diferentes.
    expect(service.buscar('sao', []).igrejas.map((i) => i.slug))
      .toEqual(['paroquia-achiropita', 'paroquia-sao-jose', 'paroquia-sao-jose-cwb']);

    // A home acha uma a MAIS (a Santo Antônio entra pelo bairro "São Francisco")
    // e põe quem casa no nome na frente. /cidades não pode fazer nem uma coisa
    // nem outra.
    expect(service.buscarIgrejas('sao').igrejas.map((i) => i.slug)).toEqual([
      'paroquia-sao-jose',      // peso 2: casou no nome
      'paroquia-sao-jose-cwb',  // peso 2: casou no nome
      'paroquia-achiropita',    // peso 3: casou só pela cidade
      'paroquia-santo-antonio', // peso 3: casou só pelo bairro
    ]);
  });

  it('buscar() devolve a forma antiga, sem campo de total', () => {
    service.carregarIndice().subscribe();
    responder();

    const r = service.buscar('paroquia', []);
    expect(Object.keys(r).sort()).toEqual(['cidades', 'igrejas']);
  });

  it('buscar() continua devolvendo cidades', () => {
    service.carregarIndice().subscribe();
    responder();

    const cidades = [
      { nome: 'São Paulo', uf: 'sp', cidadeSlug: 'sao-paulo', totalParoquias: 40 },
      { nome: 'São José dos Campos', uf: 'sp', cidadeSlug: 'sjc', totalParoquias: 90 },
    ];
    // Mais paróquias primeiro — a ordenação que /cidades sempre teve.
    expect(service.buscar('sao', cidades).cidades.map((c) => c.cidadeSlug))
      .toEqual(['sjc', 'sao-paulo']);
  });

  it('correspondenciasExatas devolve TODAS as homônimas, não a primeira', () => {
    service.carregarIndice().subscribe();
    responder();

    // Duas "Paróquia São José" em cidades diferentes: continua ambíguo, e quem
    // chama precisa saber disso para não navegar por conta do usuário.
    expect(service.correspondenciasExatas('Paróquia São José').length).toBe(2);
    expect(service.correspondenciasExatas('Paróquia São José', { uf: 'pr' }).length).toBe(1);
    expect(service.correspondenciasExatas('paróquia são').length).toBe(0);
  });

  it('índice indisponível vira índice vazio, não erro', () => {
    let emitiu: boolean | undefined;
    let errou = false;
    service.carregarIndice().subscribe({ next: (v) => (emitiu = v), error: () => (errou = true) });

    const req = http.expectOne((r) => r.url.includes('busca-index.json'));
    req.flush('nao sou json', { status: 500, statusText: 'Server Error' });

    expect(errou).toBeFalse();
    expect(emitiu).toBeFalse();
    expect(service.buscarIgrejas('achiropita')).toEqual({ igrejas: [], total: 0 });
  });

  it('baixa o índice uma vez só, por mais que peçam', () => {
    // `shareReplay({ refCount: false })`: fechar o painel não pode descartar o
    // cache e fazer a próxima digitação rebaixar o arquivo inteiro.
    service.carregarIndice().subscribe();
    service.carregarIndice().subscribe();
    responder(); // `expectOne` aqui já falharia se tivessem saído dois requests.

    let emitiuDepois: boolean | undefined;
    service.carregarIndice().subscribe((v) => (emitiuDepois = v));

    expect(http.match((r) => r.url.includes('busca-index.json')).length).toBe(0);
    expect(emitiuDepois).toBeTrue();
  });
});
