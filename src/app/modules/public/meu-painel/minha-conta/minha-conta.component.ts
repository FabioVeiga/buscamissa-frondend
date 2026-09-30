import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { AuthService } from "../../../../core/services/auth.service";
import { LoggerService } from "../../../../core/services/logger.service";
import { PerguntaSegurancaItem } from "../../../../core/interfaces/user.interface";

/**
 * Área "Minha conta" do Responsável Verificado logado: trocar senha e trocar
 * a pergunta de segurança pessoal (ambas exigem a senha atual).
 */
@Component({
  selector: "app-minha-conta",
  imports: [PrimeNgModule, CommonModule, ReactiveFormsModule, RouterLink],
  providers: [MessageService],
  templateUrl: "./minha-conta.component.html",
  styleUrl: "./minha-conta.component.scss",
})
export class MinhaContaComponent implements OnInit {
  private _auth = inject(AuthService);
  private _message = inject(MessageService);
  private _fb = inject(FormBuilder);
  private _logger = inject(LoggerService);
  private _router = inject(Router);

  public formSenha!: FormGroup;
  public formPergunta!: FormGroup;
  public isLoadingSenha = false;
  public isLoadingPergunta = false;
  public catalogoPerguntas: PerguntaSegurancaItem[] = [];
  public perguntaAtual: string | null = null;

  ngOnInit(): void {
    if (!this._auth.estaLogado) {
      this._router.navigate(["/entrar"]);
      return;
    }

    this.formSenha = this._fb.group({
      senhaAtual: ["", Validators.required],
      novaSenha: ["", [Validators.required, Validators.minLength(8)]],
    });
    this.formPergunta = this._fb.group({
      senhaAtual: ["", Validators.required],
      perguntaSegurancaId: [null, Validators.required],
      resposta: ["", Validators.required],
    });

    this._auth.obterCatalogoPerguntasSeguranca().subscribe({
      next: (catalogo) => (this.catalogoPerguntas = catalogo),
      error: (error) => this._logger.logError(error, "minha-conta:catalogo-perguntas"),
    });
    this._auth.obterMinhaPerguntaSeguranca().subscribe({
      next: (r) => (this.perguntaAtual = r.pergunta),
      error: (error) => this._logger.logError(error, "minha-conta:minha-pergunta"),
    });
  }

  trocarSenha(): void {
    if (this.formSenha.invalid) {
      this.formSenha.markAllAsTouched();
      return;
    }
    this.isLoadingSenha = true;
    this._auth.trocarSenha(this.formSenha.value).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Senha alterada", detail: mensagem });
        // Todas as sessões (inclusive a atual) foram revogadas no backend.
        this._auth.logout();
        this._router.navigate(["/entrar"]);
      },
      error: (error) => {
        this.isLoadingSenha = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível alterar a senha",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "minha-conta:trocar-senha");
      },
      complete: () => (this.isLoadingSenha = false),
    });
  }

  trocarPergunta(): void {
    if (this.formPergunta.invalid) {
      this.formPergunta.markAllAsTouched();
      return;
    }
    this.isLoadingPergunta = true;
    this._auth.trocarPerguntaSeguranca(this.formPergunta.value).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Pergunta atualizada", detail: mensagem });
        this.formPergunta.reset();
        this._auth.obterMinhaPerguntaSeguranca().subscribe({
          next: (r) => (this.perguntaAtual = r.pergunta),
          error: (error) => this._logger.logError(error, "minha-conta:minha-pergunta"),
        });
      },
      error: (error) => {
        this.isLoadingPergunta = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível atualizar a pergunta",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "minha-conta:trocar-pergunta");
      },
      complete: () => (this.isLoadingPergunta = false),
    });
  }
}
