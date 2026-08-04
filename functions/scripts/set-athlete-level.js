/* eslint-disable */
/**
 * Muda o NÍVEL declarado de um atleta em um esporte — inclusive PARA BAIXO
 * (ex.: `intermediario_1` → `iniciante_2`), o que nenhum cliente consegue
 * fazer: as rules (`athleteLevelsNotDowngraded()`) e a UI do app/portal só
 * deixam SUBIR. O Admin SDK passa por cima das rules.
 *
 * Escreve nos DOIS lugares que definem o nível:
 *
 * 1. `users/{uid}.sportOnboarding.levelsBySport[sportCode]` — nível declarado,
 *    fonte canônica de elegibilidade de categoria e de exibição. O espelho
 *    `public_profiles/{uid}` atualiza sozinho via `onUserWrittenSyncPublicProfile`.
 * 2. `artifacts/{projectId}/public/data/athleteRatings/{uid}_{sportCode}` —
 *    estado da escada de rating (Glicko-2). SEM isso o nível volta: a engine
 *    decide promoção/rebaixamento pelo `levelCode` do doc de rating, então um
 *    rebaixamento manual sem realinhar deixa o atleta na zona de promoção do
 *    nível antigo e o passe diário o devolve para cima.
 *
 * O realinhamento do rating puxa o rating para dentro da banda do nível novo
 * (`min` ao descer, `max` ao subir — mesma semântica do self-upgrade em
 * `functions/src/rating-triggers.ts`), reseta o RD para `initialRd` (RD alto
 * bloqueia decisão da escada via `maxRdForDecision` até consolidar de novo) e
 * limpa observação/notificação. Partidas, vitórias e derrotas ficam intactas.
 *
 * ORDEM DAS ESCRITAS (não inverter): rating ANTES do doc do usuário. O trigger
 * `onUserWrittenTrackLevelChanges` dispara na escrita de `users/{uid}` e
 * re-seeda o rating quando o nível SOBE; com o doc de rating já no nível novo
 * ele cai no guard `current.levelCode === newLevel.code` e não faz nada.
 *
 * Auditoria: cada mudança gera um doc em `users/{uid}/levelHistory`
 * (`reason: "admin_manual"`, `actor: "script:set-athlete-level"`).
 *
 * Pré-requisitos (credenciais admin):
 *   firebase login  # ADC do Firebase CLI já basta
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   # 1) só inspecionar (sem --level não escreve nada):
 *   node scripts/set-athlete-level.js --project volley-track-dev-4596c --email fulano@x.com
 *
 *   # 2) dry-run da mudança:
 *   node scripts/set-athlete-level.js --project <id> --email fulano@x.com \
 *     --sport VOLEI_PRAIA --level iniciante_2
 *
 *   # 3) aplicar:
 *   node scripts/set-athlete-level.js --project <id> --uid <uid> \
 *     --sport VOLEI_PRAIA --level "Iniciante 2" --yes
 *
 *   # 4) mexer só no nível declarado, sem tocar no rating:
 *   node scripts/set-athlete-level.js --project <id> --uid <uid> \
 *     --level open --keep-rating --yes
 *
 * Flags:
 *   --project <id>   projeto (ou GCLOUD_PROJECT). Obrigatório.
 *   --uid <uid> | --email <e>   o atleta. Obrigatório (um dos dois).
 *   --sport <CODE>   esporte; padrão = `sportOnboarding.primarySportId`.
 *   --level <nível>  código (`iniciante_2`) ou label ("Iniciante 2").
 *   --reason <txt>   motivo gravado no levelHistory (padrão: admin_manual).
 *   --keep-rating    não realinha `athleteRatings`.
 *   --yes            aplica; sem isso é DRY-RUN.
 */

const admin = require("firebase-admin");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");

/* ------------------------------------------------------------------ *
 * Vocabulário de nível — espelha functions/src/category-level-eligibility.ts
 * e frontend/shared/levels/index.ts. Ranks são 0,1,2,3,5 (o 4 não existe e a
 * numeração não pode mudar: está gravada em athleteRatings.levelRank).
 * ------------------------------------------------------------------ */

const LEVEL_CODES = [
  "iniciante_1",
  "iniciante_2",
  "intermediario_1",
  "intermediario_2",
  "open",
];

const ATHLETE_SPORT_CODES = [
  "VOLEI_PRAIA",
  "VOLEI_QUADRA",
  "BEACH_TENNIS",
  "FUTEVOLEI",
  "FUTEBOL",
  "BASQUETE",
  "TENIS",
  "CORRIDA",
  "OUTROS",
];

/** Esportes com escada de rating (RATED_SPORT_CODES em rating-config.ts). */
const RATED_SPORT_CODES = ["VOLEI_PRAIA", "VOLEI_QUADRA"];

const LEVEL_RANK = {
  iniciante_1: 0,
  iniciante1: 0,
  iniciante_2: 1,
  iniciante2: 1,
  intermediario_1: 2,
  intermediario1: 2,
  intermediario_2: 3,
  intermediario2: 3,
  open: 5,
  // Legados (escada de 3 níveis) — degrau inferior do split.
  iniciante: 0,
  basico: 0,
  intermediario: 2,
  livre: 5,
};

const LEVEL_LABELS = {
  iniciante_1: "Iniciante 1",
  iniciante_2: "Iniciante 2",
  intermediario_1: "Intermediário 1",
  intermediario_2: "Intermediário 2",
  open: "Open",
};

/** Defaults de `DEFAULT_LADDER_CONFIG` (functions/src/rating-config.ts). */
const DEFAULT_LEVELS = [
  {code: "iniciante_1", rank: 0, label: "Iniciante 1", initialRating: 1250, promoteAt: 1420, demoteAt: null},
  {code: "iniciante_2", rank: 1, label: "Iniciante 2", initialRating: 1450, promoteAt: 1570, demoteAt: 1350},
  {code: "intermediario_1", rank: 2, label: "Intermediário 1", initialRating: 1600, promoteAt: 1720, demoteAt: 1500},
  {code: "intermediario_2", rank: 3, label: "Intermediário 2", initialRating: 1750, promoteAt: 1870, demoteAt: 1650},
  {code: "open", rank: 5, label: "Open", initialRating: 1900, promoteAt: null, demoteAt: 1800},
];
const DEFAULT_INITIAL_RD = 300;
const DEFAULT_PROMOTION_PROTECTION_DAYS = 120;
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ *
 * Args
 * ------------------------------------------------------------------ */

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const APPLY = process.argv.includes("--yes");
const KEEP_RATING = process.argv.includes("--keep-rating");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const uidArg = argValue("--uid");
const emailArg = argValue("--email");
const sportArg = argValue("--sport");
const levelArg = argValue("--level");
const reason = (argValue("--reason") || "admin_manual").trim();

if (!projectId) {
  fail("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
}
if (!uidArg && !emailArg) {
  fail("Informe o atleta: --uid <uid> ou --email <email>.");
}
if (sportArg && !ATHLETE_SPORT_CODES.includes(sportArg.trim().toUpperCase())) {
  fail(`--sport inválido '${sportArg}'. Use: ${ATHLETE_SPORT_CODES.join(", ")}.`);
}

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

/* ------------------------------------------------------------------ *
 * Helpers de nível
 * ------------------------------------------------------------------ */

/** Normaliza acento/caixa/espaço preservando underscore (igual ao backend). */
function normalizeLevelKey(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // Remove as marcas de acento soltas pelo NFD (categoria Unicode Mark).
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "");
}

/** Rank a partir de código (`iniciante_2`) ou label ("Iniciante 2"). */
function levelRank(raw) {
  const key = normalizeLevelKey(raw);
  if (!key) return null;
  return key in LEVEL_RANK ? LEVEL_RANK[key] : null;
}

function levelCodeForRank(rank) {
  switch (rank) {
    case 0: return "iniciante_1";
    case 1: return "iniciante_2";
    case 2: return "intermediario_1";
    case 3: return "intermediario_2";
    default: return "open";
  }
}

/** Label de exibição; devolve o valor cru quando o código é desconhecido. */
function levelLabel(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "(sem nível)";
  const rank = levelRank(value);
  if (rank == null) return `${value} (desconhecido)`;
  const canonical = levelCodeForRank(rank);
  return canonical === normalizeLevelKey(value) ?
    LEVEL_LABELS[canonical] :
    `${LEVEL_LABELS[canonical]} [via '${value}']`;
}

function levelsBySportOf(data) {
  const onboarding = data && typeof data.sportOnboarding === "object" ? data.sportOnboarding : null;
  const bySport = onboarding && typeof onboarding.levelsBySport === "object" ? onboarding.levelsBySport : null;
  const out = {};
  if (bySport) {
    for (const [k, v] of Object.entries(bySport)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Escada de rating
 * ------------------------------------------------------------------ */

function athleteRatingRef(uid, sportCode) {
  return db.doc(
    `artifacts/${projectId}/public/data/athleteRatings/${uid}_${sportCode}`,
  );
}

function finiteNumber(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function nullableNumber(raw) {
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Mesmo parse de `parseLevels` em rating-config.ts (doc parcial → defaults). */
function parseLevels(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const levels = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") return null;
    const code = typeof entry.code === "string" ? entry.code.trim() : "";
    const rank = Number(entry.rank);
    const initialRating = Number(entry.initialRating);
    if (!code || !Number.isFinite(rank) || !Number.isFinite(initialRating)) return null;
    levels.push({
      code,
      rank,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : code,
      initialRating,
      promoteAt: nullableNumber(entry.promoteAt),
      demoteAt: nullableNumber(entry.demoteAt),
    });
  }
  return levels.sort((a, b) => a.rank - b.rank);
}

/** `ratingLadders/{sport}` → `ratingLadders/default` → defaults hardcoded. */
async function loadLadderConfig(sportCode) {
  for (const docId of [sportCode, "default"]) {
    const snap = await db.doc(`ratingLadders/${docId}`).get();
    if (!snap.exists) continue;
    const raw = snap.data() || {};
    const glicko = typeof raw.glicko === "object" && raw.glicko ? raw.glicko : {};
    const ladder = typeof raw.ladder === "object" && raw.ladder ? raw.ladder : {};
    return {
      levels: parseLevels(raw.levels) || DEFAULT_LEVELS,
      initialRd: finiteNumber(glicko.initialRd, DEFAULT_INITIAL_RD),
      promotionProtectionDays: finiteNumber(
        ladder.promotionProtectionDays,
        DEFAULT_PROMOTION_PROTECTION_DAYS,
      ),
      source: `ratingLadders/${docId}`,
    };
  }
  return {
    levels: DEFAULT_LEVELS,
    initialRd: DEFAULT_INITIAL_RD,
    promotionProtectionDays: DEFAULT_PROMOTION_PROTECTION_DAYS,
    source: "defaults hardcoded",
  };
}

/** Mesmo fallback de `resolveLadderLevel` (código → rank → piso). */
function resolveLadderLevel(levels, rawLevel) {
  const code = String(rawLevel ?? "").trim();
  if (code) {
    const exact = levels.find((l) => l.code === code);
    if (exact) return exact;
    const rank = levelRank(code);
    if (rank != null) {
      const byRank = levels.find((l) => l.rank === rank);
      if (byRank) return byRank;
      const below = [...levels].reverse().find((l) => l.rank <= rank);
      if (below) return below;
    }
  }
  return levels[0];
}

/** Zona informativa dentro das bandas do nível (computeZone em rating-ladder.ts). */
function computeZone(rating, level) {
  if (level.promoteAt != null && rating >= level.promoteAt) return "promotion";
  if (level.demoteAt != null && rating <= level.demoteAt) return "relegation";
  return "stable";
}

function fmtDate(raw) {
  if (raw && typeof raw.toDate === "function") return raw.toDate().toISOString();
  return "null";
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

(async () => {
  const user = uidArg ?
    await auth.getUser(uidArg) :
    await auth.getUserByEmail(String(emailArg).trim().toLowerCase());

  const userRef = db.doc(`users/${user.uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    fail(`users/${user.uid} não existe neste projeto — nada a alterar.`);
  }
  const data = userSnap.data() || {};
  const bySport = levelsBySportOf(data);
  const onboarding = typeof data.sportOnboarding === "object" && data.sportOnboarding ?
    data.sportOnboarding :
    {};

  console.log(`Projeto: ${projectId} | modo: ${APPLY ? "APLICAR" : "dry-run"}`);
  console.log(`Atleta: ${user.uid} <${user.email || "sem e-mail"}> ${data.fullName || data.name || ""}`);

  // Esporte alvo: --sport > primarySportId > único esporte com nível.
  const primary = String(onboarding.primarySportId || "").trim();
  const declaredSports = Object.keys(bySport);
  const sportCode =
    (sportArg && sportArg.trim().toUpperCase()) ||
    (ATHLETE_SPORT_CODES.includes(primary) ? primary : "") ||
    (declaredSports.length === 1 ? declaredSports[0] : "");
  if (!sportCode) {
    fail(
      "Não deu para inferir o esporte (sem primarySportId e com mais de um " +
      `esporte declarado). Passe --sport <CODE>. Declarados: ${declaredSports.join(", ") || "nenhum"}.`,
    );
  }

  console.log(`\nNíveis declarados (sportOnboarding.levelsBySport):`);
  if (declaredSports.length === 0) {
    console.log("  (nenhum)");
  }
  for (const code of declaredSports) {
    const marker = code === sportCode ? "  ← alvo" : "";
    console.log(`  ${code}: ${bySport[code]} — ${levelLabel(bySport[code])}${marker}`);
  }
  if (!declaredSports.includes(sportCode)) {
    console.log(`  ${sportCode}: (sem entrada)  ← alvo`);
  }
  console.log(`  primarySportId: ${primary || "(não definido)"}`);

  // Campos legados: só fallback de LEITURA quando o esporte não tem entrada.
  for (const field of ["level", "nivel"]) {
    if (typeof data[field] === "string" && data[field].trim()) {
      console.log(`  [legado] ${field}: ${data[field]} (não é escrito por este script)`);
    }
  }

  const config = await loadLadderConfig(sportCode);
  const ratingRef = athleteRatingRef(user.uid, sportCode);
  const ratingSnap = await ratingRef.get();
  const ratingData = ratingSnap.exists ? ratingSnap.data() || {} : null;

  console.log(`\nEscada de rating (${config.source}):`);
  if (!RATED_SPORT_CODES.includes(sportCode)) {
    console.log(`  ${sportCode} está FORA de RATED_SPORT_CODES — a engine não rateia este esporte.`);
  }
  if (!ratingData) {
    console.log(
      `  ${ratingRef.path}: (não existe)` +
      (RATED_SPORT_CODES.includes(sportCode) ?
        " — a engine semeia na 1ª partida rateada, já com o nível novo." :
        " — e não vai existir enquanto o esporte estiver fora da escada."),
    );
  } else {
    console.log(`  ${ratingRef.path}`);
    console.log(
      `    rating=${Math.round(finiteNumber(ratingData.rating, 0))} rd=${Math.round(finiteNumber(ratingData.rd, 0))} ` +
      `levelCode=${ratingData.levelCode ?? "(vazio)"} levelRank=${ratingData.levelRank ?? "?"}`,
    );
    console.log(
      `    zone=${ratingData.zone ?? "?"} ladderState=${ratingData.ladderState ?? "?"} ` +
      `partidas=${finiteNumber(ratingData.ratedMatches, 0)} protectedUntil=${fmtDate(ratingData.protectedUntil)}`,
    );
  }

  if (!levelArg) {
    console.log("\nNenhum nível informado (--level) — só inspeção, nada foi escrito.");
    console.log(`Níveis válidos: ${LEVEL_CODES.join(", ")}`);
    process.exit(0);
  }

  const targetRank = levelRank(levelArg);
  if (targetRank == null) {
    fail(
      `--level inválido '${levelArg}'. Use um código (${LEVEL_CODES.join(", ")}) ` +
      "ou o label (\"Iniciante 2\", \"Intermediário 1\", ...).",
    );
  }
  const targetCode = levelCodeForRank(targetRank);

  const currentRaw = bySport[sportCode] || "";
  const currentRank = levelRank(currentRaw);
  const direction =
    currentRank == null ? "seed" :
      targetRank > currentRank ? "up" :
        targetRank < currentRank ? "down" : "same";

  console.log(
    `\nMudança em ${sportCode}: ${currentRaw || "(sem nível)"} → ${targetCode} ` +
    `(${levelLabel(currentRaw)} → ${LEVEL_LABELS[targetCode]})`,
  );
  if (direction === "down") {
    console.log("  REBAIXAMENTO manual — nem o app nem as rules permitem isso; só o Admin SDK.");
  }

  const userNeedsWrite = currentRaw !== targetCode;

  // Realinhamento do doc de rating (só existindo doc; senão a engine semeia).
  // Doc já no nível alvo não é tocado: reescrever zeraria janela de observação
  // e proteção sem motivo.
  const targetLevel = resolveLadderLevel(config.levels, targetCode);
  const ratingAligned =
    ratingData != null && String(ratingData.levelCode || "").trim() === targetLevel.code;
  let ratingPayload = null;
  if (!KEEP_RATING && ratingData && !ratingAligned) {
    const currentRating = finiteNumber(ratingData.rating, targetLevel.initialRating);
    const nextRating =
      direction === "down" ? Math.min(currentRating, targetLevel.initialRating) :
        direction === "up" ? Math.max(currentRating, targetLevel.initialRating) :
          currentRating;
    const now = new Date();
    ratingPayload = {
      athleteId: user.uid,
      sportCode,
      rating: nextRating,
      // RD alto trava decisão da escada (maxRdForDecision) até reconsolidar.
      rd: config.initialRd,
      levelCode: targetLevel.code,
      levelRank: targetLevel.rank,
      zone: computeZone(nextRating, targetLevel),
      ladderState: "stable",
      observationStartedAt: null,
      observationMatches: 0,
      notifiedAt: null,
      // Proteção contra rebaixamento automático só faz sentido subindo
      // (mesma semântica do self-upgrade em rating-triggers.ts).
      protectedUntil: direction === "up" ?
        Timestamp.fromDate(new Date(now.getTime() + config.promotionProtectionDays * DAY_MS)) :
        null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    console.log(
      `  [rating] ${Math.round(currentRating)} → ${Math.round(nextRating)}, ` +
      `rd → ${config.initialRd}, levelCode → ${targetLevel.code}, zone → ${ratingPayload.zone}, ` +
      `observação/notificação limpas (partidas/vitórias/derrotas intactas)`,
    );
  } else if (KEEP_RATING && ratingData) {
    console.log(
      `  [rating] --keep-rating: doc mantido em levelCode=${ratingData.levelCode ?? "(vazio)"} — ` +
      "a escada pode desfazer esta mudança quando as flags de promoção/rebaixamento estiverem ligadas.",
    );
  } else if (ratingAligned) {
    console.log(`  [rating] doc já está em levelCode=${targetLevel.code} — nada a realinhar.`);
  }

  if (!userNeedsWrite && !ratingPayload) {
    console.log("\nNada a fazer: o atleta já está nesse nível e o rating está alinhado.");
    process.exit(0);
  }

  if (!APPLY) {
    if (ratingPayload) console.log(`\n  gravaria ${ratingRef.path}`);
    if (userNeedsWrite) {
      console.log(`  gravaria users/${user.uid}.sportOnboarding.levelsBySport.${sportCode} = ${targetCode}`);
      console.log(`  gravaria users/${user.uid}/levelHistory (reason: ${reason})`);
    }
    console.log("\nDry-run: nada foi gravado. Rode de novo com --yes para aplicar.");
    process.exit(0);
  }

  // Rating ANTES do doc do usuário: com o levelCode já atualizado, o trigger
  // onUserWrittenTrackLevelChanges cai no guard de igualdade e não re-seeda.
  if (ratingPayload) {
    await ratingRef.set(ratingPayload, {merge: true});
    console.log(`\n  [rating] ${ratingRef.path} ✔`);
  }

  if (userNeedsWrite) {
    await userRef.set(
      {
        sportOnboarding: {levelsBySport: {[sportCode]: targetCode}},
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    console.log(`  [perfil] users/${user.uid}.sportOnboarding.levelsBySport.${sportCode} = ${targetCode} ✔`);

    await db.collection(`users/${user.uid}/levelHistory`).add({
      sportCode,
      fromLevel: currentRaw || null,
      toLevel: targetCode,
      reason,
      rating: ratingData ? Math.round(finiteNumber(ratingPayload ? ratingPayload.rating : ratingData.rating, 0)) : null,
      rd: ratingData ? Math.round(finiteNumber(ratingPayload ? ratingPayload.rd : ratingData.rd, 0)) : null,
      ratedMatches: ratingData ? finiteNumber(ratingData.ratedMatches, 0) : null,
      actor: "script:set-athlete-level",
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log("  [auditoria] users/" + user.uid + "/levelHistory ✔");
  }

  console.log(
    "\nPronto. `public_profiles/" + user.uid + "` atualiza sozinho pelo trigger " +
    "onUserWrittenSyncPublicProfile (alguns segundos). O app/portal do atleta lê o " +
    "doc em tempo real — não precisa sair e entrar de novo.",
  );
  process.exit(0);
})().catch((e) => {
  if (e && e.code === "auth/user-not-found") {
    console.error("Usuário não encontrado no Auth deste projeto.");
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
