/**
 * Guard-rail de FUSO HORÁRIO do prerender. Roda no PREbuild de staging e prod —
 * antes do `ng build`, para abortar em segundos em vez de depois de prerenderizar
 * ~3.000 páginas com o horário errado.
 *
 * Por que existe
 * -------------
 * O prerender assa HTML estático a partir de `getNextOccurrenceMinutes()`
 * (src/app/shared/utils/mass-time.utils.ts), que usa `getDay()` e `setHours()` —
 * ambos LOCAIS ao processo. Os horários das missas são hora de parede local da
 * igreja (`Missa.Horario` é um TimeSpan no backend, sem fuso).
 *
 * O runner do GitHub roda em UTC. Nesse fuso, toda missa das próximas 3 horas em
 * horário de Brasília é lida como "já passou" e empurrada para a semana seguinte.
 * Caso real medido em produção (build de 2026-09-09 às 18h44 BRT): a missa das
 * 19h00, que começaria em 15 minutos, foi assada como estando a 6,9 dias.
 * Exposição medida sobre a base inteira: 12,77% das 20.176 missas por build em UTC,
 * contra 0,27% em America/Sao_Paulo.
 *
 * Por que checar o fuso EFETIVO e não `process.env.TZ`
 * ---------------------------------------------------
 * Checar a variável de ambiente pega o caso "esqueceram de definir", mas deixa
 * passar dois piores:
 *
 *   1. `TZ` com valor inválido ("America/SaoPaulo", sem underscore): o Node NÃO
 *      falha — ele cai silenciosamente em UTC. A variável estaria "definida" e o
 *      build sairia errado do mesmo jeito.
 *   2. Máquina de desenvolvedor no Brasil, que tem o fuso certo pelo sistema
 *      operacional e nenhum `TZ` exportado. Barrar esse caso seria falso positivo.
 *
 * Por isso o guard valida o RESULTADO — fuso resolvido e offset real — e não o
 * mecanismo. É o que o prerender de fato vai usar.
 *
 * Limitação conhecida e aceita
 * ----------------------------
 * Igrejas em UTC-4 (MS, MT, AM, RR) e UTC-5 (AC) seguem avaliadas no fuso de
 * Brasília: 302 paróquias, 5,9% da base. É o mesmo erro que o navegador delas já
 * comete hoje, porque o cálculo sempre roda no fuso de quem renderiza. Fuso por
 * igreja exige mudança de modelo de dados e está fora deste escopo.
 */

const ESPERADO = 'America/Sao_Paulo';
// America/Sao_Paulo não tem horário de verão desde 2019 — offset fixo de -3h o ano
// inteiro. `getTimezoneOffset()` devolve o sinal invertido, por isso 180.
const OFFSET_ESPERADO_MIN = 180;

const resolvido = Intl.DateTimeFormat().resolvedOptions().timeZone;
const offset = new Date().getTimezoneOffset();
const daEnv = process.env.TZ ?? '(não definida)';

console.log(
  `[timezone] TZ=${daEnv} · fuso resolvido=${resolvido} · offset=${-offset / 60}h`
);

const erros = [];

if (resolvido !== ESPERADO) {
  erros.push(
    `fuso resolvido é "${resolvido}", esperado "${ESPERADO}".`
  );
}

// Checagem independente do nome: cobre o caso de um alias resolver para o nome certo
// mas com offset errado, e o de uma base de fusos desatualizada no runner.
if (offset !== OFFSET_ESPERADO_MIN) {
  erros.push(
    `offset é ${-offset / 60}h, esperado ${-OFFSET_ESPERADO_MIN / 60}h.`
  );
}

if (erros.length) {
  console.error('\n❌ [timezone] o prerender rodaria no fuso errado:');
  for (const e of erros) console.error(`   - ${e}`);
  console.error(
    `\n   Defina TZ=${ESPERADO} no env do job (.github/workflows/azure-static-web-apps-*.yml).`
  );
  console.error(
    '   Sem isso o HTML estático sai com a próxima missa errada para as missas'
  );
  console.error('   das próximas horas, e o erro só some no próximo build.\n');
  process.exit(1);
}

console.log(`✓ [timezone] prerender vai rodar em ${ESPERADO} (offset ${-offset / 60}h).`);
