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
}
