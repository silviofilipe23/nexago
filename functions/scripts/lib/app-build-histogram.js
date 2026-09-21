/* eslint-disable */
/**
 * Contagem da base instalada por build, a partir dos docs de `users/{uid}/tokens`.
 *
 * Puro de propósito: o I/O vive em `scripts/count-app-builds.js`, e a
 * aritmética — que é o que decide se vale apertar o `minBuildNumber` — fica
 * testável sem Firestore (`test/app-build-histogram.test.mjs`).
 *
 * Três baldes por plataforma, e a diferença entre eles importa:
 *   - belowGate:     build conhecido e ABAIXO do gate. Não tem o código do
 *                    gate, logo é inalcançável por bloqueio.
 *   - atOrAboveGate: build conhecido, no gate ou acima. Bloqueável.
 *   - unknown:       sem build legível. Instalação que não abre o app desde
 *                    que a gravação da versão subiu — SUSPEITA de ser antiga,
 *                    não prova. Por isso não soma em belowGate.
 */

const DEFAULT_GATE = 101;

function parseBuild(raw) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  return null;
}

function platformLabel(raw) {
  if (typeof raw !== "string") return "unknown";
  const trimmed = raw.trim().toLowerCase();
  return trimmed === "" ? "unknown" : trimmed;
}

function emptyBucket() {
  return {
    total: 0,
    unknown: 0,
    belowGate: 0,
    atOrAboveGate: 0,
    _builds: new Map(),
  };
}

function summarizeTokenBuilds(docs, options = {}) {
  const gate = Number.isInteger(options.gate) ? options.gate : DEFAULT_GATE;
  const platforms = {};
  let total = 0;

  for (const doc of docs || []) {
    total += 1;
    const key = platformLabel(doc && doc.platform);
    if (!platforms[key]) platforms[key] = emptyBucket();
    const bucket = platforms[key];
    bucket.total += 1;

    const build = parseBuild(doc && doc.buildNumber);
    if (build === null) {
      bucket.unknown += 1;
      continue;
    }
    if (build < gate) bucket.belowGate += 1;
    else bucket.atOrAboveGate += 1;
    bucket._builds.set(build, (bucket._builds.get(build) || 0) + 1);
  }

  for (const bucket of Object.values(platforms)) {
    bucket.builds = [...bucket._builds.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([build, count]) => ({build, count}));
    delete bucket._builds;
  }

  return {total, gate, platforms};
}

module.exports = {summarizeTokenBuilds, DEFAULT_GATE};
