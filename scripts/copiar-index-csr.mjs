// Pós-build do modo SSG (outputMode: static).
// A home é RenderMode.Client, então o Angular gera o shell da raiz como
// `index.csr.html` — mas o Azure Static Web Apps exige um `index.html` como
// arquivo default no root do artefato (senão o deploy falha com
// "Failed to find a default file ... Valid default files: index.html").
// Copiamos o shell CSR para index.html; o navigationFallback aponta para ele.
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const dir = join('dist', 'busca-missa', 'browser');
const csr = join(dir, 'index.csr.html');
const html = join(dir, 'index.html');

if (existsSync(html)) {
  console.log('[copiar-index-csr] index.html já existe (raiz pré-renderizada) — nada a fazer.');
} else if (existsSync(csr)) {
  copyFileSync(csr, html);
  console.log('[copiar-index-csr] index.csr.html -> index.html (default file p/ Azure SWA).');
} else {
  console.error(`[copiar-index-csr] ERRO: nem index.html nem index.csr.html em ${dir}.`);
  process.exit(1);
}
