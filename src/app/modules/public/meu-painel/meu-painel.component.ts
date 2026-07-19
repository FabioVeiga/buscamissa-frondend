import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { MessageService } from "primeng/api";
import { SkeletonModule } from "primeng/skeleton";
import { PrimeNgModule } from "../../../shared/primeng.module";
import { AuthService } from "../../../core/services/auth.service";
import { ResponsavelService } from "../../../core/services/responsavel.service";
import { NotificacaoService } from "../../../core/services/notificacao.service";
import { LoggerService } from "../../../core/services/logger.service";
import { MinhaResponsabilidade } from "../../../core/interfaces/responsavel.interface";
import { NotificacaoParaResponsavel } from "../../../core/interfaces/notificacao.interface";

/**
 * Painel do Responsável Verificado: igrejas sob gestão do usuário logado
 * (vínculos diretos + capelas herdadas da paróquia) e status das solicitações.
 */
@Component({
  selector: "app-meu-painel",
  imports: [PrimeNgModule, CommonModule, RouterLink, SkeletonModule],
  providers: [MessageService],
  templateUrl: "./meu-painel.component.html",
  styleUrl: "./meu-painel.component.scss",
})
export class MeuPainelComponent implements OnInit {
  private _auth = inject(AuthService);
  private _responsavel = inject(ResponsavelService);
  private _notificacoes = inject(NotificacaoService);
  private _router = inject(Router);
  private _logger = inject(LoggerService);

  isLoading = true;
  erroCarregar = false;
  igrejas: MinhaResponsabilidade[] = [];

  notificacoes: NotificacaoParaResponsavel[] = [];
  marcandoLida: number | null = null;

  get nomeUsuario(): string {
    return this._auth.sessao?.nome ?? "";
  }

  ngOnInit(): void {
    if (!this._auth.estaLogado) {
      this._router.navigate(["/entrar"]);
      return;
    }
    this.carregar();
    this._notificacoes.listar().subscribe({
      next: (lista) => (this.notificacoes = lista),
      error: (error) => this._logger.logError(error, "meu-painel:carregar-notificacoes"),
    });
  }

  marcarNotificacaoLida(destinoId: number): void {
    if (this.marcandoLida) return;
    this.marcandoLida = destinoId;
    this._notificacoes.marcarComoLida(destinoId).subscribe({
      next: () => {
        this.notificacoes = this.notificacoes.map((n) =>
          n.destinoId === destinoId ? { ...n, lida: true } : n
        );
        this.marcandoLida = null;
      },
      error: (error) => {
        this.marcandoLida = null;
        this._logger.logError(error, "meu-painel:marcar-notificacao-lida");
      },
    });
  }

  carregar(): void {
    this.isLoading = true;
    this.erroCarregar = false;
    this._responsavel.minhasIgrejas().subscribe({
      next: (igrejas) => {
        this.igrejas = igrejas;
        this.isLoading = false;
      },
      error: (error) => {
        this.erroCarregar = true;
        this.isLoading = false;
        this._logger.logError(error, "meu-painel:carregar");
      },
    });
  }

  sair(): void {
    this._auth.logout();
    this._router.navigate(["/home"]);
  }

  /** Editável: aprovada direta ou herdada da paróquia (não pendente/rejeitada/revogada). */
  podeEditar(igreja: MinhaResponsabilidade): boolean {
    return igreja.porHeranca || igreja.status === "Aprovado";
  }

  linkIgreja(igreja: MinhaResponsabilidade): string[] | null {
    // Slug canônico não carrega uf/cidade aqui; usa rota legada por segurança
    return igreja.igrejaSlug ? ["/igrejas", igreja.igrejaSlug] : null;
  }

  statusChip(igreja: MinhaResponsabilidade): { label: string; classe: string } {
    if (igreja.porHeranca) return { label: "Gestão pela paróquia", classe: "chip chip--heranca" };
    switch (igreja.status) {
      case "Aprovado":
        return { label: "Responsável Verificado ✓", classe: "chip chip--aprovado" };
      case "PendenteVerificacao":
        return { label: "Em análise", classe: "chip chip--pendente" };
      case "Rejeitado":
        return { label: "Não aprovada", classe: "chip chip--negado" };
      case "Revogado":
        return { label: "Acesso revogado", classe: "chip chip--negado" };
      default:
        return { label: igreja.status, classe: "chip" };
    }
  }
}
