import { CommonModule } from "@angular/common";
import { Component, DestroyRef, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ChurchesService } from "../../../../core/services/churches.service";
import { ClarityService } from "../../../../core/services/clarity.service";
import { ActivatedRoute, Router } from "@angular/router";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { LoadingComponent } from "../../../../core/components/loading/loading.component";
import { MessageService } from "primeng/api";
import { environment } from "../../../../../environments/environment";

@Component({
  selector: "app-validate-code",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    PrimeNgModule,
    LoadingComponent,
  ],
  providers: [MessageService],
  templateUrl: "./validate-code.component.html",
  styleUrl: "./validate-code.component.scss",
})
export class ValidateCodeComponent {
  private _fb = inject(FormBuilder);
  private _route = inject(ActivatedRoute);
  private _destroyRef = inject(DestroyRef);
  private _router = inject(Router);
  private _service = inject(ChurchesService);
  private _toast = inject(MessageService);
  private _clarity = inject(ClarityService);

  isLoading = false;
  form: FormGroup;
  email: string = "";
  controleId: number = 0;

  // Validação por desafio matemático (MailerSend indisponível) — ver
  // environment.features.validacaoSemEmail.
  validacaoSemEmail = (environment as any).features?.validacaoSemEmail === true;
  perguntaDesafio = "";
  formDesafio: FormGroup;

  constructor() {
    this.form = this._fb.group({
      codigoValidador: [
        "",
        [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
      ],
    });
    this.formDesafio = this._fb.group({
      resposta: [null, Validators.required],
    });
  }

  ngOnInit(): void {
    this._route.queryParams.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((params) => {
      this.email = params["email"];
      this.controleId = params["controleId"];
    });
    this._clarity.track('contrib_tela_confirmacao');
    if (this.validacaoSemEmail) this.carregarDesafio();
  }

  carregarDesafio(): void {
    this.isLoading = true;
    this._service.getDesafio(this.controleId).subscribe({
      next: (response: any) => {
        this.perguntaDesafio = response?.data?.pergunta ?? "";
        this.formDesafio.reset();
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this._toast.add({
          severity: "info",
          summary: "Aviso!",
          detail: error.error?.data?.mensagemTela ?? "Não foi possível carregar o desafio.",
        });
      },
    });
  }

  validarDesafio(): void {
    this._clarity.track('contrib_desafio_confirmado');
    if (this.formDesafio.invalid) {
      this._toast.add({ severity: "info", summary: "Aviso!", detail: "Informe a resposta." });
      return;
    }
    this.isLoading = true;

    const payload = {
      controleId: this.controleId,
      email: this.email,
      resposta: Number(this.formDesafio.value.resposta),
    };

    this._service.validateDesafio(payload).subscribe({
      next: (response: any) => {
        this._clarity.track('contrib_sucesso');
        this._toast.add({
          severity: "success",
          summary: "Aviso!",
          detail: response.data?.mensagemTela,
        });
        setTimeout(() => {
          this._router.navigate(["/detalhes", response.data.cep]);
        }, 2000);
        this.isLoading = false;
      },
      error: (error) => {
        this._clarity.track('contrib_erro_desafio');
        this.isLoading = false;
        this._toast.add({
          severity: "info",
          summary: "Aviso!",
          detail: error.error?.data?.mensagemTela ?? error.error?.data,
        });
        // Desafio expirado → busca um novo automaticamente
        if (error.error?.data?.desafioExpirado) this.carregarDesafio();
      },
    });
  }

  validateCode(): void {
    this._clarity.track('contrib_codigo_confirmado');
    this.isLoading = true;
    if (this.form.invalid) {
      this._toast.add({
        severity: "info",
        summary: "Aviso!",
        detail: "Código inválido.",
      });
      this.isLoading = false;
      return;
    }

    const payload = {
      controleId: this.controleId,
      codigoValidador: this.form.value.codigoValidador,
      email: this.email,
    };

    this._service.validateCode(payload).subscribe({
      next: (response: any) => {
        this._clarity.track('contrib_sucesso');
        this._toast.add({
          severity: "success",
          summary: "Aviso!",
          detail: response.data?.mensagemTela,
        });
        setTimeout(() => {
          this._router.navigate(["/detalhes", response.data.cep]);
        }, 2000);
        this.isLoading = false;
      },
      error: (error) => {
        this._clarity.track('contrib_erro_codigo');
        this._toast.add({
          severity: "info",
          summary: "Aviso!",
          detail: error.error?.data?.mensagemTela ?? error.error?.data,
        });
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  resendCode(): void {
    this._router.navigateByUrl(`/enviar-codigo/${this.controleId}`);
  }
}
