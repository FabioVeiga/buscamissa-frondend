import { MatCardModule } from "@angular/material/card";
import { Component, inject } from "@angular/core";
import { ChurchesService } from "../../../core/services/churches.service";
import { HttpErrorResponse } from "@angular/common/http";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatOptionModule } from "@angular/material/core";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatDividerModule } from "@angular/material/divider";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";

@Component({
  selector: "app-register-church",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatOptionModule,
    MatCheckboxModule,
    MatCardModule,
    MatDividerModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: "./register-church.component.html",
  styleUrl: "./register-church.component.scss",
})
export class RegisterChurchComponent {
  private _church = inject(ChurchesService);
  public isLoading = false;
  public churchInfo: any;

  igrejaForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.search("12241080");
    this.igrejaForm = this.fb.group({
      // bairro: [""],
      // cep: [""],
      // endereco: [""],
      // complemento: [""],
      // estado: [""],
      // localidade: [""],
      // logradouro: [""],
      // regiao: [""],
      // uf: [""]
    });
  }

  search(cpf: string) {
    this.isLoading = true;
    this._church.searchByCEP(cpf).subscribe({
      next: (response: any) => {
        if (!response.data.messagemAplicacao) {
          this.churchInfo = response.data.response;
          console.log(this.churchInfo);
          // this.igrejaForm.patchValue(this.churchInfo.endereco);
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error(error.message);
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  send() {
    console.log(this.igrejaForm.value);
  }
}
