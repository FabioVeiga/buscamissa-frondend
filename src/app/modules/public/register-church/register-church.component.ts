import { CommonModule } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatOptionModule } from "@angular/material/core";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { ChurchesService } from "../../../core/services/churches.service";
import { HttpErrorResponse } from "@angular/common/http";
import { MatSelectModule } from "@angular/material/select";

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
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
  ],
  templateUrl: "./register-church.component.html",
  styleUrls: ["./register-church.component.scss"],
})
export class RegisterChurchComponent implements OnInit {
  _church = inject(ChurchesService);
  form!: FormGroup;
  diaSelecionado: number | null = null;

  diasSemana = [
    { key: 0, label: "Domingo" },
    { key: 1, label: "Segunda-feira" },
    { key: 2, label: "Terça-feira" },
    { key: 3, label: "Quarta-feira" },
    { key: 4, label: "Quinta-feira" },
    { key: 5, label: "Sexta-feira" },
    { key: 6, label: "Sábado" },
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      nomeIgreja: ["", Validators.required],
      nomeParoco: ["", Validators.required],
      cep: [""],
      endereco: [""],
      numero: [""],
      bairro: [""],
      cidade: [""],
      estado: [""],
      telefone: [""],
      whatsapp: [""],
      missas: this.fb.array([]), // FormArray para armazenar os horários
    });
  }

  // Função para buscar o endereço pelo CEP.
  getCEP() {
    this._church.searchByCEP(this.form.get("cep")?.value).subscribe({
      next: (response: any) => {
        const address = response.data[0].endereco;
        this.form.get("endereco")?.setValue(address.logradouro);
        this.form.get("bairro")?.setValue(address.bairro);
        this.form.get("cidade")?.setValue(address.localidade);
        this.form.get("estado")?.setValue(address.uf);
      },
      error: (error: HttpErrorResponse) => {
        console.error(error);
      },
    });
  }

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  adicionarHorario(): void {
    this.horarios.push(
      this.fb.group({
        diaSemana: null, // Dropdown do dia da semana
        horario: "", // Campo de horário
        observacao: "", // Observação
      })
    );
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  // Função de submissão
  submit(): void {
    console.log(this.form.value); // Aqui você pode processar o formulário
  }
}
