/* eslint-disable */
/**
 * Métricas do Clube de Vantagens Nexa (spec docs/product/vantagens-nexago-spec.md). Só leitura.
 *
 * Lê `benefitEvents` no período e mostra, por parceiro e no clube inteiro, o total de eventos e
 * os atletas únicos de cada tipo (card visto, clube aberto, parceiro visto, clique, cupom
 * copiado, lead e a resposta do "Conseguiu usar?"). Atleta único é o número honesto para levar à
 * reunião: toque repetido não infla. A mesma conta aparece na aba Métricas do backoffice.
 *
 * Também mostra a origem dos cliques (inclusive pós-jogo, dia de torneio, destaque, busca, mapa e
 * "Meus benefícios") e os resgates confirmados pelo parceiro (`benefitRedemptions`, import do
 * backoffice): só `matched` é economia atribuída a um atleta; `ambiguous`/`unmatched` aparecem à
 * parte para a equipe resolver.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/benefits-report.js --project <id> [--days 7] [--csv metricas.csv]
 */

const fs = require("fs");
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
const days = Number(argValue("--days") || 0);
const csvPath = argValue("--csv");

admin.initializeApp({projectId});
const db = admin.firestore();

const TYPES = [
  "hub_card_view",
  "club_view",
  "partner_view",
  "cta_click",
  "code_copy",
  "lead_submit",
  "use_confirmed",
  "use_denied",
];
const LABELS = {
  hub_card_view: "Card do Hub visto",
  club_view: "Clube aberto",
  partner_view: "Parceiro visto",
  cta_click: "Clique no botão",
  code_copy: "Cupom copiado",
  lead_submit: "Lead enviado",
  use_confirmed: "Disse que usou",
  use_denied: "Disse que não conseguiu usar",
};
const SOURCE_LABELS = {
  hub_card: "Card do Hub",
  club_list: "Lista do clube",
  sponsor_banner: "Banner do patrocinador",
  competir_web: "Competir (portal)",
  home: "Início",
  deeplink: "Link",
  push: "Push",
  post_game: "Pós-jogo",
  tournament_day: "Dia de torneio",
  featured: "Destaque da semana",
  search: "Busca",
  map: "Mapa",
  my_benefits: "Meus benefícios",
  unknown: "Desconhecida",
};
const REDEMPTION_STATUSES = ["matched", "ambiguous", "unmatched"];

function brl(cents) {
  return (cents / 100).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function run() {
  let query = db.collection("benefitEvents");
  if (days > 0) {
    query = query.where("createdAt", ">=", new Date(Date.now() - days * 24 * 3600 * 1000));
  }
  let redemptionsQuery = db.collection("benefitRedemptions");
  if (days > 0) {
    redemptionsQuery = redemptionsQuery.where("redeemedAt", ">=", new Date(Date.now() - days * 24 * 3600 * 1000));
  }
  const [eventsSnap, partnersSnap, redemptionsSnap] = await Promise.all([
    query.get(),
    db.collection("partners").get(),
    redemptionsQuery.get(),
  ]);
  const names = Object.fromEntries(partnersSnap.docs.map((d) => [d.id, d.get("name") || d.id]));

  // chave: partnerId ("" = clube) → tipo → {total, uids}
  const buckets = new Map();
  const sources = new Map();
  for (const doc of eventsSnap.docs) {
    const e = doc.data();
    const key = e.partnerId || "";
    if (!buckets.has(key)) buckets.set(key, new Map());
    const byType = buckets.get(key);
    if (!byType.has(e.type)) byType.set(e.type, {total: 0, uids: new Set()});
    const b = byType.get(e.type);
    b.total++;
    b.uids.add(e.uid);
    if (e.type === "cta_click") sources.set(e.source || "unknown", (sources.get(e.source || "unknown") || 0) + 1);
  }

  // Resgates confirmados pelo parceiro: por parceiro e status (só `matched` é economia do atleta).
  const redemptions = new Map();
  for (const doc of redemptionsSnap.docs) {
    const r = doc.data();
    const key = r.partnerId || "";
    if (!redemptions.has(key)) {
      redemptions.set(key, Object.fromEntries(REDEMPTION_STATUSES.map((s) => [s, {count: 0, cents: 0, uids: new Set()}])));
    }
    const b = redemptions.get(key)[r.status];
    if (!b) continue;
    b.count++;
    b.cents += Number.isInteger(r.discountCents) ? r.discountCents : 0;
    if (r.uid) b.uids.add(r.uid);
  }
  const redemptionRows = [...redemptions].map(([partnerId, by]) => ({
    parceiro: names[partnerId] || partnerId,
    confirmados: by.matched.count,
    atletas: by.matched.uids.size,
    economia: brl(by.matched.cents),
    ambiguos: by.ambiguous.count,
    sem_atleta: by.unmatched.count,
  }));

  const rows = [];
  for (const [partnerId, byType] of buckets) {
    for (const type of TYPES) {
      const b = byType.get(type);
      if (!b) continue;
      rows.push({
        parceiro: partnerId ? names[partnerId] || partnerId : "Clube (todos)",
        evento: LABELS[type],
        total: b.total,
        atletas: b.uids.size,
      });
    }
  }

  console.log(`Clube de Vantagens · ${projectId} · ${days > 0 ? `últimos ${days} dias` : "desde o início"}`);
  console.log(`${eventsSnap.size} eventos`);
  console.table(rows);
  if (sources.size > 0) {
    console.log("Origem dos cliques:");
    console.table([...sources].sort((a, b) => b[1] - a[1]).map(([source, total]) => ({
      origem: SOURCE_LABELS[source] || source,
      cliques: total,
    })));
  }
  console.log(`Resgates confirmados pelo parceiro (${redemptionsSnap.size} linhas importadas):`);
  if (redemptionRows.length > 0) console.table(redemptionRows);
  else console.log("  nenhum resgate importado no período.");

  if (csvPath) {
    const header = ["parceiro", "evento", "total", "atletas_unicos"];
    const lines = [
      header.join(";"),
      ...rows.map((r) => [r.parceiro, r.evento, r.total, r.atletas].map(csvCell).join(";")),
      // Resgates confirmados entram como linhas do mesmo CSV (total = resgates; atletas = únicos).
      ...redemptionRows.map((r) => [r.parceiro, "Resgate confirmado pelo parceiro", r.confirmados, r.atletas]
        .map(csvCell).join(";")),
    ];
    fs.writeFileSync(csvPath, "﻿" + lines.join("\n"));
    console.log(`CSV: ${csvPath}`);
  }
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
