import { Component, OnInit } from '@angular/core';
import { PrimeNgModule } from '../../../core/shared/primeng.module';
import { CommonModule, NgIf } from '@angular/common';

interface AdvertisementCategory {
  header: string;
  subheader?: string;
  links: { label: string; url: string }[];
}

@Component({
  selector: 'app-sponsors',
  imports: [PrimeNgModule, CommonModule],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.scss'
})
export class SponsorsComponent implements OnInit {
  advertisementCategories: AdvertisementCategory[] = []; // Inicialize com um array vazio

  responsiveOptions: any[] = [
    {
      breakpoint: '1024px',
      numVisible: 3,
      numScroll: 1,
    },
    {
      breakpoint: '768px',
      numVisible: 2,
      numScroll: 1,
    },
    {
      breakpoint: '560px',
      numVisible: 1,
      numScroll: 1,
    },
  ];

  constructor() {}

  ngOnInit(): void {
    this.advertisementCategories = [
      {
        header: 'Cursos',
        subheader: 'Encontre cursos para aprofundar sua fé.',
        links: [{ label: 'Acessar', url: 'https://go.hotmart.com/W98996075D?dp=1' }],
      },
      {
        header: 'Livros',
        subheader: 'Explore livros para enriquecer sua jornada espiritual.',
        links: [
          { label: 'Acessar Livro 1', url: 'https://go.hotmart.com/U98995658N' },
          { label: 'Acessar Livro 2', url: 'https://go.hotmart.com/W98995755V?dp=1' },
        ],
      },
      {
        header: 'Sacramentos',
        subheader: 'Produtos relacionados aos sacramentos.',
        links: [{ label: 'Acessar', url: 'https://go.hotmart.com/C98996000E?dp=1' }],
      },
      {
        header: 'Roupas',
        subheader: 'Vestimentas com temática religiosa.',
        links: [
          { label: 'Acessar Roupa 1', url: 'https://s.shopee.com.br/8zrXoIkLyD' },
          { label: 'Acessar Roupa 2', url: 'https://s.shopee.com.br/4VP8S3X7Ff' },
          { label: 'Acessar Roupa 3', url: 'https://s.shopee.com.br/6fTd236rg4' },
          { label: 'Acessar Roupa 4', url: 'https://s.shopee.com.br/40SrrJYyYL' },
        ],
      },
    ];
  }
}