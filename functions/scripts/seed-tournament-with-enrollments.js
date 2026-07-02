/* eslint-disable */
/**
 * Cria torneio de teste com 6 categorias (Iniciante/Intermediário/Open × Masc/Fem),
 * inscreve atletas seed em duplas e marca pagamento confirmado.
 * Datas: início daqui a 14 dias.
 *
 * Pré-requisito: rode `node scripts/seed-athletes.js` antes.
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-tournament-with-enrollments.js --project <id> --manager-uid <uid>
 *   node scripts/seed-tournament-with-enrollments.js --project <id> --manager-uid <uid> --yes
 */

const {
  buildTournamentDocFuture,
  runTournamentEnrollmentSeed,
} = require("./seed-tournament-enrollments-lib");

runTournamentEnrollmentSeed({
  defaultTournamentName: "Torneio seed nexaGO — 6 categorias",
  buildTournamentDoc: (categories, name) =>
    buildTournamentDocFuture(categories, name, 14),
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed do torneio:", err);
    process.exit(1);
  });
