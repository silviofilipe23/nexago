/* eslint-disable */
/**
 * Cria torneio de teste para o dia atual (America/Sao_Paulo) com 6 categorias
 * (Iniciante/Intermediário/Open × Masc/Fem), inscreve atletas seed em duplas
 * e marca pagamento confirmado.
 *
 * - startAt / endAt: hoje 08:00–20:00 (SP)
 * - matchOps.activeDayKey: dia de hoje (grade e programação abrem no dia certo)
 *
 * Pré-requisito: rode `node scripts/seed-athletes.js` antes.
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-tournament-today-with-enrollments.js --project <id> --manager-uid <uid>
 *   node scripts/seed-tournament-today-with-enrollments.js --project <id> --manager-uid <uid> --yes
 *
 * Opcional:
 *   --tournament-name "Meu torneio de hoje"
 */

const {
  buildTournamentDocToday,
  dayKeyInSaoPaulo,
  runTournamentEnrollmentSeed,
} = require("./seed-tournament-enrollments-lib");

const todayKey = dayKeyInSaoPaulo();

runTournamentEnrollmentSeed({
  defaultTournamentName: `Torneio seed nexaGO — hoje (${todayKey})`,
  buildTournamentDoc: buildTournamentDocToday,
  extraLogLines: () => [`Dia do torneio (SP): ${todayKey}`],
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed do torneio (hoje):", err);
    process.exit(1);
  });
