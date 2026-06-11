/**
 * Valida se o import de Campinas foi bem-sucedido
 * Uso: node scripts/validar-import.mjs <api-base> <token>
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const [, , apiBase, token] = process.argv;
if (!apiBase || !token) {
  console.error('Uso: node scripts/validar-import.mjs <api-base> <token>');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV  = join(ROOT, 'scripts/campinas-pilot.csv');

// Lê paróquias únicas do CSV
const linhas = readFileSync(CSV, 'utf-8').split('\n').filter(Boolean);
const [header, ...rows] = linhas;
const cols = header.split(',');
const idx  = (c) => cols.indexOf(c);

const esperadas = new Map();
for (const row of rows) {
  const vals = row.split(',');
  const nome = vals[idx('Nome')]?.trim();
  const cep  = vals[idx('CEP')]?.trim();
  if (nome) esperadas.set(nome, cep);
}

console.log(`\n📋 Paróquias esperadas no CSV: ${esperadas.size}`);
console.log(`🔍 Consultando ${apiBase} ...\n`);

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

// Busca igrejas em Campinas via endpoint admin
const res = await fetch(
  `${apiBase}/api/v1/Admin/igreja/infos?cidade=campinas&uf=sp&pagina=1&quantidade=100`,
  { headers }
);

if (!res.ok) {
  // Tenta endpoint alternativo de busca pública
  const res2 = await fetch(
    `${apiBase}/api/v1/igreja/buscar?cidade=campinas&uf=sp`,
    { headers }
  );
  if (!res2.ok) {
    console.error(`Erro ao consultar API: HTTP ${res.status}`);
    console.error('Tente verificar manualmente no Swagger ou banco de dados.');
    process.exit(1);
  }
}

const data = await res.json();
const igrejas = data?.data ?? data?.igrejas ?? data ?? [];
const total = Array.isArray(igrejas) ? igrejas.length : 0;

console.log(`✅ Igrejas retornadas pela API em Campinas: ${total}\n`);

if (total > 0 && Array.isArray(igrejas)) {
  // Checa quais do CSV estão presentes
  const nomesApi = new Set(igrejas.map(i => i.nome?.trim().toLowerCase()));

  let encontradas = 0;
  let naoEncontradas = [];

  for (const [nome] of esperadas) {
    if (nomesApi.has(nome.toLowerCase())) {
      encontradas++;
    } else {
      naoEncontradas.push(nome);
    }
  }

  console.log(`✅ Encontradas na API: ${encontradas}/${esperadas.size}`);

  if (naoEncontradas.length > 0) {
    console.log(`\n⚠️  Não encontradas (${naoEncontradas.length}):`);
    for (const n of naoEncontradas) console.log(`   - ${n}`);
  } else {
    console.log('\n🎉 Todas as paróquias do CSV estão na API!');
  }
} else {
  console.log('ℹ️  Não foi possível comparar — verifique manualmente no Swagger:');
  console.log(`   GET ${apiBase}/api/v1/Admin/igreja/infos`);
}
