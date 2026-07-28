import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import {
  DadosEdicao,
  EditarDadosRequest,
  MinhaResponsabilidade,
  SolicitarResponsabilidadeRequest,
  MetricasIgreja,
  CircunscricaoOpcao,
  AtualizarCircunscricaoRequest,
  CapelaOrfa,
  MinhaSolicitacaoVinculo,
  SolicitarVinculoCapelaRequest,
  SolicitarVinculoParoquiaRequest,
} from "../interfaces/responsavel.interface";

/**
 * Fluxo Responsável Verificado (api/v1/responsavel do api-public).
 * O status público é anônimo; os demais exigem sessão (AuthService/JWT).
 */
@Injectable({ providedIn: "root" })
export class ResponsavelService {
  private http = inject(HttpClient);

  /** A igreja tem responsável verificado? (anônimo — usado pelo badge) */
  igrejaVerificada(igrejaId: number): Observable<boolean> {
    return this.http
      .get<{ data: { verificada: boolean } }>(`v1/responsavel/igreja/${igrejaId}/publico`)
      .pipe(map((r) => r.data.verificada));
  }

  solicitar(igrejaId: number, request: SolicitarResponsabilidadeRequest): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${igrejaId}/solicitar`, request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  minhasIgrejas(): Observable<MinhaResponsabilidade[]> {
    return this.http
      .get<{ data: MinhaResponsabilidade[] }>("v1/responsavel/minhas-igrejas")
      .pipe(map((r) => r.data));
  }

  podeEditar(igrejaId: number): Observable<boolean> {
    return this.http
      .get<{ data: { podeEditar: boolean } }>(`v1/responsavel/igreja/${igrejaId}/pode-editar`)
      .pipe(map((r) => r.data.podeEditar));
  }

  /** Dados atuais editáveis (contato/redes/horários) para o formulário. */
  obterDados(igrejaId: number): Observable<DadosEdicao> {
    return this.http
      .get<{ data: DadosEdicao }>(`v1/responsavel/igreja/${igrejaId}/dados`)
      .pipe(map((r) => r.data));
  }

  /** Métricas dos últimos 30 dias — cards do painel do responsável. */
  obterMetricas(igrejaId: number): Observable<MetricasIgreja> {
    return this.http
      .get<{ data: {
        periodoInicio: string; periodoFim: string;
        visualizacoes: number; favoritos: number;
        cliquesInstagram: number; compartilhamentos: number;
      } }>(`v1/responsavel/igreja/${igrejaId}/metricas`)
      .pipe(
        map((r) => ({
          periodoInicio: new Date(r.data.periodoInicio),
          periodoFim: new Date(r.data.periodoFim),
          visualizacoes: r.data.visualizacoes,
          favoritos: r.data.favoritos,
          cliquesInstagram: r.data.cliquesInstagram,
          compartilhamentos: r.data.compartilhamentos
        }))
      );
  }

  /** Aplica a edição direta na igreja real. */
  editarDados(igrejaId: number, request: EditarDadosRequest): Observable<string> {
    return this.http
      .put<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${igrejaId}/dados`, request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  /** Fase 3: opções ativas para o seletor de Diocese. */
  listarDioceses(): Observable<CircunscricaoOpcao[]> {
    return this.http
      .get<{ data: CircunscricaoOpcao[] }>("v1/responsavel/dioceses")
      .pipe(map((r) => r.data));
  }

  /** Fase 3: opções ativas para o seletor de Arquidiocese. */
  listarArquidioceses(): Observable<CircunscricaoOpcao[]> {
    return this.http
      .get<{ data: CircunscricaoOpcao[] }>("v1/responsavel/arquidioceses")
      .pipe(map((r) => r.data));
  }

  /** Fase 3: responsável escolhe a diocese OU arquidiocese direta da própria paróquia. */
  atualizarCircunscricao(igrejaId: number, request: AtualizarCircunscricaoRequest): Observable<string> {
    return this.http
      .put<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${igrejaId}/diocese`, request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  /** Remove o vínculo direto de diocese/arquidiocese (self-service). */
  desvincularCircunscricao(igrejaId: number): Observable<string> {
    return this.http
      .delete<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${igrejaId}/diocese`)
      .pipe(map((r) => r.data.mensagemTela));
  }

  /** Não achou a diocese/arquidiocese na lista — abre solicitação pro admin cadastrar. */
  solicitarCircunscricao(mensagem: string): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>("v1/responsavel/solicitar-circunscricao", { mensagem })
      .pipe(map((r) => r.data.mensagemTela));
  }

  /** Fase 4: busca capelas/comunidades sem paróquia-pai (candidatas a vínculo), por nome, restrito à UF. */
  buscarCapelasOrfas(uf: string, q: string): Observable<CapelaOrfa[]> {
    return this.http
      .get<{ data: CapelaOrfa[] }>("v1/responsavel/capelas-orfas", { params: { uf, q } })
      .pipe(map((r) => r.data));
  }

  /** Fase 4 (reversa): busca paróquias por nome, restrito à UF — usado quando quem edita é a capela. */
  buscarParoquias(uf: string, q: string): Observable<CapelaOrfa[]> {
    return this.http
      .get<{ data: CapelaOrfa[] }>("v1/responsavel/paroquias", { params: { uf, q } })
      .pipe(map((r) => r.data));
  }

  /** Fase 4 (reversa): a própria capela solicita vínculo com uma paróquia. */
  solicitarVinculoParoquia(capelaId: number, request: SolicitarVinculoParoquiaRequest): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${capelaId}/solicitar-paroquia`, request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  /** Fase 4: minhas solicitações de vínculo (qualquer status) — evita pedido duplicado. */
  minhasSolicitacoesVinculo(): Observable<MinhaSolicitacaoVinculo[]> {
    return this.http
      .get<{ data: MinhaSolicitacaoVinculo[] }>("v1/responsavel/minhas-solicitacoes-vinculo")
      .pipe(map((r) => r.data));
  }

  /** Fase 4: solicita vínculo de uma capela órfã à paróquia (passa por aprovação do admin). */
  solicitarVinculoCapela(paroquiaId: number, request: SolicitarVinculoCapelaRequest): Observable<string> {
    return this.http
      .post<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${paroquiaId}/solicitar-capela`, request)
      .pipe(map((r) => r.data.mensagemTela));
  }

  /** Fase 4: desanexa uma capela já vinculada à própria paróquia (self-service). */
  desanexarCapela(capelaId: number): Observable<string> {
    return this.http
      .delete<{ data: { mensagemTela: string } }>(`v1/responsavel/igreja/${capelaId}/vinculo-paroquia`)
      .pipe(map((r) => r.data.mensagemTela));
  }
}
