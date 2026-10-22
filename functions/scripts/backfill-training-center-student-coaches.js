/* eslint-disable */
/**
 * Preenche `students/{id}.coachUids` (quem pode ver o aluno) em todos os alunos dos Centros de
 * Treinamento — depois disso as rules só deixam o professor ler os alunos dele. A revisão diária
 * (`refreshTrainingCenterStudentCoaches`, 03:00) faz o mesmo; este script é para não esperar.
 *
 * Rode DEPOIS do deploy das functions/índice e ANTES (ou junto) das rules novas: sem o campo, o
 * professor fica sem ver os alunos até a primeira revisão.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-training-center-student-coaches.js --project volley-track-dev-4596c
 *   node scripts/backfill-training-center-student-coaches.js --project volley-track-dev-4596c --center <id>
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
admin.initializeApp({projectId});
const {refreshAllStudentCoachesCore} = require("../lib/training-center-student-coaches");

refreshAllStudentCoachesCore(admin.firestore(), new Date(), argValue("--center")).then((n) => {
  console.log(`${n} aluno(s) atualizado(s).`);
  process.exit(0);
}, (e) => {
  console.error(e);
  process.exit(1);
});
