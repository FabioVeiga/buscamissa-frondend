import { Component, inject, OnInit } from "@angular/core";
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { ChurchesService } from "../../../../core/services/churches.service";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../core/shared/primeng.module";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";

@Component({
  selector: "app-details",
  imports: [PrimeNgModule, CommonModule, FormsModule, ReactiveFormsModule],
  providers: [MessageService],
  templateUrl: "./details.component.html",
  styleUrl: "./details.component.scss",
})
export class DetailsComponent implements OnInit {
  _toast = inject(MessageService);
  _church = inject(ChurchesService);
  _route = inject(ActivatedRoute);
  form!: FormGroup;
  isLoading = false;
  churchId: number | null = null;
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
      nomeParoco: [""],
      cep: ["", Validators.pattern(/^\d{5}-\d{3}$/)],
      endereco: [""],
      numero: [""],
      complemento: [""],
      bairro: [""],
      cidade: [""],
      estado: [""],
      uf: [""],
      regiao: [""],
      telefone: ["", Validators.pattern(/^\(\d{2}\) \d{4}-\d{4}$/)],
      whatsapp: ["", Validators.pattern(/^\(\d{2}\) \d{5}-\d{4}$/)],
      emailContato: ["", Validators.email],
      facebook: [""],
      instagram: [""],
      youtube: [""],
      tiktok: [""],
      imagem: [""],
      missas: this.fb.array([]),
    });

    this._route.params.subscribe((params) => {
      this.churchId = +params["id"]; // O '+' converte a string para número
      if (this.churchId) {
        this.loadChurchForEdit(this.churchId);
        // this.loadInfo()
        // this.form.get("cep")?.disable();
      } else {
        this.adicionarHorario(); // Add an initial empty horario for new churches
      }
    });
  }

  loadInfo(){
    this._church.getInfo().subscribe({
      next: (data: any) => { console.log(data)}
    })
  }

  // Função para carregar os dados da igreja para edição
  loadChurchForEdit(id: number): void {
    this.isLoading = true;
    this._church.searchUpdates(id).subscribe({
      next: (response: any) => {
        console.log(response);
        const igreja = response?.data; // Ajuste conforme a sua API
        if (igreja) {
          this.form?.patchValue({
            nomeIgreja: igreja.nome,
            nomeParoco: igreja.paroco,
            cep: igreja.endereco?.cep || "",
            endereco: igreja.endereco?.logradouro || "",
            numero: igreja.endereco?.numero || "",
            complemento: igreja.endereco?.complemento || "",
            bairro: igreja.endereco?.bairro || "",
            cidade: igreja.endereco?.localidade || "",
            estado: igreja.endereco?.estado || "",
            uf: igreja.endereco?.uf || "",
            regiao: igreja.endereco?.regiao || "",
            telefone: igreja.contato?.telefone
              ? `${igreja.contato.ddd}${igreja.contato.telefone}`
              : "",
            whatsapp: igreja.contato?.telefoneWhatsApp
              ? `${igreja.contato.dddWhatsApp}${igreja.contato.telefoneWhatsApp}`
              : "",
            emailContato: igreja.contato?.emailContato || "",
            facebook: this.getSocialMedia(igreja.redesSociais, 1),
            instagram: this.getSocialMedia(igreja.redesSociais, 2),
            youtube: this.getSocialMedia(igreja.redesSociais, 3),
            tiktok: this.getSocialMedia(igreja.redesSociais, 4),
            imagem: igreja.imagemUrl, // Se a API retornar a URL da imagem
          });
          this.limparHorarios();
          igreja.missasTemporaria?.forEach((missa: any) => {
            const horario = missa.horario
              ? this.stringParaDate(missa.horario)
              : null;
            this.horarios.push(
              this.fb.group({
                id: [missa.id], // Se a missa tiver um ID
                diaSemana: [missa.diaSemana, Validators.required],
                horario: [
                  horario,
                  [Validators.required, this.minutosValidos()],
                ],
                observacao: [missa.observacao],
              })
            );
          });
        } else {
          this._toast.add({
            severity: "error",
            summary: "Erro",
            detail: "Dados da igreja não encontrados.",
          });
        }
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this._toast.add({
          severity: "error",
          summary: "Erro",
          detail: "Erro ao carregar dados da igreja para edição.",
        });
        console.error(error);
      },
    });
  }

  // Função para buscar a URL de uma rede social específica
  private getSocialMedia(redes: any[], tipo: number): string {
    const rede = redes?.find((r) => r.tipoRedeSocial === tipo);
    return rede ? rede.url : "";
  }

  minutosValidos(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (control.value) {
        let horario = control.value;

        // Se for um objeto Date, converta para string no formato "HH:mm:ss"
        if (horario instanceof Date) {
          const hours = horario.getHours().toString().padStart(2, "0");
          const minutes = horario.getMinutes().toString().padStart(2, "0");
          const seconds = horario.getSeconds().toString().padStart(2, "0");
          horario = `${hours}:${minutes}:${seconds}`; // Converte para "HH:mm:ss"
        }

        const [hours, minutes] = horario
          .split(":")
          .map((val: string) => parseInt(val, 10));

        if (![0, 15, 30, 45].includes(minutes)) {
          return { minutosInvalidos: true };
        }
      }
      return null;
    };
  }

  get horarios(): FormArray {
    return this.form.get("missas") as FormArray;
  }

  limparHorarios(): void {
    while (this.horarios.length !== 0) {
      this.horarios.removeAt(0); // Remove um por um
    }
  }

  adicionarHorario(): void {
    this.horarios.push(
      this.fb.group({
        id: [null],
        diaSemana: [null, Validators.required],
        horario: [null, [Validators.required, this.minutosValidos()]],
        observacao: [""],
      })
    );
  }

  removerHorario(index: number): void {
    this.horarios.removeAt(index);
  }

  stringParaDate(horario: string): Date {
    const [hourStr, minuteStr, secondStr = '00'] = horario?.split(":");

    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);
    const seconds = parseInt(secondStr, 10);

    // Criamos um objeto Date com a data padrão e apenas alteramos as horas, minutos e segundos
    const date = new Date();
    date.setHours(hours, minutes, seconds, 0); // Setando a hora, minutos e segundos

    return date;
  }

  dateParaString(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0"); // Adiciona zero à esquerda se necessário
    const minutes = date.getMinutes().toString().padStart(2, "0"); // Adiciona zero à esquerda se necessário
    const seconds = date.getSeconds().toString().padStart(2, "0"); // Adiciona zero à esquerda se necessário

    return `${hours}:${minutes}:${seconds}`;
  }
}