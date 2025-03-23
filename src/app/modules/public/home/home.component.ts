import { Component, OnInit, inject } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import {
  FormControl,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { MessageService } from "primeng/api";
import { STATES } from "../../../core/constants/states";
import { WEEK_DAYS } from "../../../core/constants/weekdays";
import { PrimeNgModule } from "../../../core/shared/primeng.module";
import {
  Church,
  FilterSearchChurch,
  Mass,
  ResponseAddress,
} from "../../../core/interfaces/church.interface";
import { HttpErrorResponse } from "@angular/common/http";

@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
  providers: [MessageService, DatePipe],
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.scss"],
})
export class HomeComponent {
  private _churchService = inject(ChurchesService);
  private _toast = inject(MessageService);
  private _datePipe = inject(DatePipe);

  public isLoading = false;
  public isLoadingAddress = false;
  public isLoadingCities = false;
  public isLoadingDistricts = false;

  public churchInfo: Church[] = [];
  public cities: any[] = [];
  public districts: any[] = [];
  public states = STATES;
  public weakDays = WEEK_DAYS;

  totalItems: number = 0;
  pageSize: number = 10;
  pageIndex: number = 1;

  public form: FormGroup = new FormGroup({
    Uf: new FormControl(null, Validators.required),
    Localidade: new FormControl({ value: "", disabled: true }),
    Bairro: new FormControl({ value: "", disabled: true }),
    DiaDaSemana: new FormControl(),
    Horario: new FormControl(),
  });

  ngOnInit(): void {
    // const currentTime = new Date();
    // currentTime.setSeconds(0);
    // currentTime.setMilliseconds(0);
    // currentTime.setMinutes(0); // Define os minutos como 00
  
    // this.form.patchValue({
    //   Horario: currentTime
    // });
  }

  public getAddress(uf: string, localidade?: string, bairro?: string): void {
    if (!uf) return;

    this.isLoadingAddress = true;
    this.isLoadingCities = !!localidade;
    this.isLoadingDistricts = !!bairro;

    this._churchService.addressRange(uf, localidade, bairro).subscribe({
      next: ({ data }: ResponseAddress) => {
        this.cities = data.localidades || [];
        this.districts = data.bairros || [];

        if (localidade) {
          this.form.get("Localidade")?.setValue(localidade);
        }
        if (bairro) {
          this.form.get("Bairro")?.setValue(bairro);
        }

        this.updateFormFields();
      },
      error: () => {
        this._toast.add({
          severity: "error",
          summary: "Erro ao carregar dados",
          detail: "Não foi possível carregar as cidades e bairros.",
        });
      },
      complete: () => {
        this.isLoadingAddress = false;
        this.isLoadingCities = false;
        this.isLoadingDistricts = false;
      },
    });
  }

  public searchFilter(): void {
    if (this.isLoading || this.form.invalid) return;
    this.isLoading = true;
  
    const filters: FilterSearchChurch = {
      ...this.form.value,
      Horario: this._datePipe.transform(this.form.value.Horario, "HH:mm"),
      "Paginacao.PageIndex": this.pageIndex,
      "Paginacao.PageSize": this.pageSize,
    };
  
    this._churchService.searchByFilters(filters).subscribe({
      next: (data: any) => {
        this.churchInfo = data.data.items;
  
        // Se não encontrar nenhuma igreja, exibe um aviso
        if (!this.churchInfo.length) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.error.status === 404) {
          this._toast.add({
            severity: "warn",
            summary: "Nenhuma igreja encontrada",
            detail: "Não encontramos igrejas para os filtros aplicados.",
          });
          this.isLoading = false;
        } else {
          this._toast.add({
            severity: "error",
            summary: "Erro na busca",
            detail: "Não foi possível buscar igrejas.",
          });
          this.isLoading = false;
        }
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
  

  clearFilter() {
    this.form.reset();
    this.cities = [];
    this.districts = [];
    this.form.get("Localidade")?.disable();
    this.form.get("Bairro")?.disable();
  }

  editChurch() {
    console.log("ok");
  }

  reportChurch(emailContato: string): void {
    if (emailContato) {
      // Aqui você pode abrir o cliente de email ou executar qualquer lógica necessária
      window.location.href = `mailto:${emailContato}`;
    } else {
      this._toast.add({
        severity: "warn",
        summary: "Erro",
        detail: "Email de contato não disponível.",
      });
    }
  }

  // Converte dia da semana de número para nome
  getDayName(dia: number): string {
    const daysOfWeek = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
    return daysOfWeek[dia] || "Desconhecido";
  }

  getFormattedMasses(missas: Mass[]): { horario: string; observacao: string }[] {
    const daysOfWeek = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
  
    return daysOfWeek
      .map((day, index) => {
        const filteredMasses = missas.filter((missa) => missa.diaSemana === index);
        if (filteredMasses.length > 0) {
          return filteredMasses.map((missa) => ({
            horario: `${day}: ${this.formatTime(missa.horario)}`,
            observacao: missa.observacao || "Sem observação", // Adiciona observação
          }));
        }
        return [];
      })
      .flat();
  }
  

  formatTime(timeString: string): string {
    const [hours, minutes] = timeString.split(":");
    return `${parseInt(hours, 10)}:${minutes}`;
  }

  private updateFormFields(): void {
    const { form, cities, districts } = this;

    if (cities.length > 0) {
      form.get("Localidade")?.enable();
    } else {
      form.get("Localidade")?.disable();
    }

    if (districts.length > 0) {
      form.get("Bairro")?.enable();
    } else {
      form.get("Bairro")?.disable();
    }
  }

  getSocialIcon(url: string): string {
    if (url.includes('facebook.com')) return 'pi pi-facebook';
    if (url.includes('instagram.com')) return 'pi pi-instagram';
    if (url.includes('youtube.com')) return 'pi pi-youtube';
    if (url.includes('tiktok.com')) return 'pi pi-video'; // Não há ícone oficial do TikTok no PrimeIcons
  
    return 'pi pi-globe'; // Ícone padrão caso não encontre
  }
  
}
