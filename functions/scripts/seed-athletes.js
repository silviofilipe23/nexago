/* eslint-disable */
/**
 * Seed de atletas de teste: cria contas no Auth + perfil completo em users/{uid}.
 *
 * Gera COUNT atletas por (nível × gênero). Níveis: escada de 5 do vôlei
 * (Iniciante 1/2, Intermediário 1/2, Open). Gêneros: Masculino, Feminino.
 * Padrão: 32 por combinação (= 320).
 *
 * A lógica vive em `seed-athletes-lib.js`, compartilhada com
 * `seed-test-data.js`. Este arquivo é só o wrapper de linha de comando.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login      # ADC
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-athletes.js --project volley-track-dev-4596c
 *   COUNT=10 node scripts/seed-athletes.js --project <projectId>
 *
 * Idempotente: se o e-mail já existe no Auth, reaproveita o uid e só atualiza o perfil.
 */

const admin = require("firebase-admin");
const {seedAthletes} = require("./seed-athletes-lib");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

const COUNT = parseInt(process.env.COUNT || "32", 10);
const PASSWORD = process.env.SEED_PASSWORD || "Senha123!";
const CITY = process.env.SEED_CITY || "Goiânia";
const STATE = process.env.SEED_STATE || "GO";

admin.initializeApp({projectId});

seedAthletes({
  db: admin.firestore(),
  auth: admin.auth(),
  count: COUNT,
  password: PASSWORD,
  city: CITY,
  state: STATE,
})
  .then(({total}) => {
    console.log(`OK: ${total} atletas criados/atualizados em ${projectId}.`);
    console.log(
      `Login: e-mails seed-<nivel>-<m|f>-NN@nexago.test / senha ${PASSWORD}`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
