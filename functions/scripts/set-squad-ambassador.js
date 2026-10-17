/* eslint-disable */
/**
 * Cria ou encerra o contrato de embaixador de um usuário real (`squadAmbassadors/{uid}`).
 *
 * As telas Embaixadores/Perfil do backoffice ainda não existem; até lá este script é o jeito de
 * dar um código a alguém. O código é o que o atleta digita no checkout ou chega por
 * `?squad=CODIGO` no portal; tem de ser único entre contratos ativos.
 *
 *   { displayName, tier: ath|amb|pro|cap, code, commissionPct, followerDiscountPct, rulesVersion, status }
 *
 * O % padrão (comissão e desconto do seguidor) é o do nível nas regras vigentes (`squadConfig/rules`;
 * no Pro, o piso da faixa) e fica congelado no contrato com a versão, como a tela 06 promete.
 *
 * Uso (na pasta functions/):
 *   node scripts/set-squad-ambassador.js --project <id> --uid <uid> --tier amb --code JOAO10           # dry-run
 *   node scripts/set-squad-ambassador.js --project <id> --uid <uid> --tier pro --code RAYSSA --pct 12 --discount 15 --yes
 *   node scripts/set-squad-ambassador.js --project <id> --uid <uid> --end --yes                        # encerra
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const END = process.argv.includes("--end");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
const uid = argValue("--uid");
const tier = argValue("--tier");
const code = (argValue("--code") || "").trim().toUpperCase();
const pctArg = argValue("--pct");
if (!projectId || !uid) {
  console.error("Informe --project <id> e --uid <uid>.");
  process.exit(1);
}
if (!END && (!["ath", "amb", "pro", "cap"].includes(tier) || !/^[A-Z0-9]{3,20}$/.test(code))) {
  console.error("Informe --tier ath|amb|pro|cap e --code (3 a 20 letras/números).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const DEFAULT_PCT = {ath: 5, amb: 10, pro: 10, cap: 10};
const DEFAULT_DISCOUNT = {ath: 10, amb: 10, pro: 15, cap: 10};

async function main() {
  const ref = db.collection("squadAmbassadors").doc(uid);
  const current = (await ref.get()).data() ?? null;
  console.log(`\nsquadAmbassadors/${uid} em ${projectId}:`, current ? JSON.stringify(current) : "(não existe)");

  if (END) {
    if (!current) return console.log("Nada a encerrar.");
    console.log("Encerraria o contrato (status: ended).");
    if (APPLY) await ref.update({status: "ended", endedAt: new Date()});
    return console.log(APPLY ? "Encerrado." : "\nDRY-RUN — use --yes.");
  }

  const user = await admin.auth().getUser(uid);
  const rulesDoc = (await db.collection("squadConfig").doc("rules").get()).data();
  const rulesVersion = typeof rulesDoc?.version === "number" ? rulesDoc.version : 1;
  const tierPct = rulesDoc?.rules?.tiers?.[tier]?.commissionPct;
  const pct = pctArg !== undefined ? Number(pctArg) : Array.isArray(tierPct) ? tierPct[0] : (tierPct ?? DEFAULT_PCT[tier]);
  if (!(pct >= 0 && pct <= 30)) throw new Error(`% inválido: ${pct}`);
  const tierDiscount = rulesDoc?.rules?.tiers?.[tier]?.followerDiscountPct;
  const discountArg = argValue("--discount");
  const followerDiscountPct = discountArg !== undefined ? Number(discountArg) :
    typeof tierDiscount === "number" ? tierDiscount : DEFAULT_DISCOUNT[tier];
  if (!(followerDiscountPct >= 0 && followerDiscountPct <= 30)) throw new Error(`Desconto inválido: ${followerDiscountPct}`);

  const clash = await db.collection("squadAmbassadors").where("code", "==", code).where("status", "==", "active").get();
  const other = clash.docs.find((d) => d.id !== uid);
  if (other) throw new Error(`O código ${code} já é de ${other.data().displayName} (${other.id}).`);

  const next = {
    displayName: user.displayName || user.email || uid,
    tier,
    code,
    commissionPct: pct,
    followerDiscountPct,
    rulesVersion,
    status: "active",
    updatedAt: new Date(),
    ...(current ? {} : {createdAt: new Date()}),
  };
  console.log("\nGravaria:", JSON.stringify(next, null, 2));
  if (!APPLY) return console.log("\nDRY-RUN — use --yes para gravar.");
  await ref.set(next, {merge: true});
  console.log("\nGravado.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
