import { CommonModule, NgIf } from "@angular/common";
import {
  Component,
  ElementRef,
  inject,
  QueryList,
  ViewChildren,
} from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { ChurchesService } from "../../../../core/services/churches.service";
import { ActivatedRoute, Router } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";

@Component({
  selector: "app-validate-code",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    FormsModule,
  ],
  templateUrl: "./validate-code.component.html",
  styleUrl: "./validate-code.component.scss",
})
export class ValidateCodeComponent {
  private _fb = inject(FormBuilder);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _service = inject(ChurchesService);
  private _snackbar = inject(MatSnackBar);

  form: FormGroup;
  email: string = "";
  controleId: number = 0;
  code: string[] = ["", "", "", "", "", ""];

  @ViewChildren("codeInput") codeInputs!: QueryList<ElementRef>;

  constructor() {
    this.form = this._fb.group({
      codigoValidador: ["", Validators.required],
    });
  }

  ngOnInit(): void {
    this._route.queryParams.subscribe((params) => {
      this.email = params["email"];
      this.controleId = params["controleId"];
    });
  }

  moveFocus(event: any, index: number) {
    if (event.inputType !== "deleteContentBackward" && event.target.value) {
      const nextInput = this.codeInputs.toArray()[index + 1];
      if (nextInput) {
        nextInput.nativeElement.focus();
      }
    }
  }

  handleBackspace(event: any, index: number) {
    if (!this.code[index] && index > 0) {
      const prevInput = this.codeInputs.toArray()[index - 1];
      if (prevInput) {
        prevInput.nativeElement.focus();
      }
    }
  }

  isCodeComplete(): boolean {
    return this.code.every((digit) => digit !== "");
  }

  validateCode(): void {
    if (this.form.invalid) {
      this._snackbar.open('Código inválido!');
      return;
    }

    const payload = {
      controleId: this.controleId,
      codigoValidador: this.form.value.codigoValidador,
      email: this.email,
    };

    this._service.validateCode(payload).subscribe({
      next: (response: any) => {
        this._snackbar.open(response);
        this._router.navigate(["/sucesso"]);
      },
      error: (error: Error) => {
        console.error("Erro ao validar código:", error);
      },
    });
  }

  resendCode() {
    console.log("Reenviando código para", this.email);
    // Lógica para reenviar código aqui
  }
}
