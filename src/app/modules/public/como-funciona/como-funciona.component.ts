import { Component, inject, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChurchesService } from '../../../core/services/churches.service';
import { ClarityService } from '../../../core/services/clarity.service';

@Component({
  selector: 'app-como-funciona',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './como-funciona.component.html',
  styleUrl: './como-funciona.component.scss',
})
export class ComoFuncionaComponent implements OnInit, AfterViewInit, OnDestroy {
  private _church = inject(ChurchesService);
  private _clarity = inject(ClarityService);
  private _scrollObserver: IntersectionObserver | null = null;
  private _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  stats = {
    cidades: 213,
    paroquias: 2000,
    horarios: 9100,
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
    // Só no browser: mantém o prerender hermético (sem I/O de rede no build).
    // Os números carregam na hidratação; o HTML estático usa os defaults.
    if (!this._isBrowser) return;
    this._church.getInfo().subscribe({
      next: (res: any) => {
        const d = res?.data;
        if (!d) return;
        if (d.quantidadesIgrejas)  this.stats.paroquias = d.quantidadesIgrejas;
        if (d.quantidadeMissas)    this.stats.horarios  = d.quantidadeMissas;
      },
    });
  }

  ngAfterViewInit(): void {
    // IntersectionObserver/document não existem no servidor.
    if (this._isBrowser) this._initScrollTracking();
  }

  ngOnDestroy(): void {
    this._scrollObserver?.disconnect();
  }

  private _initScrollTracking(): void {
    const sentinels = [25, 50, 75, 100];
    this._scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pct = entry.target.getAttribute('data-scroll-pct');
          if (pct) {
            this._clarity.track(`scroll_${pct}`);
            this._scrollObserver?.unobserve(entry.target);
          }
        }
      });
    }, { threshold: 0 });

    sentinels.forEach(pct => {
      const el = document.querySelector(`[data-scroll-pct="${pct}"]`);
      if (el) this._scrollObserver!.observe(el);
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
