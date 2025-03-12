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
import { horarioMinutosValidator } from "../../../core/misc/validator-minute";
import { NgxMaskDirective, NgxMaskPipe, provideNgxMask } from "ngx-mask";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";

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
    MatDividerModule,
    NgxMaskDirective,
  ],
  providers: [provideNgxMask()],
  templateUrl: "./register-church.component.html",
  styleUrls: ["./register-church.component.scss"],
})
export class RegisterChurchComponent implements OnInit {
  _snackbar = inject(MatSnackBar);
  _church = inject(ChurchesService);
  _router = inject(Router);
  form!: FormGroup;
  diaSelecionado: number | null = null;
  imageName = "";
  alter = false;
  id: number = 0;

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
      numero: ["", Validators.required],
      complemento: [""],
      bairro: [""],
      cidade: [""],
      estado: [""],
      uf: [""],
      regiao: [""],
      telefone: [""],
      whatsapp: [""],
      emailContato: [""],
      missas: this.fb.array([], Validators.required),
      facebook: [""],
      instagram: [""],
      tiktok: [""],
      youtube: [""],
      imagem: [""],
    });
  }

  // Função para buscar o endereço pelo CEP.
  getCEP() {
    this._church.searchByCEP(this.form.get("cep")?.value).subscribe({
      next: (response: any) => {
        if (
          response.data.messagemAplicacao ===
          "Habilitar para usuario editar e validar!"
        ) {
          const igreja = response.data.response;
          this.alter = true;
          // Preenche os dados no formulário
          this.id = igreja.id;
          this.form.patchValue({
            nomeIgreja: igreja.nome,
            nomeParoco: igreja.paroco,
            cep: igreja.endereco.cep,
            endereco: igreja.endereco.logradouro,
            numero: igreja.endereco.numero,
            complemento: igreja.endereco.complemento,
            bairro: igreja.endereco.bairro,
            imagem: igreja.imagemUrl,
            cidade: igreja.endereco.localidade,
            estado: igreja.endereco.uf,
            uf: igreja.endereco.uf,
            regiao: igreja.endereco.regiao,
            telefone: `${igreja.contato.ddd}${igreja.contato.telefone}`,
            whatsapp: `${igreja.contato.dddWhatsApp}${igreja.contato.telefoneWhatsApp}`,
            emailContato: igreja.contato.emailContato,
            facebook: this.getSocialMedia(igreja.redesSociais, 1),
            instagram: this.getSocialMedia(igreja.redesSociais, 2),
            youtube: this.getSocialMedia(igreja.redesSociais, 3),
            tiktok: this.getSocialMedia(igreja.redesSociais, 4),
          });

          // Limpa o array de missas antes de adicionar novas
          this.horarios.clear();
          igreja.missas.forEach((missa: any) => {
            this.horarios.push(
              this.fb.group({
                id: [missa.id],
                diaSemana: [missa.diaSemana, Validators.required],
                horario: [
                  missa.horario,
                  [Validators.required, horarioMinutosValidator()],
                ],
                observacao: [missa.observacao],
              })
            );
          });

          // Desabilita os campos necessários
          this.disableFields();
        }
      },
      error: (error) => {
        if (error.status === 404 && error.error?.data?.endereco) {
          const endereco = error.error.data.endereco;
          this.form.patchValue({
            endereco: endereco.logradouro,
            numero: endereco.complemento,
            bairro: endereco.bairro,
            cidade: endereco.localidade,
            estado: endereco.estado,
            uf: endereco.uf,
            regiao: endereco.regiao,
          });

          this.disableAddressFields();

          this._snackbar.open(error.error.data.messagemAplicacao, "OK", {
            duration: 5000,
            panelClass: "warning-snackbar",
          });
        } else {
          console.error("Ocorreu um erro ao buscar o CEP.", error);
        }
      },
    });
  }

  disableAddressFields() {
    this.form.get("cep")?.disable();
    this.form.get("endereco")?.disable();
    this.form.get("bairro")?.disable();
    this.form.get("cidade")?.disable();
    this.form.get("estado")?.disable();
    this.form.get("numero")?.enable();
  }

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  adicionarHorario(): void {
    this.horarios.push(
      this.fb.group({
        diaSemana: ["", [Validators.required]],
        horario: ["", [Validators.required, horarioMinutosValidator()]],
        observacao: "",
      })
    );
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  onImageSelect(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.imageName = file.name;
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(",")[1];
        this.form.get("imagem")?.setValue(base64Data);
      };
    }
  }

  // Função de submissão
  submit(): void {
    if (this.form.invalid) {
      console.log("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    // Captura os valores incluindo os campos desabilitados
    const formValues = this.form.getRawValue();
    const payload = {
      nome: formValues.nomeIgreja,
      paroco: formValues.nomeParoco,
      imagem: formValues.imagem,
      missas: formValues.missas.map((missa: any) => ({
        diaSemana: missa.diaSemana,
        horario: missa.horario,
        observacao: missa.observacao,
      })),
      endereco: {
        cep: formValues.cep,
        logradouro: formValues.endereco,
        complemento: formValues.complemento,
        bairro: formValues.bairro,
        localidade: formValues.cidade,
        uf: formValues.estado,
        estado: formValues.estado,
        regiao: formValues.regiao,
      },
      contato: {
        emailContato: formValues.emailContato,
        ddd: formValues.telefone?.substring(0, 2),
        telefone: formValues.telefone?.substring(2),
        dddWhatsApp: formValues.whatsapp?.substring(0, 2),
        telefoneWhatsApp: formValues.whatsapp?.substring(2),
      },
      redeSociais: [
        { tipoRedeSocial: 1, nomeDoPerfil: formValues.facebook },
        { tipoRedeSocial: 2, nomeDoPerfil: formValues.instagram },
        { tipoRedeSocial: 3, nomeDoPerfil: formValues.youtube },
        { tipoRedeSocial: 4, nomeDoPerfil: formValues.tiktok },
      ],
    };
    this._church.newChurch(payload).subscribe({
      next: (response: any) => {
        const controleId = response?.data?.response?.controleId;
        if (controleId) {
          this._router.navigate(['/enviar-codigo', controleId]);
        } else {
          console.log("Erro: controleId não encontrado na resposta");
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error("Ocorreu um erro ao cadastrar a igreja.", error);
      },
    });
  }

  // Função de submissão
  save(): void {
    if (this.form.invalid) {
      console.log("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    // Captura os valores incluindo os campos desabilitados
    const formValues = this.form.getRawValue();
    const payload = {
      id: this.id,
      paroco: formValues.nomeParoco,
      imagem: formValues.imagem,
      missas: formValues.missas.map((missa: any) => ({
        id: missa.id,
        diaSemana: missa.diaSemana,
        horario: missa.horario,
        observacao: missa.observacao,
      })),
      contato: {
        emailContato: formValues.emailContato,
        ddd: formValues.telefone?.substring(0, 2),
        telefone: formValues.telefone?.substring(2),
        dddWhatsApp: formValues.whatsapp?.substring(0, 2),
        telefoneWhatsApp: formValues.whatsapp?.substring(2),
      },
    }; 
    this._church.updateChurch(payload).subscribe({
      next: (response: any) => {
        const controleId = response?.data?.response?.controleId;
        if (controleId) {
          this._router.navigate(['/enviar-codigo', controleId]);
        } else {
          console.log("Erro: controleId não encontrado na resposta");
        }
      },
      error: (error: HttpErrorResponse) => {
        console.log(error);
      },
    });
  }

  // Função para buscar a URL de uma rede social específica
  private getSocialMedia(redes: any[], tipo: number): string {
    const rede = redes.find((r) => r.tipoRedeSocial === tipo);
    return rede ? rede.url : "";
  }

  // Função para desabilitar os campos após preenchimento
  private disableFields(): void {
    this.form.get("cep")?.disable();
    this.form.get("endereco")?.disable();
    this.form.get("numero")?.disable();
    this.form.get("bairro")?.disable();
    this.form.get("cidade")?.disable();
    this.form.get("estado")?.disable();
    this.form.get("facebook")?.disable();
    this.form.get("instagram")?.disable();
    this.form.get("tiktok")?.disable();
    this.form.get("complemento")?.disable();
    this.form.get("youtube")?.disable();
    this.form.get("nomeIgreja")?.disable();
  }
}
