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
import { finalize } from "rxjs/operators";
import { ChurchesService } from "../../../../core/services/churches.service";
import { SeoService } from "../../../../core/services/seo.service";
import { SkeletonModule } from "primeng/skeleton";
import { MessageService } from "primeng/api";
import { PrimeNgModule } from "../../../../shared/primeng.module";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { Location } from "@angular/common";
import { ShareButtons } from "ngx-sharebuttons/buttons";
import { Mass } from "../../church/models/church.model";
import { Church } from "../../../../core/interfaces/church.interface";

@Component({
  selector: "app-details",
  imports: [
    PrimeNgModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ShareButtons,
    SkeletonModule,
  ],
  providers: [MessageService],
  templateUrl: "./details.component.html",
  styleUrl: "./details.component.scss",
})
export class DetailsComponent implements OnInit {
  _toast = inject(MessageService);
  _church = inject(ChurchesService);
  _seo = inject(SeoService);
  _route = inject(ActivatedRoute);
  _router = inject(Router);
  _location = inject(Location);
  form!: FormGroup;
  isLoading = false;
  nomeUnico: string | null = null;
  diasSemana = [
    { key: 0, label: "Domingo" },
    { key: 1, label: "Segunda-feira" },
    { key: 2, label: "Terça-feira" },
    { key: 3, label: "Quarta-feira" },
    { key: 4, label: "Quinta-feira" },
    { key: 5, label: "Sexta-feira" },
    { key: 6, label: "Sábado" },
  ];
  churchInfo: any;
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
      this.nomeUnico = params["nomeUnico"] ?? null;
      if (this.nomeUnico) {
        this.loadChurch(this.nomeUnico);
        this.form.disable();
      } else {
        this.adicionarHorario();
      }
    });
  }

  loadChurch(nomeUnico: string): void {
    this.isLoading = true;
    this._church.getByNomeUnico(nomeUnico).pipe(
      finalize(() => { this.isLoading = false; })
    ).subscribe({
      next: (response: any) => {
        const igreja = response?.data?.igreja ?? response?.data;
        this.churchInfo = igreja;
        if (igreja) {
          this._seo.update({
            title: `${igreja.nome} | BuscaMissa`,
            description: `Veja os horários de missa, endereço e contato de ${igreja.nome}. Encontre missas perto de você no BuscaMissa.`,
          });
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
            imagem: igreja.imagemUrl,
          });
          this.limparHorarios();
          (igreja.missas ?? []).forEach((missa: any) => {
            const horario = missa.horario
              ? this.stringParaDate(missa.horario)
              : null;
            this.horarios.push(
              this.fb.group({
                id: [missa.id],
                diaSemana: [missa.diaSemana, Validators.required],
                horario: [horario, [Validators.required, this.minutosValidos()]],
                observacao: [missa.observacao],
              })
            );
          });
          if (this.horarios.length > 0) {
            this.horarios.disable();
          }
        } else {
          this._toast.add({
            severity: "error",
            summary: "Erro",
            detail: "Dados da igreja não encontrados.",
          });
          this._router.navigate(['/nova']);
        }
      },
      error: (error) => {
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
    const [hourStr, minuteStr, secondStr = "00"] = horario?.split(":");

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

  voltar() {
    this._location.back();
  }

  getFormattedMasses(missas: Mass[]): { diaLabel: string; horarios: string; observacao: string }[] {
    const days = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    const grouped: { [key: number]: Mass[] } = {};
    missas.forEach(m => {
      if (m.diaSemana !== undefined) {
        grouped[m.diaSemana] = grouped[m.diaSemana] || [];
        grouped[m.diaSemana].push(m);
      }
    });
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map(day => {
        const ms = grouped[day];
        const horarios = ms
          .map(m => this.formatTime(m.horario))
          .sort((a, b) => {
            const [h1, m1] = a.split(':').map(Number);
            const [h2, m2] = b.split(':').map(Number);
            return h1 - h2 || m1 - m2;
          })
          .join(', ');
        return { diaLabel: days[day], horarios, observacao: ms[0]?.observacao || 'Sem observação' };
      });
  }

  formatTime(t: string): string {
    const [h, m] = t.split(':');
    return `${parseInt(h, 10)}:${m}`;
  }

  getSocialIcon(url: string): string {
    if (url.includes('facebook.com')) return 'pi pi-facebook';
    if (url.includes('instagram.com')) return 'pi pi-instagram';
    if (url.includes('youtube.com')) return 'pi pi-youtube';
    if (url.includes('tiktok.com')) return 'pi pi-tiktok';
    return 'pi pi-globe';
  }

  editChurch(church: any) {
    this._router.navigate(['/editar', church.id]);
  }

  confirmarHorarios() {
    // R3 — placeholder para endpoint POST /horarios/confirmar
    this._toast.add({ severity: 'success', summary: 'Obrigado!', detail: 'Sua confirmação ajuda outras pessoas da comunidade.' });
  }

  reportarErro() {
    // R3 — placeholder para fluxo de reporte
    this._toast.add({ severity: 'info', summary: 'Obrigado pelo aviso!', detail: 'Vamos verificar as informações em breve.' });
  }

  // ── Helpers do card de confiança ──────────────────────────────────────────

  /** Retorna a missa com maior score de confiança */
  getBestMissa(missas: Mass[]): Mass | null {
    if (!missas?.length) return null;
    return missas.reduce((best, m) =>
      (m.scoreConfianca ?? 0) > (best.scoreConfianca ?? 0) ? m : best
    );
  }

  /** Retorna a data de última validação mais recente */
  getUltimaValidacao(missas: Mass[]): string | null {
    if (!missas?.length) return null;
    const datas = missas
      .filter(m => m.ultimaValidacao)
      .map(m => new Date(m.ultimaValidacao!));
    if (!datas.length) return null;
    return datas.reduce((a, b) => (a > b ? a : b)).toISOString();
  }

  getConfiancaDotClass(missa: Mass | null): string {
    const s = missa?.statusConfianca ?? 0;
    return s === 3 ? 'bg-green-500' : s === 2 ? 'bg-yellow-500' : s === 1 ? 'bg-orange-500' : 'bg-red-400';
  }

  getConfiancaIconClass(missa: Mass | null): string {
    const s = missa?.statusConfianca ?? 0;
    return s === 3 ? 'bg-green-500' : s === 2 ? 'bg-yellow-500' : s === 1 ? 'bg-orange-500' : 'bg-gray-400';
  }

  getConfiancaIcon(missa: Mass | null): string {
    const s = missa?.statusConfianca ?? 0;
    return s === 3 ? 'pi pi-check' : s === 2 ? 'pi pi-clock' : s === 1 ? 'pi pi-exclamation-triangle' : 'pi pi-question';
  }

  getConfiancaTextClass(missa: Mass | null): string {
    const s = missa?.statusConfianca ?? 0;
    return s === 3 ? 'text-green-700' : s === 2 ? 'text-yellow-700' : s === 1 ? 'text-orange-700' : 'text-red-600';
  }
}
