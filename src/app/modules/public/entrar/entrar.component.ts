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

  public modo: Modo = "login";
  public isLoading = false;
  public formLogin!: FormGroup;
  public formSolicitar!: FormGroup;
  public formDefinir!: FormGroup;

  ngOnInit(): void {
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

  solicitarCodigo(): void {
    if (this.formSolicitar.invalid) {
      this.formSolicitar.markAllAsTouched();
      return;
    }
    this.isLoading = true;
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
    if (this.formDefinir.invalid) {
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
}
