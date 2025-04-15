import { Component } from "@angular/core";
import { PrimeNgModule } from "../../../shared/primeng.module";
import { CommonModule } from "@angular/common";

interface Link {
  label: string;
  url: string;
  image?: string;
  title?: string;
  description?: string;
}

interface Category {
  header: string;
  subheader?: string;
  links: Link[];
}

@Component({
  selector: "app-sponsors",
  imports: [PrimeNgModule, CommonModule],
  templateUrl: "./sponsors.component.html",
  styleUrl: "./sponsors.component.scss",
})
export class SponsorsComponent {
  advertisementCategories: Category[] = [
    {
      header: "Cursos",
      subheader: "Encontre cursos para aprofundar sua fé.",
      links: [
        {
          title: "Curso de Teologia",
          description:
            "Aprofunde seus conhecimentos na fé cristã com este curso completo.",
          label: "Acessar",
          url: "https://go.hotmart.com/W98996075D?dp=1",
          image:
            "https://static-media.hotmart.com/8u7j1pu4hJlG29KnAHtRthiIksE=/300x300/smart/filters:format(webp):background_color(white)/hotmart/product_pictures/36b6c30a-d13f-44d5-af6a-12ba5f198a9c/Capturadetela20250131130143.png?w=920",
        },
      ],
    },
    {
      header: "Livros",
      subheader: "Explore livros para enriquecer sua jornada espiritual.",
      links: [
        {
          title: "História do Tradicionalismo Católico",
          description: "Aprenda sobre a história da Igreja e sua importância.",
          label: "Acessar Livro",
          url: "https://go.hotmart.com/U98995658N",
          image:
            "https://static-media.hotmart.com/Ned5BB0SE2ccWICOgIWOBjOx0A4=/300x300/smart/filters:format(webp):background_color(white)/hotmart/product_pictures/dbd9e030-84e8-47b4-aecc-1505b68eef19/Cursolinkedin.jpg?w=920",
        },
        {
          label: "Acessar Livro 2",
          url: "https://go.hotmart.com/W98995755V?dp=1",
          image:
            "https://static-media.hotmart.com/DoRTt7OAlvORzo2Fjhy1BZnK4oQ=/300x300/smart/filters:format(webp):background_color(white)/hotmart/product_pictures/4fb2857c-70bf-4e7a-9cf5-09cd2f464549/RespostascatlicasparaAFIRMAESPROTESTANTES.png?w=920",
        },
      ],
    },
    {
      header: "Sacramentos",
      subheader: "Produtos relacionados aos sacramentos.",
      links: [
        {
          label: "Acessar",
          url: "https://go.hotmart.com/C98996000E?dp=1",
          image:
            "https://static-media.hotmart.com/Rj82y4oaCCPppjAAtVeGpD0uJrA=/300x300/smart/filters:format(webp):background_color(white)/hotmart/product_contents/52e0bffd-9923-4fe4-ba01-4bbf6bf966f5/Celebreamisericrdia.png?w=920",
        },
      ],
    },
    {
      header: "Roupas",
      subheader: "Vestimentas com temática religiosa.",
      links: [
        {
          label: "Acessar Roupa 1",
          url: "https://s.shopee.com.br/8zrXoIkLyD",
          image:
            "https://down-br.img.susercontent.com/file/br-11134207-7r98o-m63cn963p8xx1d.webp",
        },
        {
          label: "Acessar Roupa 2",
          url: "https://s.shopee.com.br/4VP8S3X7Ff",
          image:
            "https://down-br.img.susercontent.com/file/br-11134207-7r98o-m63cn963i83p98.webp",
        },
        {
          label: "Acessar Roupa 3",
          url: "https://s.shopee.com.br/6fTd236rg4",
          image:
            "https://down-br.img.susercontent.com/file/f5b017ca7ab6112afe5b0cd0668e864e.webp",
        },
        {
          label: "Acessar Roupa 4",
          url: "https://s.shopee.com.br/40SrrJYyYL",
          image:
            "https://down-br.img.susercontent.com/file/698a581a7f8ac805a9f82929d9147ce6.webp",
        },
      ],
    },
  ];

  responsiveOptions: any[] = [
    {
      breakpoint: "1024px",
      numVisible: 3,
      numScroll: 1,
    },
    {
      breakpoint: "768px",
      numVisible: 2,
      numScroll: 1,
    },
    {
      breakpoint: "560px",
      numVisible: 1,
      numScroll: 1,
    },
  ];
}
