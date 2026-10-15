import { Component, OnInit, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MetricasService, OrigemAnuncie, PaginaMetrica } from "../../../core/services/metricas.service";
import { instagramUsuario } from "../../../../environments/environment.common";

interface Pacote {
  nome: string;
  descricao: string;
}

interface Pergunta {
  pergunta: string;
  resposta: string;
}

@Component({
  selector: "app-sponsors",
  imports: [RouterLink],
  templateUrl: "./sponsors.component.html",
  styleUrl: "./sponsors.component.scss",
})
export class SponsorsComponent implements OnInit {
  private _metricas = inject(MetricasService);

  readonly instagramDirect = `https://ig.me/m/${instagramUsuario}`;
  readonly instagramPerfil = `https://www.instagram.com/${instagramUsuario}/`;

  readonly pacotes: Pacote[] = [
    { nome: "Nacional", descricao: "Sua marca em todo o Brasil, nos espaços do site." },
    { nome: "Por estado", descricao: "Foco em um estado, como SP, MG, RJ ou PR." },
    { nome: "Cidades de maior movimento", descricao: "Pacote com as cidades que mais buscam missa." },
    { nome: "Regional", descricao: "União de estados vizinhos para uma campanha regional." },
  ];

  readonly perguntas: Pergunta[] = [
    {
      pergunta: "Os anúncios aparecem para todos?",
      resposta:
        "Ainda estamos em pré-lançamento: nenhuma campanha de terceiros está no ar. Os primeiros anunciantes entram como pioneiros, com condições especiais.",
    },
    {
      pergunta: "Como o anúncio é identificado?",
      resposta:
        "Todo anúncio de terceiros recebe o selo \"Patrocinado\". Anúncios discretos, sem pop-up, sem som e sem vídeo.",
    },
    {
      pergunta: "Como é o período e o valor?",
      resposta:
        "Campanhas por mês fechado, com preço fixo mensal e relatório de visualizações e cliques. Valores sob consulta.",
    },
    {
      pergunta: "Todo anúncio é aceito?",
      resposta:
        "Não. Todo criativo passa por aprovação do BuscaMissa antes de ir ao ar, e alguns segmentos não são aceitos.",
    },
  ];

  registrarCliqueAnunciar(): void {
    this._metricas.registrarCliqueAnuncie(OrigemAnuncie.Pagina);
  }

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Anuncios);
  }
}
