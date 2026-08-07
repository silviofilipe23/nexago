/* eslint-disable */
/**
 * Pré-cadastro de arenas ("unclaimed") a partir de scripts/data/unclaimed-arenas-goiania.json.
 *
 * O que faz: cria/atualiza `arenas/pre-<slug>` com `unclaimed: true`, os dados
 * públicos da arena e o WhatsApp de contato. Essas arenas aparecem SÓ na busca
 * do atleta, com selo de "ainda não é parceira" e botão "Entre em contato" —
 * nunca no fluxo de reserva (ver watchPartnerArenas/fetchPartnerArenas).
 *
 * Idempotente: o doc id vem do slug, então rodar de novo atualiza em vez de
 * duplicar. Duas travas importantes:
 *   - arena JÁ REIVINDICADA (doc existe sem `unclaimed: true`) é PULADA — o
 *     script nunca "des-reivindica" uma arena que já fechou com a nexaGO.
 *   - contadores de contato (contactClicksTotal/contactAthletesCount) só são
 *     inicializados na criação; re-rodar nunca zera o histórico.
 *
 * Entradas sem `whatsapp` ou com `active: false` no JSON são puladas e
 * relatadas: sem WhatsApp não existe botão de contato, que é o ponto da feature.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-unclaimed-arenas.js --project volley-track-dev-4596c
 *   node scripts/seed-unclaimed-arenas.js --project <projectId> --yes
 *   node scripts/seed-unclaimed-arenas.js --project <projectId> --yes --slug arena-beach-t3
 *
 * Sem --yes é DRY-RUN: imprime o que seria criado/atualizado/pulado sem escrever.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const SINGLE_SLUG = argValue("--slug");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;

const DATA_FILE = path.join(__dirname, "data", "unclaimed-arenas-goiania.json");
const DOC_ID_PREFIX = "pre-";

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

/** WhatsApp válido = E.164 brasileiro de celular: 55 + DDD (2) + 9 + 8 dígitos. */
function isValidBrazilianMobile(value) {
  return typeof value === "string" && /^55\d{2}9\d{8}$/.test(value);
}

function loadArenas() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const source = typeof raw.source === "string" ? raw.source : "unknown";
  const list = Array.isArray(raw.arenas) ? raw.arenas : [];
  return {source, list};
}

function buildPayload(entry, source) {
  const payload = {
    unclaimed: true,
    source,
    name: entry.name,
    city: entry.city,
    state: entry.state,
    whatsapp: entry.whatsapp,
    courtTypes: Array.isArray(entry.courtTypes) ? entry.courtTypes : [],
    surfaces: ["Areia"],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (typeof entry.address === "string" && entry.address.trim().length > 0) {
    payload.address = entry.address.trim();
  }
  // `latitude`/`longitude` são os nomes que AS DUAS superfícies leem
  // (ArenaListItem no Flutter e readLatLng no shared TS). Sem eles a arena
  // escapa do filtro de raio e da ordenação por distância — aparece na busca
  // mas nunca é medida.
  if (isValidLatLng(entry.latitude, entry.longitude)) {
    payload.latitude = entry.latitude;
    payload.longitude = entry.longitude;
  }
  return payload;
}

/** Caixa da região metropolitana de Goiânia — recusa coordenada de outra praça. */
function isValidLatLng(lat, lng) {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -16.95 && lat <= -16.55 && lng >= -49.5 && lng <= -49.1
  );
}

async function run() {
  const {source, list} = loadArenas();
  const entries = SINGLE_SLUG ? list.filter((e) => e.slug === SINGLE_SLUG) : list;

  if (entries.length === 0) {
    console.error(
      SINGLE_SLUG
        ? `Nenhuma arena com slug "${SINGLE_SLUG}" em ${path.basename(DATA_FILE)}.`
        : `Nenhuma arena em ${path.basename(DATA_FILE)}.`,
    );
    process.exit(1);
  }

  admin.initializeApp({projectId});
  const db = admin.firestore();

  const seenSlugs = new Set();
  let created = 0;
  let updated = 0;
  const skipped = [];

  for (const entry of entries) {
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    if (!slug) {
      skipped.push({name: entry.name ?? "(sem nome)", reason: "entrada sem slug"});
      continue;
    }
    if (seenSlugs.has(slug)) {
      skipped.push({name: entry.name, reason: `slug duplicado no JSON: ${slug}`});
      continue;
    }
    seenSlugs.add(slug);

    if (entry.active === false) {
      skipped.push({name: entry.name, reason: entry.skipReason || "inativa"});
      continue;
    }
    if (!isValidBrazilianMobile(entry.whatsapp)) {
      skipped.push({
        name: entry.name,
        reason: entry.skipReason || `WhatsApp ausente ou inválido: ${entry.whatsapp}`,
      });
      continue;
    }

    const docId = `${DOC_ID_PREFIX}${slug}`;
    const ref = db.collection("arenas").doc(docId);
    const snap = await ref.get();

    if (snap.exists && snap.data()?.unclaimed !== true) {
      skipped.push({
        name: entry.name,
        reason: "arena já reivindicada — não vou sobrescrever",
      });
      continue;
    }

    const payload = buildPayload(entry, source);
    if (!snap.exists) {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      payload.contactClicksTotal = 0;
      payload.contactAthletesCount = 0;
      created += 1;
    } else {
      updated += 1;
    }

    if (APPLY) {
      await ref.set(payload, {merge: true});
    }
    console.log(
      `${snap.exists ? "atualiza" : "cria    "} ${docId} — ${entry.name} (${entry.city})`,
    );
  }

  console.log("");
  console.log(`Projeto: ${projectId}`);
  console.log(`A criar:     ${created}`);
  console.log(`A atualizar: ${updated}`);
  console.log(`Pulados:     ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  - ${s.name}: ${s.reason}`);
  }
  if (!APPLY) {
    console.log("");
    console.log("DRY-RUN: nada foi escrito. Rode de novo com --yes para aplicar.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
