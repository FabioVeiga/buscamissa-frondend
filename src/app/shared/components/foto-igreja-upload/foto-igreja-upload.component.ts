import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrimeNgModule } from '../../primeng.module';

/** Foto escolhida: `base64` sem o prefixo "data:image/...;base64," (formato que a API espera). */
export interface FotoIgrejaSelecionada {
  base64: string | null;
  preview: string | null;
}

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

/**
 * Seleção da foto da igreja, compartilhada pelo cadastro/edição (church-form) e pelo
 * painel do responsável: arquivo, Ctrl+V ou URL externa, com pré-visualização.
 */
@Component({
  selector: 'app-foto-igreja-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, PrimeNgModule],
  templateUrl: './foto-igreja-upload.component.html',
  styleUrl: './foto-igreja-upload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FotoIgrejaUploadComponent {
  private readonly _cd = inject(ChangeDetectorRef);

  /** Imagem atual (URL ou data URI) exibida na pré-visualização. */
  @Input() preview: string | null = null;
  /** O painel do responsável não remove foto (a API só troca), então pode esconder o botão. */
  @Input() permitirRemover = true;
  @Output() fotoAlterada = new EventEmitter<FotoIgrejaSelecionada>();

  carregando = false;
  erro: string | null = null;
  imagemUrlInput = '';

  onSelecionarArquivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite escolher o mesmo arquivo de novo
    if (file) this._processar(file);
  }

  // Ctrl+V com uma imagem na área de transferência (print, imagem copiada do navegador etc.)
  onColar(event: ClipboardEvent): void {
    const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) {
      event.preventDefault();
      this._processar(file);
    }
  }

  // Baixa a imagem de uma URL externa e converte para base64, igual ao upload de arquivo.
  adicionarPorUrl(): void {
    const url = this.imagemUrlInput.trim();
    if (!url) return;

    this.carregando = true;
    this.erro = null;
    this._cd.markForCheck();

    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((blob) => {
        if (!blob.type.startsWith('image/')) throw new Error('não é imagem');
        this.imagemUrlInput = '';
        this._processar(blob);
      })
      .catch(() => {
        this.carregando = false;
        this.erro = 'Não foi possível carregar a imagem dessa URL.';
        this._cd.markForCheck();
      });
  }

  remover(): void {
    this.preview = null;
    this.erro = null;
    this.fotoAlterada.emit({ base64: null, preview: null });
    this._cd.markForCheck();
  }

  private _processar(file: Blob): void {
    this.erro = null;
    if (!file.type.startsWith('image/')) {
      this.erro = 'Selecione uma imagem.';
      this._cd.markForCheck();
      return;
    }
    if (file.size > TAMANHO_MAXIMO) {
      this.erro = 'Imagem muito grande (máximo de 5MB).';
      this._cd.markForCheck();
      return;
    }

    this.carregando = true;
    this._cd.markForCheck();

    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      this.preview = dataUri;
      this.carregando = false;
      this.fotoAlterada.emit({ base64: dataUri.split(',')[1], preview: dataUri });
      this._cd.markForCheck();
    };
    reader.onerror = () => {
      this.carregando = false;
      this.erro = 'Não foi possível ler a imagem.';
      this._cd.markForCheck();
    };
    reader.readAsDataURL(file);
  }
}
