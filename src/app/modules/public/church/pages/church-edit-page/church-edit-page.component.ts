import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { CommonModule, DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { MessageService } from "primeng/api";
import { switchMap, map, tap, catchError, finalize } from "rxjs/operators";
import { Observable, of } from "rxjs";

import {
  ChurchFormData,
  ChurchApiData,
  SocialMedia,
} from "../../models/church.model";
import { ChurchFormComponent } from "../../components/church-form/church-form.component";
import { PrimeNgModule } from "../../../../../shared/primeng.module";
import { ChurchesService } from "../../../../../core/services/churches.service";

@Component({
  selector: "app-church-edit-page",
  standalone: true,
  imports: [CommonModule, ChurchFormComponent, PrimeNgModule],
  providers: [MessageService, DatePipe],
  templateUrl: "./church-edit-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChurchEditPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private churchService = inject(ChurchesService);
  private messageService = inject(MessageService);
  private datePipe = inject(DatePipe);
  private cd = inject(ChangeDetectorRef);
  public router = inject(Router);

  isLoading = false;
  isSaving = false;
  // Observable para os dados da igreja a serem passados para o form filho
  churchCep: string | null = null;
  churchDataForForm$: Observable<ChurchFormData | null> | undefined;
  churchId: number | null = null; // Armazena o ID para o update

  typeChurchOptions = [
    { name: "Capela", value: "Capela" },
    { name: "Comunidade", value: "Comunidade" },
    { name: "Paróquia", value: "Paróquia" },
    { name: "Santuário", value: "Santuário" },
    { name: "Catedral", value: "Catedral" },
    { name: "Basílica Maior", value: "Basílica Maior" },
    { name: "Basílica Menor", value: "Basílica Menor" },
    { name: "Arquidiocese", value: "Arquidiocese" },
    { name: "Diocese", value: "Diocese" },
    { name: "Outro", value: "Outro" },
  ];

  ngOnInit(): void {
    this.churchDataForForm$ = this.route.params.pipe(
      tap((params) => {
        this.churchCep = params["cep"];
        this.isLoading = true;
      }),
      switchMap((params) =>
        this.churchService.searchByCEP(params["cep"]).pipe(
          map((response: any) => {
            const data = response.data.response;
            if (data) {
              this.churchId = data.id;
              return this.mapApiDataToFormData(data);
            } else {
              this.messageService.add({
                severity: "error",
                summary: "Erro",
                detail: "Igreja não encontrada.",
              });
              return null;
            }
          }),
          catchError((error: HttpErrorResponse) => {
            this.showErrorToast(error, "Erro ao carregar dados da igreja");
            return of(null); // continua fluxo mesmo com erro
          }),
          finalize(() => {
            this.isLoading = false; // aqui garante que desliga o loading no final, com sucesso ou erro
          })
        )
      )
    );
  }
  
  
  private loadChurchData(cep: string): void {
    this.isLoading = true;
  
    this.churchDataForForm$ = this.churchService.searchByCEP(cep).pipe(
      map((response: any) => {
        const data = response.data.response;
        if (data) {
          this.churchId = data.id;
          return this.mapApiDataToFormData(data);
        } else {
          this.messageService.add({
            severity: "error",
            summary: "Erro",
            detail: "Igreja não encontrada.",
          });
          return null;
        }
      }),
      catchError((error: HttpErrorResponse) => {
        this.showErrorToast(error, "Erro ao carregar dados da igreja");
        return of(null);
      }),
      finalize(() => {
        this.isLoading = false;
        this.cd.markForCheck(); // Importante para detecção em OnPush
      })
    );
  }
  

  // Lida com a submissão vinda do form filho
  handleFormSubmit(formData: ChurchFormData): void {
    if (!this.churchId) {
      this.messageService.add({
        severity: "error",
        summary: "Erro Interno",
        detail: "ID da igreja não encontrado para atualização.",
      });
      return;
    }
    this.isSaving = true;
    const payload = this.mapFormDataToApiUpdateData(formData, this.churchId);
    this.churchService.updateChurch(payload).subscribe({
      next: (response: any) => {
        this.isSaving = false;
        const controleId = response?.data?.response?.controleId; // Ajuste conforme sua API
        this.messageService.add({
          severity: "success",
          summary: "Sucesso",
          detail: "Alteração de igreja em andamento! Verifique seu e-mail para validação.",
        });
        if (controleId) {
          // Navega para a página de validação
          this.router.navigate(["/enviar-codigo", controleId]); // Ajuste a rota se necessário
        } else {
          console.warn("Controle ID não recebido, navegando para a home.");
          this.router.navigate(["/"]); // Fallback
        }
        this.cd.markForCheck(); // Atualiza view
      },
      error: (error: HttpErrorResponse) => {
        this.isSaving = false;
        this.showErrorToast(error, "Erro ao atualizar igreja");
        this.cd.markForCheck();
      },
    });
  }

  // Mapeia dados da API para o formato esperado pelo formulário
  private mapApiDataToFormData(
    apiData: ChurchApiData | null
  ): ChurchFormData | null {
    if (!apiData) return null;

    // Extrair tipo do nome (ex: "Paróquia Santa Rita" -> tipo: "Paróquia", nome: "Santa Rita")
    // Esta lógica pode precisar de ajuste dependendo de como o nome é formatado
    let type = "";
    let name = apiData.nome;

    const formData: ChurchFormData = {
      id: apiData.id,
      typeChurchValue: type || null, // Usa o tipo extraído ou null
      nomeIgreja: name, // Usa o nome sem o tipo
      nomeParoco: apiData.paroco,
      cep: apiData.endereco.cep, // Assumindo que a API retorna com máscara? Senão, aplicar máscara aqui ou no form.
      endereco: apiData.endereco.logradouro,
      numero: apiData.endereco.numero,
      complemento: apiData.endereco.complemento,
      bairro: apiData.endereco.bairro,
      cidade: apiData.endereco.localidade,
      estado: apiData.endereco.estado,
      uf: apiData.endereco.uf,
      regiao: apiData.endereco.regiao,
      // Recria telefone/whatsapp com máscara para o form
      telefone:
        apiData.contato.ddd && apiData.contato.telefone
          ? `(${apiData.contato.ddd}) ${apiData.contato.telefone.substring(
              0,
              4
            )}-${apiData.contato.telefone.substring(4)}` // Ajuste máscara
          : "",
      whatsapp:
        apiData.contato.dddWhatsApp && apiData.contato.telefoneWhatsApp
          ? `(${
              apiData.contato.dddWhatsApp
            }) ${apiData.contato.telefoneWhatsApp.substring(
              0,
              5
            )}-${apiData.contato.telefoneWhatsApp.substring(5)}` // Ajuste máscara
          : "",
      emailContato: apiData.contato.emailContato,
      missas: apiData.missas.map((missa) => ({
        ...missa,
        // O form espera Date, mas addMissaControl/populateForm já convertem string->Date
        horario: missa.horario, // Passa a string 'HH:mm:ss' diretamente
      })),
      // Mapeia redes sociais de volta para campos individuais
      facebook: this.findSocialMedia(apiData.redesSociais, 1),
      instagram: this.findSocialMedia(apiData.redesSociais, 2),
      youtube: this.findSocialMedia(apiData.redesSociais, 3),
      tiktok: this.findSocialMedia(apiData.redesSociais, 4),
      imagem: apiData.imagemUrl, // Assumindo que a API retorna base64 sem prefixo
    };
    return formData;
  }

  // Mapeia os dados do formulário para o formato esperado pela API de ATUALIZAÇÃO
  // Pode ser diferente da criação (ex: pode não precisar enviar endereço completo)
  private mapFormDataToApiUpdateData(
    formData: ChurchFormData,
    id: number
  ): ChurchApiData {
    // Ou um tipo parcial<ChurchApiData> se a API aceitar
    const telefoneLimpo = formData.telefone?.replace(/\D/g, "") ?? "";
    const whatsappLimpo = formData.whatsapp?.replace(/\D/g, "") ?? "";

    // Para atualização, talvez você só precise enviar os campos que mudaram
    // ou a API pode esperar o objeto completo. Ajuste conforme necessário.
    const payload: ChurchApiData = {
      id: id, // ID é crucial para update
      nome: formData.nomeIgreja, // Recria nome completo
      paroco: formData.nomeParoco,
      imagem: formData.imagemUrl, // Se a imagem for atualizada, envie o novo URL ou base64
      missas: formData.missas.map((missa: any) => ({
        diaSemana: missa.diaSemana,
        horario:
          missa.horario instanceof Date
            ? this.datePipe.transform(missa.horario, "HH:mm:ss")!
            : "00:00:00",
        observacao: missa.observacao,
      })),
      // Se o endereço não pode ser alterado na edição (campos desabilitados),
      // talvez não precise enviar o objeto 'endereco' inteiro ou envie apenas o CEP/Número/Complemento.
      // Se PUDER alterar (campos habilitados), envie como na criação.
      // Exemplo enviando completo (baseado no form que retorna valor bruto com getRawValue):
      endereco: {
        cep: formData.cep.replace(/\D/g, ""),
        logradouro: formData.endereco,
        complemento: formData.complemento,
        bairro: formData.bairro,
        localidade: formData.cidade,
        uf: formData.uf,
        estado: formData.estado,
        regiao: formData.regiao,
        numero: formData.numero,
      },
      contato: {
        ddd: telefoneLimpo.substring(0, 2),
        telefone: telefoneLimpo.substring(2),
        dddWhatsApp: whatsappLimpo.substring(0, 2),
        telefoneWhatsApp: whatsappLimpo.substring(2),
        emailContato: formData.emailContato,
      },
      redesSociais: [
        ...(formData.facebook
          ? [{ tipoRedeSocial: 1, nomeDoPerfil: formData.facebook }]
          : []),
        ...(formData.instagram
          ? [{ tipoRedeSocial: 2, nomeDoPerfil: formData.instagram }]
          : []),
        ...(formData.youtube
          ? [{ tipoRedeSocial: 3, nomeDoPerfil: formData.youtube }]
          : []),
        ...(formData.tiktok
          ? [{ tipoRedeSocial: 4, nomeDoPerfil: formData.tiktok }]
          : []),
      ].filter((rede) => rede.nomeDoPerfil),
    };
    return payload;
  }

  // Helper para encontrar a URL/nome de usuário da rede social
  private findSocialMedia(redes: SocialMedia[], tipo: number): string {
    const rede = redes?.find((r) => r.tipoRedeSocial === tipo);
    return rede?.nomeRedeSocial || rede?.url || "";
  }

  private showErrorToast(error: HttpErrorResponse, summary: string): void {
    let detail = "Ocorreu um erro. Tente novamente.";
    if (error.error && typeof error.error === "string") {
      detail = error.error;
    } else if (error.error?.message) {
      detail = error.error.message;
    } else if (error.message) {
      detail = error.message;
    }
    if (error.error?.errors && typeof error.error.errors === "object") {
      detail = Object.values(error.error.errors).flat().join(" ");
    }
    this.messageService.add({
      severity: "error",
      summary: summary,
      detail: detail,
    });
  }

  // Navega de volta para detalhes ou lista
  cancel(): void {
    if (this.churchId) {
      this.router.navigate(["/igrejas", this.churchId]);
    } else {
      this.router.navigate(["/igrejas"]);
    }
  }
}
