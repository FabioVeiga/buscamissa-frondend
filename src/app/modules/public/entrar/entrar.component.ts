import { Component, inject, OnInit } from "@angular/core";
import { NgIf } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../shared/primeng.module";
import { AuthService } from "../../../core/services/auth.service";
import { LoggerService } from "../../../core/services/logger.service";
import { MetricasService, PaginaMetrica } from "../../../core/services/metricas.service";

type Modo = "login" | "solicitar-codigo" | "definir-senha";

/**
 * Login do Responsável Verificado: entrar com e-mail/senha, criar senha
 * (primeiro acesso) e recuperar senha — os dois últimos usam o mesmo fluxo
 * de código por e-mail do backend.
 */
@Component({
  selector: "app-entrar",
  imports: [PrimeNgModule, FormsModule, ReactiveFormsModule, NgIf],
  providers: [MessageService],
  templateUrl: "./entrar.component.html",
  styleUrl: "./entrar.component.scss",
})
export class EntrarComponent implements OnInit {
  private _auth = inject(AuthService);
  private _message = inject(MessageService);
  private _fb = inject(FormBuilder);
  private _logger = inject(LoggerService);
  private _router = inject(Router);
  private _metricas = inject(MetricasService);

  public modo: Modo = "login";
  public isLoading = false;
  public formLogin!: FormGroup;
  public formSolicitar!: FormGroup;
  public formDefinir!: FormGroup;

  /** Alternativa ao código por e-mail (FT auth-senha-sem-email) — decidida
   * pelo backend a cada tentativa, nunca fixa no build (mesmo padrão de
   * validate-code.component.ts no cadastro de igreja). */
  public mostrarDesafio = false;
  public perguntaDesafio = "";

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Entrar);
    // Forms antes do redirect: o template renderiza uma vez mesmo quando
    // vamos navegar embora — sem os forms criados isso estoura NG01052.
    this.formLogin = this._fb.group({
      email: ["", [Validators.required, Validators.email]],
      senha: ["", Validators.required],
    });
    this.formSolicitar = this._fb.group({
      email: ["", [Validators.required, Validators.email]],
      nome: [""],
    });
    this.formDefinir = this._fb.group({
      codigo: [null, [Validators.required, Validators.min(100000), Validators.max(999999)]],
      resposta: [null, Validators.required],
      novaSenha: ["", [Validators.required, Validators.minLength(8)]],
    });

    if (this._auth.estaLogado) {
      this._router.navigate(["/meu-painel"]);
    }
  }

  trocarModo(modo: Modo): void {
    this.modo = modo;
  }

  entrar(): void {
    if (this.formLogin.invalid) {
      this.formLogin.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const { email, senha } = this.formLogin.value;
    this._auth.login(email, senha).subscribe({
      next: (sessao) => {
        this._message.add({
          severity: "success",
          summary: "Bem-vindo",
          detail: `Olá, ${sessao.nome}!`,
        });
        this._router.navigate(["/meu-painel"]);
      },
      error: (error) => {
        this.isLoading = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível entrar",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "entrar:login");
      },
      complete: () => (this.isLoading = false),
    });
  }

  // Sempre tenta o desafio matemático primeiro; se o backend responder que ele
  // não está habilitado (FT auth-senha-sem-email OFF e provedor de e-mail
  // configurado), cai pro fluxo tradicional de código por e-mail. Decisão 100%
  // do backend a cada chamada — nada fixo no build do frontend.
  solicitarCodigo(): void {
    if (this.formSolicitar.invalid) {
      this.formSolicitar.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    this._auth.obterDesafioSenha(this.formSolicitar.value).subscribe({
      next: (pergunta) => {
        this.mostrarDesafio = true;
        this.perguntaDesafio = pergunta;
        this.formDefinir.reset();
        this.modo = "definir-senha";
        this.isLoading = false;
      },
      error: (error) => {
        if (error?.status === 404) {
          this.mostrarDesafio = false;
          this._enviarCodigoPorEmail();
          return;
        }
        this.isLoading = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível enviar o código",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "entrar:obter-desafio");
      },
    });
  }

  private _enviarCodigoPorEmail(): void {
    this._auth.solicitarCodigoSenha(this.formSolicitar.value).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Código enviado", detail: mensagem });
        this.modo = "definir-senha";
      },
      error: (error) => {
        this.isLoading = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível enviar o código",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "entrar:solicitar-codigo");
      },
      complete: () => (this.isLoading = false),
    });
  }

  definirSenha(): void {
    if (this.mostrarDesafio) {
      this._definirSenhaPorDesafio();
      return;
    }
    if (this.formDefinir.controls["codigo"].invalid || this.formDefinir.controls["novaSenha"].invalid) {
      this.formDefinir.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const email = this.formSolicitar.value.email;
    const { codigo, novaSenha } = this.formDefinir.value;
    this._auth.definirSenha({ email, codigo, novaSenha }).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Senha definida", detail: mensagem });
        this.formLogin.patchValue({ email });
        this.modo = "login";
      },
      error: (error) => {
        this.isLoading = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível definir a senha",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "entrar:definir-senha");
      },
      complete: () => (this.isLoading = false),
    });
  }

  private _definirSenhaPorDesafio(): void {
    if (this.formDefinir.controls["resposta"].invalid || this.formDefinir.controls["novaSenha"].invalid) {
      this.formDefinir.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const email = this.formSolicitar.value.email;
    const { resposta, novaSenha } = this.formDefinir.value;
    this._auth.definirSenhaPorDesafio({ email, resposta, novaSenha }).subscribe({
      next: (mensagem) => {
        this._message.add({ severity: "success", summary: "Senha definida", detail: mensagem });
        this.formLogin.patchValue({ email });
        this.mostrarDesafio = false;
        this.modo = "login";
      },
      error: (error) => {
        this.isLoading = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível definir a senha",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "entrar:definir-senha-desafio");
        // Desafio expirado (15 min) → busca um novo automaticamente.
        if (error?.error?.data?.desafioExpirado) this.solicitarCodigo();
      },
      complete: () => (this.isLoading = false),
    });
  }
}
