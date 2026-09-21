/* eslint-disable */
/**
 * Renomeia no Asaas os customers de atleta que ficaram com o nome genérico.
 *
 * Até o fix de `asaas-customer.ts`, o nome do pagador vinha só do
 * `displayName` do Firebase Auth — campo que o cadastro por e-mail/senha do app
 * nunca grava. Quem entrou por e-mail virou "Atleta NexaGO" no Asaas e as
 * cobranças dele ficaram sem dono rastreável. O nome real sempre esteve em
 * `users/{uid}.fullName`.
 *
 * A Cloud Function já se auto-corrige: o nome entrou no cache
 * (`users/{uid}/asaas/customer.name`) e uma diferença dispara o PUT. Mas isso
 * só acontece na PRÓXIMA cobrança do atleta — este script corrige agora, e com
 * isso as cobranças JÁ EMITIDAS passam a exibir o nome certo (o Asaas mostra o
 * nome atual do customer no histórico de pagamentos).
 *
 * Pré-requisitos (credenciais admin + acesso ao Secret Manager):
 *   gcloud auth application-default login
 *
 * Por padrão só mexe em quem está com o nome genérico — o caso sem discussão.
 * Com `--all` ele também sincroniza quem tem nome de Google/Apple diferente do
 * perfil NexaGO, e aí atenção: o nome do login às vezes é MAIS completo que o
 * que o atleta digitou no onboarding ("Anna Paula Soares" → "Anna Paula"), ou
 * seja, nem toda troca é ganho. Rode o dry-run e leia a lista antes.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-asaas-customer-names.js --project <projectId>          # dry-run
 *   node scripts/backfill-asaas-customer-names.js --project <projectId> --yes
 *   node scripts/backfill-asaas-customer-names.js --project <projectId> --all    # dry-run de tudo
 *   node scripts/backfill-asaas-customer-names.js --project <projectId> --yes --limit 5
 */

const admin = require("firebase-admin");
const {SecretManagerServiceClient} = require("@google-cloud/secret-manager");
// Mesma precedência de campos da Cloud Function — importar em vez de repetir
// evita que script e produção discordem sobre qual nome é o do pagador.
const {pickAthletePayerName, GENERIC_PAYER_NAME} = require("../lib/asaas-customer");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
/** Sem `--all`, só corrige quem está com o nome genérico no Asaas. */
const ALL = process.argv.includes("--all");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const auth = admin.auth();

async function secret(name) {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${name}/versions/latest`,
  });
  return version.payload.data.toString().trim();
}

async function main() {
  const apiKey = await secret("ASAAS_API_KEY");
  let env = "production";
  try {
    env = (await secret("ASAAS_ENV")).toLowerCase() === "sandbox" ?
      "sandbox" :
      "production";
  } catch {
    // sem o secret, assume produção (mesmo default do asaas-client)
  }
  const baseUrl = env === "sandbox" ?
    "https://api-sandbox.asaas.com" :
    "https://api.asaas.com";
  console.log(`Asaas: ${baseUrl} (env=${env}) | projeto: ${projectId}`);
  console.log(APPLY ? "MODO: aplicando alterações" : "MODO: dry-run (use --yes para aplicar)");
  console.log(ALL ?
    "ESCOPO: todos os customers com nome diferente do perfil" :
    "ESCOPO: só os que estão com o nome genérico (use --all para sincronizar todos)");

  // Espelha `fetchAsaas`: GET não pode levar Content-Type (o Asaas responde 403).
  const asaas = async (path, {method = "GET", body} = {}) => {
    const headers = {access_token: apiKey};
    if (method !== "GET") headers["Content-Type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Asaas ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : {};
  };

  // `users/{uid}/asaas/customer` — o collectionGroup "asaas" também pega o das
  // arenas (`arenas/{id}/asaas/customer`), que não é atleta e fica de fora.
  const snaps = await db.collectionGroup("asaas").get();
  const targets = [];
  for (const doc of snaps.docs) {
    const match = /^users\/([^/]+)\/asaas\/customer$/.exec(doc.ref.path);
    if (!match) continue;
    const customerId = String(doc.data().customerId ?? "").trim();
    if (!customerId) continue;
    targets.push({uid: match[1], customerId, ref: doc.ref, cached: doc.data()});
  }
  console.log(`customers de atleta encontrados: ${targets.length}`);

  let corrigidos = 0;
  let jaOk = 0;
  let semNome = 0;
  let falhas = 0;
  let foraDoEscopo = 0;
  let processados = 0;

  for (const t of targets) {
    if (LIMIT > 0 && processados >= LIMIT) break;
    processados++;

    const userData = (await db.doc(`users/${t.uid}`).get()).data();
    let authName = "";
    if (!userData || !pickAthletePayerNameHasDoc(userData)) {
      try {
        authName = (await auth.getUser(t.uid)).displayName?.trim() ?? "";
      } catch {
        // conta sem Auth
      }
    }
    const nome = pickAthletePayerName(userData, authName);

    if (nome === GENERIC_PAYER_NAME) {
      semNome++;
      console.log(`- ${t.uid} ${t.customerId}: sem nome em lugar nenhum, pulando`);
      continue;
    }

    let atual = "";
    try {
      atual = String((await asaas(`/v3/customers/${encodeURIComponent(t.customerId)}`)).name ?? "").trim();
    } catch (e) {
      falhas++;
      const motivo = e.message.startsWith("Asaas 404") ?
        "customer não existe nesta conta Asaas — a própria CF recria na próxima cobrança" :
        e.message;
      console.log(`! ${t.uid} ${t.customerId}: ${motivo}`);
      continue;
    }

    if (!ALL && atual !== GENERIC_PAYER_NAME) {
      foraDoEscopo++;
      continue;
    }

    if (atual === nome) {
      jaOk++;
      // O cache pode estar sem `name` (docs anteriores ao fix): grava pra não
      // disparar um PUT redundante na próxima cobrança.
      if (APPLY && String(t.cached.name ?? "").trim() !== nome) {
        await t.ref.set({name: nome}, {merge: true});
      }
      continue;
    }

    console.log(`${APPLY ? "→" : "(dry)"} ${t.uid} ${t.customerId}: "${atual}" → "${nome}"`);
    if (!APPLY) {
      corrigidos++;
      continue;
    }

    try {
      // Mesmo payload do `updateAsaasCustomer` da Cloud Function: e-mail e
      // CPF vêm do cache, então o PUT não depende do Asaas tratar campo
      // ausente como "não mexer".
      await asaas(`/v3/customers/${encodeURIComponent(t.customerId)}`, {
        method: "PUT",
        body: {
          name: nome,
          email: String(t.cached.email ?? "").trim() || `athlete+${t.uid}@nexago.app`,
          cpfCnpj: String(t.cached.cpfCnpj ?? "").trim(),
          notificationDisabled: true,
        },
      });
      await t.ref.set({name: nome}, {merge: true});
      corrigidos++;
    } catch (e) {
      falhas++;
      console.log(`! ${t.uid} ${t.customerId}: falha ao renomear — ${e.message}`);
    }
  }

  console.log("---");
  console.log(`renomeados${APPLY ? "" : " (seriam)"}: ${corrigidos}`);
  console.log(`já corretos: ${jaOk}`);
  console.log(`sem nome cadastrado: ${semNome}`);
  console.log(`fora do escopo (nome não genérico): ${foraDoEscopo}`);
  console.log(`falhas: ${falhas}`);
}

/** `true` se o doc do atleta já tem algum campo de nome preenchido. */
function pickAthletePayerNameHasDoc(userData) {
  return pickAthletePayerName(userData) !== GENERIC_PAYER_NAME;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
