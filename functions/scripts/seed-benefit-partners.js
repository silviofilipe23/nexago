/* eslint-disable */
/**
 * Cadastra os parceiros iniciais do Clube de Vantagens Nexa (spec
 * docs/product/vantagens-nexago-spec.md) e, opcionalmente, quem testa.
 *
 *   - Fast Açaí: 10% OFF, botão de link + cupom fixo NEXAGO10, para todos.
 *     Sem `--fast-link` ela entra DESLIGADA (o botão não teria para onde ir).
 *   - LinQ Telecom: patrocinador oficial, formulário de lead, só para quem testa
 *     (`audience: testers`) até o contrato fechar.
 *
 * Idempotente: regrava os dois docs (merge), preservando `createdAt`. Depois do
 * primeiro cadastro, o lugar de editar é o backoffice (App do atleta › Clube).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-benefit-partners.js --project <id>                 # mostra o que gravaria
 *   node scripts/seed-benefit-partners.js --project <id> --yes \
 *     --fast-link https://... --fast-logo https://... --linq-logo https://... \
 *     --linq-benefit "Instalação grátis" --testers uid1,uid2
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const hasFlag = (flag) => process.argv.includes(flag);

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}

function httpsOrNull(value, flag) {
  if (!value) return null;
  if (!/^https:\/\/.+/.test(value)) {
    console.error(`${flag} precisa ser uma URL https.`);
    process.exit(1);
  }
  return value;
}

const fastLink = httpsOrNull(argValue("--fast-link"), "--fast-link");
const fastLogo = httpsOrNull(argValue("--fast-logo"), "--fast-logo");
const linqLogo = httpsOrNull(argValue("--linq-logo"), "--linq-logo");
const linqBenefit = (argValue("--linq-benefit") || "Instalação grátis").trim().slice(0, 80);
const testers = (argValue("--testers") || "").split(",").map((s) => s.trim()).filter(Boolean);
const write = hasFlag("--yes");

admin.initializeApp({projectId});
const db = admin.firestore();
const {FieldValue} = admin.firestore;

const ACTOR = "Script seed-benefit-partners";

const PARTNERS = {
  "fast-acai": {
    name: "Fast Açaí",
    logoUrl: fastLogo,
    category: "food",
    benefitHighlight: "10% OFF",
    benefitTitle: "10% de desconto em todo pedido",
    description: "Açaí no capricho, com entrega. Peça pelo cardápio digital da Fast com o link da NexaGO.",
    howToUse: [
      "Toque em Pedir com 10% off. O cardápio da Fast abre já com o link da NexaGO.",
      "Monte o pedido normalmente.",
      "No fechamento, use o cupom NEXAGO10.",
    ],
    terms: "Desconto válido para pedidos no cardápio digital da Fast Açaí feitos pelo link da NexaGO. " +
      "Não cumulativo com outras promoções. A Fast Açaí pode alterar ou encerrar a oferta a qualquer momento.",
    ctaType: "link",
    ctaLabel: "Pedir com 10% off",
    link: fastLink,
    couponMode: "fixed",
    couponCode: "NEXAGO10",
    brandColor: "#5E1E7A",
    cities: [],
    isMasterSponsor: false,
    priority: 50,
    active: Boolean(fastLink),
    audience: "all",
    leadConsentText: null,
    leadSuccessMessage: null,
  },
  linq: {
    name: "LinQ Telecom",
    logoUrl: linqLogo,
    category: "services",
    benefitHighlight: "GRÁTIS",
    benefitTitle: linqBenefit,
    description: "Internet fibra para quem vive o esporte. Patrocinador oficial da NexaGO.",
    howToUse: [
      "Toque em Quero contratar.",
      "Confira seus dados e autorize o envio para a LinQ.",
      "A LinQ chama você no WhatsApp para fechar o plano.",
    ],
    terms: "Oferta da LinQ Telecom, sujeita à viabilidade técnica no endereço. A NexaGO só envia seus dados " +
      "com a sua autorização.",
    ctaType: "lead_form",
    ctaLabel: "Quero contratar",
    link: null,
    couponMode: "none",
    couponCode: null,
    brandColor: "#0F62FE",
    cities: [],
    isMasterSponsor: true,
    priority: 100,
    active: true,
    audience: "testers",
    leadConsentText: null,
    leadSuccessMessage: "Pronto! A LinQ vai falar com você pelo WhatsApp",
  },
};

async function run() {
  for (const [id, data] of Object.entries(PARTNERS)) {
    const ref = db.doc(`partners/${id}`);
    const snap = await ref.get();
    console.log(`${snap.exists ? "atualiza" : "cria"} partners/${id}: ${data.name} · ativo=${data.active} · público=${data.audience}`);
    if (!write) continue;
    await ref.set({
      ...data,
      ...(snap.exists ? {} : {createdAt: FieldValue.serverTimestamp(), createdByName: ACTOR}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "script",
      updatedByName: ACTOR,
    }, {merge: true});
  }

  if (testers.length > 0) {
    console.log(`quem testa: ${testers.join(", ")}`);
    if (write) {
      const cfgRef = db.doc("appConfig/benefitsClub");
      const cfg = (await cfgRef.get()).data() || {};
      await cfgRef.set({
        enabled: cfg.enabled === true,
        testerUids: Array.from(new Set([...(cfg.testerUids || []), ...testers])).slice(0, 50),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "script",
        updatedByName: ACTOR,
      });
    }
  }

  if (!fastLink) console.log("Aviso: sem --fast-link a Fast Açaí fica desligada.");
  console.log(write ? "Gravado." : "Nada gravado (rode com --yes).");
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
