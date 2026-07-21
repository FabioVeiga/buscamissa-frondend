import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { PrimeNgModule } from "../../../shared/primeng.module";
import { SeoService } from "../../../core/services/seo.service";

interface FAQ {
  pergunta: string;
  resposta: string;
  aberto: boolean;
}

@Component({
  selector: "app-guia-responsavel",
  standalone: true,
  imports: [CommonModule, RouterLink, PrimeNgModule],
  templateUrl: "./guia-responsavel.component.html",
  styleUrl: "./guia-responsavel.component.scss",
})
export class GuiaResponsavelComponent implements OnInit {
  private _seo = inject(SeoService);

  faqs: FAQ[] = [
    {
      pergunta: "Quanto tempo leva para ser aprovado?",
      resposta:
        "A análise geralmente leva de 1 a 3 dias úteis. Você receberá um email informando o resultado.",
      aberto: false,
    },
    {
      pergunta: "Posso gerenciar múltiplas igrejas?",
      resposta:
        "Sim! Se você é responsável por mais de uma paróquia, pode solicitar responsabilidade para cada uma.",
      aberto: false,
    },
    {
      pergunta: "O que preciso para solicitar?",
      resposta:
        "Precisa ter seu email verificado, conta ativa e ser realmente responsável pela paróquia.",
      aberto: false,
    },
    {
      pergunta: "Posso editar os dados depois?",
      resposta:
        "Sim! Como responsável verificado, você pode atualizar horários, endereço, telefone e fotos sempre que precisar.",
      aberto: false,
    },
  ];

  ngOnInit() {
    this._seo.update({
      title: "Guia do Responsável Verificado | BuscaMissa",
      description:
        "Conheça como se tornar responsável verificado e gerenciar sua paróquia no BuscaMissa.",
      canonical: "https://buscamissa.com.br/guia-responsavel",
    });
  }

  toggle(faq: FAQ) {
    faq.aberto = !faq.aberto;
  }
}
