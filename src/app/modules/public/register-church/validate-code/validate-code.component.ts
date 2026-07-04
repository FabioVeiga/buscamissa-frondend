import { CommonModule, NgIf } from "@angular/common";
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

  constructor() {
    this.form = this._fb.group({
      codigoValidador: [
        "",
        [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
      ],
    });
  }

  ngOnInit(): void {
    this._route.queryParams.pipe(takeUntilDestroyed(this._destroyRef)).subscribe((params) => {
      this.email = params["email"];
      this.controleId = params["controleId"];
    });
    this._clarity.track('contrib_tela_confirmacao');
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
