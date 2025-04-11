import { CommonModule, NgIf } from "@angular/common";
import { Component, inject } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ChurchesService } from "../../../../core/services/churches.service";
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
  private _router = inject(Router);
  private _service = inject(ChurchesService);
  private _toast = inject(MessageService);

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
    this._route.queryParams.subscribe((params) => {
      this.email = params["email"];
      this.controleId = params["controleId"];
    });
  }

  validateCode(): void {
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
        this._toast.add({
          severity: "success",
          summary: "Aviso!",
          detail: "Igreja cadastrada com sucesso",
        });
        setTimeout(() => {
          this._router.navigate(["/detalhes", response.data.endereco.cep]);
        }, 2000);
        this.isLoading = false;
      },
      error: (error) => {
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
}
