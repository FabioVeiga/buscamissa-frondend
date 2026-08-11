import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChurchesService } from '../../../core/services/churches.service';
import { MetricasService, PaginaMetrica } from '../../../core/services/metricas.service';
import { STATES } from '../../../core/constants/states';
import { PageHeroComponent, HeroTile } from '../../../shared/components/page-hero/page-hero.component';
import { HubBreadcrumb } from '../../../shared/components/hub-lista/hub-lista.component';

interface CidadeItem { nome: string; slug: string; }
interface EstadoItem { sigla: string; nome: string; cidades: CidadeItem[]; expandido: boolean; }

@Component({
  selector: 'app-cidades',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PageHeroComponent],
  templateUrl: './cidades.component.html',
  styleUrl: './cidades.component.scss',
})
export class CidadesComponent implements OnInit {
  private _church = inject(ChurchesService);
  private _metricas = inject(MetricasService);

  isLoading = true;
  busca = '';
  estados: EstadoItem[] = [];

  readonly breadcrumb: HubBreadcrumb[] = [
    { label: 'Início', link: ['/home'] },
    { label: 'Cidades' },
  ];

  /** `\n` vira quebra de linha (o hero usa `white-space: pre-line`). */
  readonly TITULO_HERO = 'Horários de Missa\npor';

  /**
   * Os números saem de `addressRange()` (estados/cidades) e de `getInfo()`
   * (paróquias). Nada é fixo no template: o "700+" que vivia aqui era um chute
   * que envelhecia sozinho numa página indexada.
   */
  tiles: HeroTile[] = [
    { icone: 'pi pi-map', numero: 0, rotulo: 'estados e o DF' },
    { icone: 'pi pi-building', numero: 0, rotulo: 'cidades cadastradas' },
    { icone: 'pi pi-users', numero: 0, rotulo: 'paróquias e comunidades' },
  ];

  /** Contagem global de paróquias; `null` enquanto não chega — o tile só entra com número. */
  private totalParoquias: number | null = null;
  /**
   * `addressRange()` falhou. Distingue "não carregou" de "a busca não achou": sem
   * isso a página exibia "Nenhuma cidade encontrada" com aspas vazias em cima de
   * um erro de rede. Também zera os tiles — hero sem número é melhor que zeros.
   */
  semDados = false;

  // Cores por estado (sigla → classe CSS)
  readonly estadoCores: Record<string, string> = {
    SP: 'badge--sp', MG: 'badge--mg', RJ: 'badge--rj', PR: 'badge--pr',
    RS: 'badge--rs', SC: 'badge--sc', DF: 'badge--df', GO: 'badge--go',
    BA: 'badge--ba', CE: 'badge--ce', PE: 'badge--pe', PA: 'badge--pa',
  };

  get totalCidades(): number {
    return this.estados.reduce((s, e) => s + e.cidades.length, 0);
  }

  get estadosFiltrados(): EstadoItem[] {
    const q = this.normalizar(this.busca);
    if (!q) return this.estados;
    return this.estados
      .map(e => ({
        ...e,
        expandido: true,
        cidades: e.cidades.filter(c => this.normalizar(c.nome).includes(q)),
      }))
      .filter(e => this.normalizar(e.nome).includes(q) || e.cidades.length > 0);
  }

  ngOnInit(): void {
    this._metricas.registrarVisualizacaoPagina(PaginaMetrica.Cidades);
    this.carregarCidades();
    this.carregarTotalParoquias();
  }

  /**
   * Refaz a carga depois de uma falha. O cache precisa ser descartado antes: o
   * `shareReplay` de `addressRange()` guarda o erro e devolveria a mesma falha
   * na hora, sem nova requisição — o botão viraria enfeite.
   */
  recarregar(): void {
    if (this.isLoading) return;
    this.isLoading = true;
    this.semDados = false;
    this._church.limparCacheEnderecos();
    this.carregarCidades();
  }

  private carregarCidades(): void {
    this._church.addressRange().subscribe({
      next: ({ data }: any) => {
        this.estados = Object.entries(data)
          .map(([uf, cities]: [string, any]) => ({
            sigla: uf,
            nome: STATES.find(s => s.sigla === uf)?.nome ?? uf,
            cidades: Object.keys(cities)
              .map(nome => ({ nome, slug: this.slugify(nome) }))
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
            expandido: false,
          }))
          .sort((a, b) => b.cidades.length - a.cidades.length);

        if (this.estados.length) this.estados[0].expandido = true;
        this.isLoading = false;
        this.montarTiles();
      },
      error: () => {
        this.isLoading = false;
        // Sem dado, sem tile: "0 estados e o DF" é tão falso quanto o "700+" fixo
        // que vivia aqui. Melhor não afirmar número nenhum.
        this.semDados = true;
        this.montarTiles();
      },
    });
  }

  /**
   * Contagem global de paróquias — mesmo endpoint que a Home usa. Página CSR
   * (catch-all no `app.routes.server.ts`), então não há prerender para depender
   * de rede: o número é sempre o de agora. Falhando, o tile sai em vez de exibir
   * um número inventado.
   */
  private carregarTotalParoquias(): void {
    this._church.getInfo().subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        this.totalParoquias = d.quantidadesIgrejas ?? d.quantidadeIgrejas ?? d.totalIgrejas ?? null;
        this.montarTiles();
      },
      error: () => { this.montarTiles(); },
    });
  }

  /**
   * Sempre um ARRAY NOVO: `PageHeroComponent` é OnPush e só re-renderiza quando a
   * referência do input muda — mutar `tiles` no lugar não repintaria nada. Mesmo
   * cuidado que a Home documenta para o `HomeStatsComponent`.
   */
  private montarTiles(): void {
    if (this.semDados) {
      this.tiles = [];
      return;
    }
    const tiles: HeroTile[] = [
      { icone: 'pi pi-map', numero: this.estados.length, rotulo: 'estados e o DF' },
      { icone: 'pi pi-building', numero: this.totalCidades, rotulo: 'cidades cadastradas' },
    ];
    if (this.totalParoquias) {
      tiles.push({ icone: 'pi pi-users', numero: this.totalParoquias, rotulo: 'paróquias e comunidades' });
    }
    this.tiles = tiles;
  }

  toggleEstado(e: EstadoItem): void { e.expandido = !e.expandido; }

  badgeClass(sigla: string): string {
    return this.estadoCores[sigla] ?? 'badge--default';
  }

  slugify(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  normalizar(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
