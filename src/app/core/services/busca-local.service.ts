import { HttpClient } from '@angular/common/http';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { LoggerService } from './logger.service';
import { casaTokens, normalizarTexto, tokensDeBusca } from '../../shared/utils/busca.utils';

/** Cidade candidata da busca. Vem do payload que a página já carregou. */
export interface CidadeBusca {
  nome: string;
  uf: string;
  cidadeSlug: string;
  totalParoquias: number;
}

/** Paróquia candidata da busca. Vem do índice estático. */
export interface IgrejaBusca {
  nome: string;
  cidade: string;
  uf: string;
  cidadeSlug: string;
  slug: string;
  /** Ausente em paróquias sem bairro cadastrado e em índices gerados antes da tabela `b`. */
  bairro?: string;
}

export interface ResultadoBusca {
  cidades: CidadeBusca[];
  igrejas: IgrejaBusca[];
}

/** Formato compacto de `public/busca-index.json` (ver scripts/gerar-indice-busca.mjs). */
interface IndiceBruto {
  /** [cidade, uf, cidadeSlug] */
  c: [string, string, string][];
  /** Tabela de bairros deduplicada. Ausente em índices anteriores à sua introdução. */
  b?: string[];
  /** [nome, índice em `c`, slug, índice em `b` (-1 = sem bairro)] */
  i: [string, number, string, number?][];
}

/** Igreja com o texto de busca já normalizado — normalizar dentro do laço, a cada tecla, custaria caro. */
interface IgrejaIndexada extends IgrejaBusca {
  /**
   * Nome + cidade + UF. **Não inclui bairro**, e isso é deliberado: é a chave que
   * `buscar()` usa, e `buscar()` serve `/cidades`, que está em produção e não é
   * escopo desta mudança. Incluir bairro aqui alteraria o que aquela página casa.
   */
  chave: string;
  /**
   * Bairro normalizado, guardado à parte justamente para NÃO entrar em `chave`.
   * Quem quiser casar por bairro testa este campo separadamente.
   */
  chaveBairro: string;
}

const CAP_CIDADES = 5;
const CAP_IGREJAS = 6;

/**
 * Busca local de CIDADE e IGREJA para o hero de `/cidades`.
 *
 * Por que local: não existe endpoint que busque paróquia por nome no Brasil inteiro
 * — `v1/Igreja/buscar-por-filtro` aceita `Nome` mas exige `Uf`, e `/v2/seo/estados`
 * não traz nome de paróquia. O que existe é `/v2/seo/paroquias`, com ~14 MB,
 * inviável em runtime; `scripts/gerar-indice-busca.mjs` o reduz no prebuild a
 * `public/busca-index.json` (~380 KB), que é o que este serviço consome.
 *
 * As duas metades da busca são deliberadamente independentes:
 *
 *  - CIDADES saem de `cidades`, passado pelo componente a partir do payload que a
 *    página JÁ carregou. Respondem na primeira tecla, sem rede, sempre.
 *  - IGREJAS saem do índice, carregado sob demanda. Enquanto ele não chega — ou se
 *    nunca chegar — a busca de cidades continua inteira e nada de erro aparece na
 *    tela. Por isso o campo não tem spinner: não há um estado "carregando" que o
 *    usuário precise esperar, só um grupo de resultados que aparece quando pode.
 */
@Injectable({ providedIn: 'root' })
export class BuscaLocalService {
  private _http = inject(HttpClient);
  private _doc = inject(DOCUMENT);
  private _logger = inject(LoggerService);
  private _ehBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * `shareReplay({ refCount: false })`: o índice é baixado UMA vez por sessão da
   * página. Com `refCount: true`, ficar sem assinantes (o usuário fecha o dropdown)
   * descartaria o cache e a próxima digitação baixaria 380 KB de novo. Mesmo padrão
   * de `ChurchesService.addressRange$`.
   */
  private _indice$?: Observable<IgrejaIndexada[]>;

  /**
   * Dispara (ou reaproveita) a carga do índice. Idempotente: chamar no `focus` E na
   * primeira tecla resulta em UM request, não dois.
   *
   * Emite `true` quando há índice utilizável. Nunca emite erro — falha de rede, 404
   * ou HTML no lugar do JSON viram índice vazio, porque a página não deve exibir
   * defeito por causa de um recurso opcional.
   */
  carregarIndice(): Observable<boolean> {
    return this.indice().pipe(map((lista) => lista.length > 0));
  }

  /**
   * Busca síncrona de CIDADE + IGREJA — o caminho de `/cidades`.
   *
   * Casa por nome + cidade + UF. **Sem bairro**, mesmo agora que o índice o traz:
   * incluí-lo aqui mudaria o que esta página casa, e `/cidades` está em produção.
   */
  buscar(consulta: string, cidades: CidadeBusca[]): ResultadoBusca {
    const tokens = tokensDeBusca(consulta);
    if (!tokens.length) return { cidades: [], igrejas: [] };

    const cidadesCasadas = cidades
      .filter((c) => casaTokens(normalizarTexto(`${c.nome} ${c.uf}`), tokens))
      // Mais paróquias primeiro: quem digita "sao paulo" quer a capital, não a
      // homônima com duas igrejas cadastradas.
      .sort((a, b) => b.totalParoquias - a.totalParoquias)
      .slice(0, CAP_CIDADES);

    const igrejasCasadas = this._igrejas
      .filter((i) => casaTokens(i.chave, tokens))
      .slice(0, CAP_IGREJAS)
      .map(({ chave, chaveBairro, ...igreja }) => igreja);

    return { cidades: cidadesCasadas, igrejas: igrejasCasadas };
  }

  /** Índice já materializado, para o caminho síncrono de `buscar()`. */
  private _igrejas: IgrejaIndexada[] = [];

  private indice(): Observable<IgrejaIndexada[]> {
    // No prerender não há índice para baixar nem usuário para digitar: uma requisição
    // aqui só atrasaria o render de 2.4k páginas.
    if (!this._ehBrowser) return of([]);

    this._indice$ ??= this._http
      // URL ABSOLUTA de propósito: `ApiBaseUrlInterceptor` prefixa toda URL relativa
      // com a base da API, e este arquivo é estático, servido pela origem do site.
      // Mesma razão pela qual `SeoPaginasService` monta URL completa.
      .get<IndiceBruto>(`${this._doc.location.origin}/busca-index.json`)
      .pipe(
        map((bruto) => this.materializar(bruto)),
        catchError((erro: any) => {
          // Cai aqui também quando o fallback do servidor devolve o HTML da home em
          // vez do JSON (200 + corpo que não parseia). Silencioso para o usuário.
          this._logger.logWarning(
            `índice de busca indisponível (${erro?.message ?? erro}) — a busca segue só com cidades.`,
            'BuscaLocalService',
          );
          return of([] as IgrejaIndexada[]);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this._indice$;
  }

  private materializar(bruto: IndiceBruto): IgrejaIndexada[] {
    if (!bruto || !Array.isArray(bruto.c) || !Array.isArray(bruto.i)) {
      throw new Error('formato inesperado');
    }

    // `b` ausente = índice gerado antes da tabela de bairros. Tolerado de propósito:
    // um deploy do frontend sem rebuildar o índice degrada a linha (fica sem o
    // complemento de bairro) em vez de quebrar a busca inteira.
    const tabelaBairros = Array.isArray(bruto.b) ? bruto.b : [];

    const igrejas: IgrejaIndexada[] = [];
    for (const [nome, iCidade, slug, iBairro] of bruto.i) {
      const cidade = bruto.c[iCidade];
      if (!cidade || !nome || !slug) continue;
      const [nomeCidade, uf, cidadeSlug] = cidade;
      const bairro = typeof iBairro === 'number' && iBairro >= 0 ? tabelaBairros[iBairro] : undefined;
      igrejas.push({
        nome,
        cidade: nomeCidade,
        uf,
        cidadeSlug,
        slug,
        bairro,
        // Cidade e UF entram na chave para que "Curitiba Nossa Senhora" funcione:
        // um token casa o nome da igreja, o outro casa a cidade dela.
        // Bairro fica FORA daqui — ver o comentário em `IgrejaIndexada.chave`.
        chave: normalizarTexto(`${nome} ${nomeCidade} ${uf}`),
        chaveBairro: normalizarTexto(bairro ?? ''),
      });
    }

    this._igrejas = igrejas;
    return igrejas;
  }
}
