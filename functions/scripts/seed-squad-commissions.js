/* eslint-disable */
/**
 * Grava embaixadores e comissões de exemplo para QA da tela Squad › Comissões.
 *
 * A comissão de verdade nasce da atribuição no checkout (código, link ou QR), que ainda não
 * existe; até lá este script é o único jeito de ver a tela com dados. Tudo que ele grava tem id
 * `seed-squad-*` e os embaixadores não são usuários reais (push/carteira caem em uids fictícios).
 *
 *   squadAmbassadors/seed-squad-*      contrato (nome, nível, código, %)
 *   squadCommissions/seed-squad-*      comissões em todos os status, com datas relativas a hoje
 *   squadPayouts/<último 06 ou 20>     repasse já aprovado das comissões "pagas" (só se não existir)
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-squad-commissions.js --project <id>          # mostra o que gravaria
 *   node scripts/seed-squad-commissions.js --project <id> --yes
 *   node scripts/seed-squad-commissions.js --project <id> --clear --yes   # apaga só o que o seed gravou
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const CLEAR = process.argv.includes("--clear");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
admin.initializeApp({projectId});
const db = admin.firestore();
const PREFIX = "seed-squad-";

const AMBASSADORS = [
  {id: "jv", displayName: "João Victor", tier: "amb", code: "JOAOV10", commissionPct: 10},
  {id: "mr", displayName: "Marcos Reis", tier: "amb", code: "MARCOS10", commissionPct: 10},
  {id: "rb", displayName: "Rayssa Brito", tier: "pro", code: "RAYSSA", commissionPct: 15},
  {id: "ac", displayName: "Ana Clara Dias", tier: "ath", code: "ANACLARA", commissionPct: 5},
  {id: "pl", displayName: "Pedro Lima", tier: "cap", code: "PEDRO10", commissionPct: 10},
  {id: "vs", displayName: "Varoni Santos", tier: "pro", code: "VARONI", commissionPct: 15},
  {id: "jp", displayName: "Juliana Prado", tier: "amb", code: "JUPRADO", commissionPct: 10},
];

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (daysAgo, hour = 12, minute = 0) => {
  const d = new Date(now - daysAgo * DAY);
  d.setUTCHours(hour + 3, minute, 0, 0); // horário de SP
  return d;
};
/** Último dia de repasse (06 ou 20) antes de hoje: as comissões "pagas" saíram nele. */
const lastPayout = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (d.getDate() > 20) return `${y}-${pad(m)}-20`;
  if (d.getDate() > 6) return `${y}-${pad(m)}-06`;
  return m === 1 ? `${y - 1}-12-20` : `${y}-${pad(m - 1)}-20`;
})();

/** [embaixador, atleta, atletas, origem, receita líquida (R$), status, dias atrás, hora] */
const ROWS = [
  ["jv", "Lucas M.", 1, "code", 120, "pending", 0, 14, 12],
  ["mr", "Equipe CFC", 4, "link", 400, "pending", 0, 11, 30],
  ["jv", "Tatiane R.", 1, "link", 140, "released", 0, 9, 40],
  ["rb", "Camila T.", 1, "qr", 140, "released", 1, 18],
  ["ac", "Júlia P.", 1, "code", 120, "released", 1, 16],
  ["pl", "Mateus G.", 1, "code", 100, "released", 1, 10],
  ["vs", "Igor L.", 1, "link", 140, "released", 3, 15],
  ["jv", "Henrique A.", 1, "link", 100, "canceled", 4, 20],
  ["jp", "Nina S.", 1, "qr", 120, "released", 4, 9],
  ["mr", "Equipe CFC", 6, "code", 600, "paid", 12, 19],
  ["rb", "Bruna K.", 1, "code", 160, "paid", 14, 8],
];

function commissionDoc([amb, athlete, athletes, origin, net, status, daysAgo, hour, minute]) {
  const a = AMBASSADORS.find((x) => x.id === amb);
  const registeredAt = at(daysAgo, hour, minute ?? 0);
  const netCents = net * 100;
  const feeCents = Math.round(netCents * 0.0499 / 0.9501);
  const amountCents = Math.round(netCents * a.commissionPct / 100);
  const releasedAt = status === "pending" ? null : new Date(registeredAt.getTime() + 20 * 60 * 1000);
  const timeline = [
    {at: registeredAt, event: "registered", by: null, note: `Inscrição com ${origin === "code" ? "código" : origin === "qr" ? "QR" : "link"}`},
  ];
  if (releasedAt) timeline.push({at: releasedAt, event: "released", by: null, note: "Pagamento confirmado"});
  if (status === "paid") timeline.push({at: new Date(`${lastPayout}T12:00:00-03:00`), event: "paid", by: null, note: `Repasse ${lastPayout}`});
  if (status === "canceled") timeline.push({at: new Date(registeredAt.getTime() + DAY), event: "canceled", by: null, note: "Reembolso"});
  return {
    ambassadorId: PREFIX + amb,
    ambassadorName: a.displayName,
    ambassadorCode: a.code,
    ambassadorTier: a.tier,
    registrationId: `${PREFIX}reg-${athlete.toLowerCase().replace(/\W+/g, "-")}-${daysAgo}`,
    tournamentId: `${PREFIX}torneio`,
    tournamentName: "Copa NexaGO · Etapa Outubro",
    categoryName: athletes > 1 ? "Equipes Mista" : "Dupla Mista C",
    paymentId: `pay_${PREFIX}${Math.abs(hash(athlete + daysAgo)).toString(36)}`,
    convertedAthleteIds: Array.from({length: athletes}, (_, i) => `${PREFIX}atleta-${i}`),
    convertedLabel: athletes > 1 ? `${athlete} (${athletes} atl.)` : athlete,
    origin,
    grossCents: netCents + feeCents,
    feeCents,
    netCents,
    pct: a.commissionPct,
    amountCents,
    rulesVersion: 1,
    status,
    cancelReason: status === "canceled" ? "refund" : null,
    cancelNote: null,
    payoutId: status === "paid" ? lastPayout : null,
    hold: null,
    timeline,
    registeredAt,
    createdAt: registeredAt,
    releasedAt,
    paidAt: status === "paid" ? new Date(`${lastPayout}T12:00:00-03:00`) : null,
    canceledAt: status === "canceled" ? new Date(registeredAt.getTime() + DAY) : null,
  };
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

async function main() {
  if (CLEAR) {
    const cols = ["squadAmbassadors", "squadCommissions", "squadPayouts"];
    let n = 0;
    for (const col of cols) {
      const snap = await db.collection(col).get();
      const seeded = snap.docs.filter((d) => d.id.startsWith(PREFIX) || d.data().seed === true);
      n += seeded.length;
      if (APPLY) await Promise.all(seeded.map((d) => d.ref.delete()));
    }
    console.log(`${APPLY ? "Apagados" : "Apagaria"} ${n} docs seed-squad-* em ${projectId}.`);
    return;
  }

  const commissions = ROWS.map((r, i) => [`${PREFIX}${String(i + 1).padStart(2, "0")}`, commissionDoc(r)]);
  console.log(`\nProjeto ${projectId}: ${AMBASSADORS.length} embaixadores, ${commissions.length} comissões.`);
  for (const [id, c] of commissions) {
    console.log(`  ${id}  ${c.ambassadorName.padEnd(15)} ${c.convertedLabel.padEnd(18)} R$ ${(c.amountCents / 100).toFixed(2)}  ${c.status}`);
  }
  const payoutRef = db.collection("squadPayouts").doc(lastPayout);
  const payoutExists = (await payoutRef.get()).exists;
  console.log(payoutExists ? `\nsquadPayouts/${lastPayout} já existe: não mexe.` : `\nGravaria squadPayouts/${lastPayout} (done) com as pagas.`);
  if (!APPLY) {
    console.log("\nDRY-RUN — use --yes para gravar.");
    return;
  }

  const batch = db.batch();
  for (const a of AMBASSADORS) {
    batch.set(db.collection("squadAmbassadors").doc(PREFIX + a.id), {
      displayName: a.displayName,
      tier: a.tier,
      code: a.code,
      commissionPct: a.commissionPct,
      rulesVersion: 1,
      status: "active",
      seed: true,
    });
  }
  for (const [id, c] of commissions) batch.set(db.collection("squadCommissions").doc(id), c);
  if (!payoutExists) {
    const paid = commissions.filter(([, c]) => c.status === "paid");
    const by = new Map();
    for (const [id, c] of paid) {
      const item = by.get(c.ambassadorId) ?? {
        ambassadorId: c.ambassadorId, ambassadorName: c.ambassadorName, commissionIds: [], adjustmentIds: [],
        grossCents: 0, adjustmentsCents: 0, netCents: 0, status: "credited", holdReason: null,
      };
      item.commissionIds.push(id);
      item.grossCents += c.amountCents;
      item.netCents += c.amountCents;
      by.set(c.ambassadorId, item);
    }
    const items = [...by.values()];
    batch.set(payoutRef, {
      scheduledFor: lastPayout,
      status: "done",
      approvedBy: {uid: "seed", name: "Seed de QA"},
      approvedAt: new Date(`${lastPayout}T12:00:00-03:00`),
      items,
      totalCents: items.reduce((n, i) => n + i.netCents, 0),
      creditedCount: items.length,
      failedCount: 0,
      seed: true,
    });
  }
  await batch.commit();
  console.log("\nGravado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
