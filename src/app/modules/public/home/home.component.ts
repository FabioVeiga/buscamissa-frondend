import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ChurchesService } from "../../../core/services/churches.service";
import { HttpErrorResponse } from "@angular/common/http";
import {
  Church,
  FilterSearchChurch,
  Mass,
  ResponseAddress,
} from "../../../core/interfaces/church.interface";
import { PrimeNgModule } from "../../../core/shared/primeng.module";
import { MessageService } from "primeng/api";
import { LoadingComponent } from "../../../core/components/loading/loading.component";

@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PrimeNgModule, LoadingComponent],
  providers: [MessageService],
  templateUrl: "./home.component.html",
  styleUrl: "./home.component.scss",
})
export class HomeComponent {
  private _church = inject(ChurchesService);
  private _toast = inject(MessageService);
  public isLoading = false;
  public churchInfo: any[] = [];
  totalItems: number = 0;
  pageSize: number = 10;
  pageIndex: number = 1;

  public states: any[] = [
    { sigla: "AC", nome: "Acre" },
    { sigla: "AL", nome: "Alagoas" },
    { sigla: "AP", nome: "Amapá" },
    { sigla: "AM", nome: "Amazonas" },
    { sigla: "BA", nome: "Bahia" },
    { sigla: "CE", nome: "Ceará" },
    { sigla: "DF", nome: "Distrito Federal" },
    { sigla: "ES", nome: "Espírito Santo" },
    { sigla: "GO", nome: "Goiás" },
    { sigla: "MA", nome: "Maranhão" },
    { sigla: "MT", nome: "Mato Grosso" },
    { sigla: "MS", nome: "Mato Grosso do Sul" },
    { sigla: "MG", nome: "Minas Gerais" },
    { sigla: "PA", nome: "Pará" },
    { sigla: "PB", nome: "Paraíba" },
    { sigla: "PR", nome: "Paraná" },
    { sigla: "PE", nome: "Pernambuco" },
    { sigla: "PI", nome: "Piauí" },
    { sigla: "RJ", nome: "Rio de Janeiro" },
    { sigla: "RN", nome: "Rio Grande do Norte" },
    { sigla: "RS", nome: "Rio Grande do Sul" },
    { sigla: "RO", nome: "Rondônia" },
    { sigla: "RR", nome: "Roraima" },
    { sigla: "SC", nome: "Santa Catarina" },
    { sigla: "SP", nome: "São Paulo" },
    { sigla: "SE", nome: "Sergipe" },
    { sigla: "TO", nome: "Tocantins" },
  ];

  public weakDays: any[] = [
    { id: "", nome: "Todos" },
    { id: "0", nome: "Domingo" },
    { id: "1", nome: "Segunda-feira" },
    { id: "2", nome: "Terça-feira" },
    { id: "3", nome: "Quarta-feira" },
    { id: "4", nome: "Quinta-feira" },
    { id: "5", nome: "Sexta-feira" },
    { id: "6", nome: "Sábado" },
  ];

  public cities: any[] = [];
  public districts: any[] = [];

  public form: FormGroup = new FormGroup({
    Uf: new FormControl(null, Validators.required),
    Localidade: new FormControl({ value: "", disabled: true }),
    Bairro: new FormControl({ value: "", disabled: true }),
    DiaDaSemana: new FormControl(),
    Horario: new FormControl(),
  });

  public getAddress(uf: string) {
    this.isLoading = true;
    this._church.addressRange(uf).subscribe({
      next: (data: ResponseAddress) => {
        this.cities = data.data.localidades || [];
        this.districts = data.data.bairros || [];

        if (this.cities.length > 0) {
          this.form.get("Localidade")?.enable();
        } else {
          this.form.get("Localidade")?.disable();
          this.form.get("Localidade")?.setValue("");
        }

        if (this.districts.length > 0) {
          this.form.get("Bairro")?.enable();
        } else {
          this.form.get("Bairro")?.disable();
          this.form.get("Bairro")?.setValue("");
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error("Erro ao carregar estados:", error.message);
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  reportChurch(emailContato: string): void {
    if (emailContato) {
      // Aqui você pode abrir o cliente de email ou executar qualquer lógica necessária
      window.location.href = `mailto:${emailContato}`;
    } else {
      this._toast.add({
        severity: 'warn',
        summary: 'Erro',
        detail: 'Email de contato não disponível.',
      });
    }
  }

  public searchFilter() {
    this.isLoading = true;
    const filters = {
      ...this.form.value,
      Ativo: true,
      "Paginacao.PageIndex": this.pageIndex,
      "Paginacao.PageSize": this.pageSize,
    } as FilterSearchChurch;
    this._church.searchByFilters(filters).subscribe({
      next: (resp: any) => {
        if (resp?.data?.items) {
          this.churchInfo = resp.data.items.map((church: any) => ({
            alteracao: church.alteracao,
            usuario: church.usuario.nome,
            id: church.id,
            nome: church.nome,
            paroco: church.paroco,
            imagem: church.imagemUrl,
            endereco: church.endereco,
            missas: church.missas.map((missa: Mass) => ({
              diaSemana: missa.diaSemana,
              horario: Array.isArray(missa.horario)
                ? missa.horario
                : [missa.horario], // Garante que seja sempre um array
            })),
          }));
          this.totalItems = resp.data.totalItems;
        } else {
          this.churchInfo = [];
          this.totalItems = 0;
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error("Erro ao buscar igrejas:", error.error);
        this.isLoading = false;
      },
      complete: () => (this.isLoading = false),
    });
  }

  

  // Converte dia da semana de número para nome
  getDayName(dia: number): string {
    const daysOfWeek = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ];
    return daysOfWeek[dia] || 'Desconhecido';
  }

  getFormattedMasses(missas: Mass[]): string[] {
    const daysOfWeek = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ];
  
    // Mapeia os dias da semana, e retorna apenas os dias que tiverem horários
    return daysOfWeek.map((day, index) => {
      // Filtra as missas que correspondem ao dia da semana
      const filteredMasses = missas.filter(missa => missa.diaSemana === index);
  
      if (filteredMasses.length > 0) {
        const horarios = filteredMasses
          .flatMap((missa) => missa.horario) // Garante que seja um array de horários
          .map((hora: string) => this.formatTime(hora)) // Formata o horário
          .join(', '); // Junta os horários por vírgula
  
        return `${day}: ${horarios}`;
      }
  
      return ''; // Retorna uma string vazia se não houver missas para o dia
    }).filter(Boolean); // Filtra os dias sem missas
  }
  
  // Método para formatar a hora (ex: "07:00:00" => "7:15h")
  formatTime(timeString: string): string {
    const [hours, minutes] = timeString.split(":");
    return `${parseInt(hours, 10)}:${minutes}h`;
  }

}
