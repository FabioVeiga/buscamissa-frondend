import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChurchesService } from '../../../core/services/churches.service';

@Component({
  selector: 'app-como-funciona',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './como-funciona.component.html',
  styleUrl: './como-funciona.component.scss',
})
export class ComoFuncionaComponent implements OnInit {
  private _church = inject(ChurchesService);

  stats = {
    cidades: 213,
    paroquias: 1674,
    horarios: 8535,
    estados: 26,
  };

  faqs = [
    {
      pergunta: 'Os horários de missa são oficiais?',
      resposta: 'Sempre que possível utilizamos fontes oficiais das paróquias e dioceses. Além disso, a comunidade confirma e atualiza os horários regularmente.',
      aberto: false,
    },
    {
      pergunta: 'Preciso criar uma conta para usar?',
      resposta: 'Não. Você pode buscar missas e ver todos os horários sem cadastro. A conta é necessária apenas para cadastrar ou gerenciar uma paróquia.',
      aberto: false,
    },
    {
      pergunta: 'O Busca Missa é gratuito?',
      resposta: 'Sim, totalmente gratuito para fiéis e paróquias. O serviço é mantido por parceiros e anunciantes que apoiam a missão.',
      aberto: false,
    },
    {
      pergunta: 'Minha paróquia não aparece. O que fazer?',
      resposta: 'Você pode cadastrá-la gratuitamente em poucos minutos. Basta acessar "Cadastrar paróquia" e preencher as informações básicas.',
      aberto: false,
    },
    {
      pergunta: 'Posso corrigir um horário de missa?',
      resposta: 'Sim. Em qualquer página de paróquia há um botão "Reportar problema". Sua contribuição é revisada e ajuda toda a comunidade.',
      aberto: false,
    },
    {
      pergunta: 'Como minha paróquia pode atualizar as informações?',
      resposta: 'A própria paróquia pode solicitar acesso para gerenciar sua página diretamente. Entre em contato pelo menu "Fale conosco".',
      aberto: false,
    },
  ];

  ngOnInit(): void {
    this._church.getInfo().subscribe({
      next: (res: any) => {
        const d = res?.data;
        if (!d) return;
        if (d.quantidadesIgrejas)  this.stats.paroquias = d.quantidadesIgrejas;
        if (d.quantidadeMissas)    this.stats.horarios  = d.quantidadeMissas;
      },
    });
  }

  toggle(faq: any): void {
    faq.aberto = !faq.aberto;
  }

  formatNum(n: number): string {
    if (n >= 1000) return (Math.floor(n / 100) * 100).toLocaleString('pt-BR') + '+';
    return n + '+';
  }
}
