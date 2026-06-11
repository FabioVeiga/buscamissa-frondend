/**
 * Converte campinas-pilot.csv e envia para POST /api/v1/admin/igrejas/lote
 *
 * Uso:
 *   node scripts/importar-lote.mjs <csv> <api-base> <token>
 *
 * Exemplo:
 *   node scripts/importar-lote.mjs scripts/campinas-pilot.csv https://busca-missa-dev.azurewebsites.net eyJhb...
 */

import { readFileSync } from 'fs';

const [, , csvPath, apiBase, token] = process.argv;

if (!csvPath || !apiBase || !token) {
  console.error('Uso: node scripts/importar-lote.mjs <csv> <api-base> <token>');
  process.exit(1);
}

const linhas = readFileSync(csvPath, 'utf-8').split('\n').filter(Boolean);
const [header, ...rows] = linhas;
const cols = header.split(',');

const idx = (nome) => cols.indexOf(nome);

// Agrupa linhas pelo mesmo nome+CEP (múltiplas missas = múltiplas linhas)
const map = new Map();

for (const row of rows) {
  // CSV simples sem campos entre aspas — split direto
  const vals = row.split(',');
  const get = (c) => vals[idx(c)]?.trim() ?? '';

  const nome = get('Nome');
  const cep  = get('CEP');
  const key  = `${nome}||${cep}`;

  if (!map.has(key)) {
    map.set(key, {
      nome,
      paroco: get('Paroco') || null,
      cep,
      numero: parseInt(get('Numero'), 10) || 0,
      email: get('Email') || null,
      telefone: get('Telefone') || null,
      whatsApp: get('WhatsApp') || null,
      site: get('Site') || null,
      missas: []
    });
  }

  const diaSemana = get('DiaSemana');
  const horario   = get('Horario');
  if (diaSemana && horario) {
    map.get(key).missas.push({ diaSemana, horario });
  }
}

const payload = { igrejas: [...map.values()] };

console.log(`Enviando ${payload.igrejas.length} igrejas para ${apiBase}/api/v1/admin/igrejas/lote ...`);

const res = await fetch(`${apiBase}/api/v1/admin/igrejas/lote`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(payload)
});

const body = await res.json();

if (!res.ok) {
  console.error(`HTTP ${res.status}:`, body);
  process.exit(1);
}

console.log(`✓ Inseridas: ${body.inseridas}`);
console.log(`  Puladas (duplicatas): ${body.puladas}`);
if (body.erros?.length > 0) {
  console.warn(`  Erros (${body.erros.length}):`);
  for (const e of body.erros) {
    console.warn(`    Linha ${e.linha} — ${e.nome}: ${e.motivo}`);
  }
}
