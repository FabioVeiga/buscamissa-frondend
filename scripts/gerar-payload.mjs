/**
 * Gera campinas-payload.json com endereços resolvidos via ViaCEP local
 * Assim o backend não precisa chamar ViaCEP — sem timeout.
 *
 * Uso: node scripts/gerar-payload.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV  = join(ROOT, 'scripts/campinas-pilot.csv');
const OUT  = join(ROOT, 'scripts/campinas-payload.json');

const lines = readFileSync(CSV, 'utf-8').split('\n').filter(Boolean);
const [h, ...rows] = lines;
const cols = h.split(',');
const g = (v, c) => v[cols.indexOf(c)]?.trim() ?? '';

// Monta mapa de igrejas agrupando missas
const map = new Map();
for (const r of rows) {
  const v = r.split(',');
  const nome = g(v, 'Nome');
  const cep  = g(v, 'CEP');
  const key  = `${nome}||${cep}`;
  if (!map.has(key)) {
    map.set(key, {
      nome,
      paroco:   g(v, 'Paroco')   || null,
      cep,
      numero:   parseInt(g(v, 'Numero'), 10) || 0,
      email:    g(v, 'Email')    || null,
      telefone: g(v, 'Telefone') || null,
      whatsApp: g(v, 'WhatsApp') || null,
      site:     g(v, 'Site')     || null,
      missas:   []
    });
  }
  const dia = g(v, 'DiaSemana');
  const hor = g(v, 'Horario');
  if (dia && hor) map.get(key).missas.push({ diaSemana: dia, horario: hor });
}

// Resolve endereços via ViaCEP (CEPs únicos)
const cepsUnicos = [...new Set([...map.values()].map(i => i.cep.replace('-', '')))];
const enderecos  = new Map();

console.log(`Resolvendo ${cepsUnicos.length} CEPs via ViaCEP...`);

for (const cep of cepsUnicos) {
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (!data.erro) {
      enderecos.set(cep, {
        logradouro: data.logradouro || '',
        bairro:     data.bairro     || '',
        localidade: data.localidade || '',
        uf:         data.uf         || '',
        estado:     data.estado     || '',
        regiao:     data.regiao     || ''
      });
      process.stdout.write(`  ✓ ${cep}\n`);
    } else {
      process.stdout.write(`  ✗ ${cep} — não encontrado\n`);
    }
  } catch (e) {
    process.stdout.write(`  ✗ ${cep} — erro: ${e.message}\n`);
  }
}

// Monta payload final com endereço embutido
const igrejas = [...map.values()].map(ig => {
  const cepKey = ig.cep.replace('-', '');
  const end = enderecos.get(cepKey) ?? {};
  return { ...ig, ...end };
});

const semEndereco = igrejas.filter(i => !i.localidade);
if (semEndereco.length > 0) {
  console.warn(`\n⚠️  ${semEndereco.length} igrejas sem endereço resolvido:`);
  semEndereco.forEach(i => console.warn(`   - ${i.nome} (${i.cep})`));
}

writeFileSync(OUT, JSON.stringify({ igrejas }, null, 2), 'utf-8');
console.log(`\n✓ ${OUT}`);
console.log(`  ${igrejas.length} igrejas, ${igrejas.reduce((a, i) => a + i.missas.length, 0)} missas`);
