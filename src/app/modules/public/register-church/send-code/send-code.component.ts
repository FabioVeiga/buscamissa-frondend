import { CommonModule } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ChurchesService } from "../../../../core/services/churches.service";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatSnackBar } from "@angular/material/snack-bar";
import { NgIf } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-send-code",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgIf,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
  ],
  templateUrl: "./send-code.component.html",
  styleUrl: "./send-code.component.scss",
})
export class SendCodeComponent implements OnInit {
  private _fb = inject(FormBuilder);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _service = inject(ChurchesService);
  private _snackbar = inject(MatSnackBar);

  controleId!: number;
  form!: FormGroup;

  ngOnInit(): void {
    this.controleId = Number(this._route.snapshot.paramMap.get("controleId"));
    this.form = this._fb.group({
      nome: ["", Validators.required],
      email: ["", [Validators.required, Validators.email]],
      aceitarTermo: [false, Validators.requiredTrue],
      aceitarPromocao: [false],
    });
  }

  generateValidationCode(): void {
    if (this.form.invalid) {
      this._snackbar.open("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    const body = {
      nome: this.form.value.nome,
      email: this.form.value.email,
      controleId: this.controleId,
      aceitarTermo: this.form.value.aceitarTermo,
      aceitarPromocao: this.form.value.aceitarPromocao,
    };
    this._service.generateCode(body).subscribe({
      next: (response: any) => {
        if (response?.data?.mensagemTela) {
          this._router.navigate(["/validar"], {
            queryParams: {
              email: body.email,
              controleId: response.data.controleId,
            },
          });
        } else {
          this._snackbar.open(response?.data?.mensagemTela);
        }
      },
      error: (error: any) => {
        console.log("Erro ao gerar código", error);
      },
    });
  }
}
