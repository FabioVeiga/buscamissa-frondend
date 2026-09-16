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
import { PerguntaSegurancaItem } from "../../../core/interfaces/user.interface";

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

  /** Pergunta de segurança pessoal cadastrada pelo próprio usuário — sempre
   * tentada primeiro na recuperação de senha (mais forte que o desafio
   * matemático: só quem é dono da conta sabe a resposta). */
  public mostrarPerguntaPessoal = false;
  public perguntaPessoal = "";

  /** Alternativa ao código por e-mail (FT auth-senha-sem-email) — usada só no
   * bootstrap de contas que ainda não têm pergunta pessoal cadastrada. Decidida
   * pelo backend a cada tentativa, nunca fixa no build (mesmo padrão de
   * validate-code.component.ts no cadastro de igreja). */
  public mostrarDesafio = false;
  public perguntaDesafio = "";
  public catalogoPerguntas: PerguntaSegurancaItem[] = [];

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
      // Bootstrap (desafio matemático): cadastro obrigatório da pergunta pessoal.
      perguntaSegurancaId: [null, Validators.required],
      respostaSegurancaCadastro: ["", Validators.required],
      // Recuperação por pergunta pessoal (usuário já cadastrado).
      respostaPerguntaPessoal: ["", Validators.required],
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

  // Sempre tenta a pergunta de segurança pessoal primeiro (usuário já
  // cadastrado). Se ele ainda não tem uma (conta nova, nunca definiu senha),
  // cai pro bootstrap via desafio matemático — que já cadastra a pergoal nesse
  // mesmo passo. Se nem o desafio estiver habilitado, cai pro código por
  // e-mail tradicional. Decisão 100% do backend a cada chamada — nada fixo no
  // build do frontend.
  solicitarCodigo(): void {
    if (this.formSolicitar.invalid) {
      this.formSolicitar.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    this._auth.obterPerguntaSeguranca(this.formSolicitar.value).subscribe({
      next: (pergunta) => {
        this.mostrarPerguntaPessoal = true;
        this.mostrarDesafio = false;
        this.perguntaPessoal = pergunta;
        this.formDefinir.reset();
        this.modo = "definir-senha";
        this.isLoading = false;
      },
      error: (error) => {
        if (error?.status === 404) {
          this.mostrarPerguntaPessoal = false;
          this._tentarDesafioBootstrap();
          return;
        }
        this.isLoading = false;
        this._message.add({
          severity: "error",
          summary: "Não foi possível continuar",
          detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
        });
        this._logger.logError(error, "entrar:obter-pergunta-seguranca");
      },
    });
  }

  private _tentarDesafioBootstrap(): void {
    this._auth.obterDesafioSenha(this.formSolicitar.value).subscribe({
      next: (pergunta) => {
        this.mostrarDesafio = true;
        this.perguntaDesafio = pergunta;
        this.formDefinir.reset();
        this.modo = "definir-senha";
        this.isLoading = false;
        this._carregarCatalogoPerguntas();
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

  private _carregarCatalogoPerguntas(): void {
    if (this.catalogoPerguntas.length) return;
    this._auth.obterCatalogoPerguntasSeguranca().subscribe({
      next: (catalogo) => (this.catalogoPerguntas = catalogo),
      error: (error) => this._logger.logError(error, "entrar:catalogo-perguntas"),
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
    if (this.mostrarPerguntaPessoal) {
      this._definirSenhaPorPergunta();
      return;
    }
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
    const controlesObrigatorios = ["resposta", "novaSenha", "perguntaSegurancaId", "respostaSegurancaCadastro"];
    const invalido = controlesObrigatorios.some((c) => this.formDefinir.controls[c].invalid);
    if (invalido) {
      this.formDefinir.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const email = this.formSolicitar.value.email;
    const { resposta, novaSenha, perguntaSegurancaId, respostaSegurancaCadastro } = this.formDefinir.value;
    this._auth
      .definirSenhaPorDesafio({
        email,
        resposta,
        novaSenha,
        perguntaSegurancaId,
        respostaSeguranca: respostaSegurancaCadastro,
      })
      .subscribe({
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

  private _definirSenhaPorPergunta(): void {
    const controlesObrigatorios = ["respostaPerguntaPessoal", "novaSenha"];
    const invalido = controlesObrigatorios.some((c) => this.formDefinir.controls[c].invalid);
    if (invalido) {
      this.formDefinir.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const email = this.formSolicitar.value.email;
    const { respostaPerguntaPessoal, novaSenha } = this.formDefinir.value;
    this._auth
      .definirSenhaPorPergunta({ email, resposta: respostaPerguntaPessoal, novaSenha })
      .subscribe({
        next: (mensagem) => {
          this._message.add({ severity: "success", summary: "Senha definida", detail: mensagem });
          this.formLogin.patchValue({ email });
          this.mostrarPerguntaPessoal = false;
          this.modo = "login";
        },
        error: (error) => {
          this.isLoading = false;
          this._message.add({
            severity: "error",
            summary: "Não foi possível definir a senha",
            detail: error?.error?.data?.mensagemTela ?? "Tente novamente.",
          });
          this._logger.logError(error, "entrar:definir-senha-pergunta");
        },
        complete: () => (this.isLoading = false),
      });
  }
}
