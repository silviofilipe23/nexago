// Gera os catálogos de esporte das três plataformas a partir de sports/catalog.json.
//   node sports/codegen.mjs          escreve os arquivos gerados
//   node sports/codegen.mjs --check  falha se algum estiver desatualizado
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADER = 'GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.';
const ART_DIRS = ['nexago_app/assets/images/sports', 'frontend/shared/tournament-covers/media'];
const SUPPORT = ['profile', 'competition'];

const FOLD = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c', ñ: 'n',
};

export function normalizeSportKey(raw) {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw.toLowerCase()) {
    const c = FOLD[ch] ?? ch;
    if (/^[a-z0-9]$/.test(c)) out += c;
  }
  return out;
}

export function titleCaseSportCode(raw) {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function fail(msg) {
  throw new Error(`sports/catalog.json: ${msg}`);
}

const BEST_OF = [1, 3, 5];
const posInt = (v) => Number.isInteger(v) && v > 0;

export function validateScoringProfile(where, p) {
  if (p === null) return;
  if (!p || typeof p !== 'object') fail(`scoringProfile inválido em ${where}`);
  if (!BEST_OF.includes(p.bestOf)) fail(`bestOf inválido em ${where}: ${p.bestOf}`);
  if (p.kind === 'sets_points') {
    for (const k of ['setTarget', 'decidingSetTarget', 'winBy']) {
      if (!posInt(p[k])) fail(`${k} inválido em ${where}`);
    }
    if (p.pointCap !== null && !posInt(p.pointCap)) fail(`pointCap inválido em ${where}`);
    return;
  }
  if (p.kind === 'sets_games') {
    for (const k of ['gamesPerSet', 'winByGames', 'tiebreakTo', 'superTiebreakTo']) {
      if (!posInt(p[k])) fail(`${k} inválido em ${where}`);
    }
    if (p.tiebreakAtGames !== null && !posInt(p.tiebreakAtGames)) fail(`tiebreakAtGames inválido em ${where}`);
    if (typeof p.noAd !== 'boolean') fail(`noAd inválido em ${where}`);
    if (!['full', 'super_tiebreak'].includes(p.decidingSet)) fail(`decidingSet inválido em ${where}`);
    return;
  }
  fail(`kind de placar desconhecido em ${where}: ${p.kind}`);
}

export function validate(catalog) {
  const index = new Map();
  for (const s of catalog.sports) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(s.code)) fail(`code inválido: ${s.code}`);
    if (!/^[A-Z][A-Z0-9_]*$/.test(s.profileCode)) fail(`profileCode inválido: ${s.profileCode}`);
    if (!/^[a-z][a-z0-9_]*$/.test(s.appId)) fail(`appId inválido: ${s.appId}`);
    if (typeof s.label !== 'string' || !s.label.trim()) fail(`label vazio em ${s.code}`);
    if (!SUPPORT.includes(s.support)) fail(`support inválido em ${s.code}: ${s.support}`);
    if (!('scoringProfile' in s)) fail(`scoringProfile ausente em ${s.code}`);
    validateScoringProfile(s.code, s.scoringProfile);
    if (s.support === 'competition' && !s.scoringProfile) fail(`esporte de competição sem scoringProfile: ${s.code}`);
    if (s.art !== null) {
      if (!/^[a-z0-9_]+$/.test(s.art)) fail(`art inválida em ${s.code}: ${s.art}`);
      for (const dir of ART_DIRS) {
        if (!fs.existsSync(path.join(ROOT, dir, `${s.art}.webp`))) {
          fail(`arte ${s.art}.webp ausente em ${dir}`);
        }
      }
    }
    for (const raw of [s.code, s.profileCode, s.appId, s.label, ...s.aliases]) {
      const key = normalizeSportKey(raw);
      if (!key) fail(`chave vazia em ${s.code}: "${raw}"`);
      const owner = index.get(key);
      if (owner && owner !== s.code) fail(`chave "${key}" de ${s.code} já pertence a ${owner}`);
      index.set(key, s.code);
    }
  }
  const resolve = (raw) => index.get(normalizeSportKey(raw)) ?? null;
  for (const [input, want] of catalog.normalizeVectors) {
    if (normalizeSportKey(input) !== want) fail(`vetor de normalização falhou: "${input}"`);
  }
  for (const [input, want] of catalog.resolveVectors) {
    if (resolve(input) !== want) fail(`vetor de resolução falhou: "${input}"`);
  }
  for (const [input, want] of catalog.titleCaseVectors) {
    if (titleCaseSportCode(input) !== want) fail(`vetor de title case falhou: "${input}"`);
  }
  return index;
}

const ts = (v) => JSON.stringify(v);
const dart = (v) =>
  v === null ? 'null' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$')}'`;

function renderTsCatalog(catalog, index) {
  const rows = catalog.sports.map(
    (s) =>
      `  {code: ${ts(s.code)}, profileCode: ${ts(s.profileCode)}, appId: ${ts(s.appId)}, ` +
      `label: ${ts(s.label)}, art: ${ts(s.art)}, support: ${ts(s.support)}, ` +
      `scoringProfile: ${ts(s.scoringProfile)}},`,
  );
  const keys = [...index.entries()].map(([k, code]) => `  ${ts(k)}: ${ts(code)},`);
  return [
    `// ${HEADER}`,
    '',
    'import type {ScoringProfile} from "./scoring-profile";',
    '',
    'export type SportSupport = "profile" | "competition";',
    '',
    'export interface SportCatalogEntry {',
    '  readonly code: string;',
    '  readonly profileCode: string;',
    '  readonly appId: string;',
    '  readonly label: string;',
    '  readonly art: string | null;',
    '  readonly support: SportSupport;',
    '  readonly scoringProfile: ScoringProfile | null;',
    '}',
    '',
    'export const SPORT_CATALOG: readonly SportCatalogEntry[] = [',
    ...rows,
    '];',
    '',
    '/** Chave normalizada (`normalizeSportKey`) → `code`. */',
    'export const SPORT_INDEX: Readonly<Record<string, string>> = {',
    ...keys,
    '};',
    '',
    `export const SPORT_UNKNOWN_LABEL = ${ts(catalog.unknownLabel)};`,
    '',
  ].join('\n');
}

function renderTsVectors(catalog, scoring) {
  const list = (name, type, vectors) => [
    `export const ${name}: ReadonlyArray<readonly [string, ${type}]> = [`,
    ...vectors.map(([a, b]) => `  [${ts(a)}, ${ts(b)}],`),
    '];',
    '',
  ];
  return [
    `// ${HEADER}`,
    '',
    ...list('SPORT_NORMALIZE_VECTORS', 'string', catalog.normalizeVectors),
    ...list('SPORT_RESOLVE_VECTORS', 'string | null', catalog.resolveVectors),
    ...list('SPORT_TITLE_CASE_VECTORS', 'string', catalog.titleCaseVectors),
    'export interface ScoringVectorCase {',
    '  readonly profile: string;',
    '  readonly sets: ReadonlyArray<{a: number; b: number; tb?: {a: number; b: number}}>;',
    '  readonly setWinners: ReadonlyArray<"A" | "B" | null>;',
    '  readonly matchWinner: "A" | "B" | null;',
    '  readonly issues: readonly string[];',
    '}',
    '',
    'export interface ScoringLabelVector {',
    '  readonly profile: string;',
    '  readonly rulesLabel: string;',
    '  readonly setLabels: readonly string[];',
    '}',
    '',
    'export interface ScoringTextVector {',
    '  readonly profile: string;',
    '  readonly index: number;',
    '  readonly set: {a: number; b: number; tb?: {a: number; b: number}};',
    '  readonly text: string;',
    '}',
    '',
    'export interface ScoringQuickVector {',
    '  readonly profile: string;',
    '  readonly index: number;',
    '  readonly set: {a: number; b: number; tb?: {a: number; b: number}};',
    '  readonly kind: "points" | "games" | "games_tiebreak" | "super_tiebreak";',
    '  readonly normalized: {a: number; b: number; tb?: {a: number; b: number}};',
    '}',
    '',
    'export interface ScoringLiveState {',
    '  readonly sets: ReadonlyArray<{a: number; b: number; tb?: {a: number; b: number}}>;',
    '  readonly currentSetIndex: number;',
    '  readonly currentGame: {a: number; b: number};',
    '  readonly servingTeamId: string;',
    '}',
    '',
    'export interface ScoringLiveVector {',
    '  readonly profile: string;',
    '  readonly start?: ScoringLiveState;',
    '  readonly points: string;',
    '  readonly expect: ScoringLiveState & {',
    '    readonly winnerSide: "A" | "B" | null;',
    '    readonly closed: "none" | "game" | "set" | "match" | null;',
    '  };',
    '  readonly labels?: {a: string; b: string};',
    '  readonly hint?: string;',
    '}',
    '',
    'export const SCORING_VECTORS: {readonly profiles: Readonly<Record<string, unknown>>; ' +
      'readonly cases: readonly ScoringVectorCase[]; ' +
      'readonly labelVectors: readonly ScoringLabelVector[]; ' +
      'readonly quickVectors: readonly ScoringQuickVector[]; ' +
      'readonly liveVectors: readonly ScoringLiveVector[]; ' +
      'readonly textVectors: readonly ScoringTextVector[]} = ' +
      `${JSON.stringify({profiles: scoring.profiles, cases: scoring.cases, labelVectors: scoring.labelVectors, quickVectors: scoring.quickVectors, liveVectors: scoring.liveVectors, textVectors: scoring.textVectors})};`,
    '',
  ].join('\n');
}

function dartProfile(p) {
  if (p === null) return 'null';
  if (p.kind === 'sets_points') {
    return `SetsPointsProfile(bestOf: ${p.bestOf}, setTarget: ${p.setTarget}, ` +
      `decidingSetTarget: ${p.decidingSetTarget}, winBy: ${p.winBy}, pointCap: ${p.pointCap})`;
  }
  return `SetsGamesProfile(bestOf: ${p.bestOf}, gamesPerSet: ${p.gamesPerSet}, ` +
    `winByGames: ${p.winByGames}, tiebreakAtGames: ${p.tiebreakAtGames}, ` +
    `tiebreakTo: ${p.tiebreakTo}, noAd: ${p.noAd}, ` +
    `decidingSet: DecidingSet.${p.decidingSet === 'super_tiebreak' ? 'superTiebreak' : 'full'}, ` +
    `superTiebreakTo: ${p.superTiebreakTo})`;
}

function renderDartCatalog(catalog, index) {
  const rows = catalog.sports.flatMap((s) => [
    '  SportCatalogEntry(',
    `    code: ${dart(s.code)},`,
    `    profileCode: ${dart(s.profileCode)},`,
    `    appId: ${dart(s.appId)},`,
    `    label: ${dart(s.label)},`,
    `    art: ${dart(s.art)},`,
    `    support: SportSupport.${s.support},`,
    `    scoringProfile: ${dartProfile(s.scoringProfile)},`,
    '  ),',
  ]);
  const keys = [...index.entries()].map(([k, code]) => `  ${dart(k)}: ${dart(code)},`);
  return [
    `// ${HEADER}`,
    '',
    "import 'scoring_profile.dart';",
    '',
    'enum SportSupport { profile, competition }',
    '',
    'class SportCatalogEntry {',
    '  const SportCatalogEntry({',
    '    required this.code,',
    '    required this.profileCode,',
    '    required this.appId,',
    '    required this.label,',
    '    required this.art,',
    '    required this.support,',
    '    required this.scoringProfile,',
    '  });',
    '',
    '  final String code;',
    '  final String profileCode;',
    '  final String appId;',
    '  final String label;',
    '  final String? art;',
    '  final SportSupport support;',
    '  final ScoringProfile? scoringProfile;',
    '}',
    '',
    'const List<SportCatalogEntry> kSportCatalog = [',
    ...rows,
    '];',
    '',
    '/// Chave normalizada (`SportCatalog.normalizeKey`) → `code`.',
    'const Map<String, String> kSportIndex = {',
    ...keys,
    '};',
    '',
    `const String kSportUnknownLabel = ${dart(catalog.unknownLabel)};`,
    '',
  ].join('\n');
}

function renderDartVectors(catalog, scoring) {
  const scoringJson = JSON.stringify({profiles: scoring.profiles, cases: scoring.cases, labelVectors: scoring.labelVectors, quickVectors: scoring.quickVectors, liveVectors: scoring.liveVectors, textVectors: scoring.textVectors});
  if (scoringJson.includes("'''")) fail("scoring-vectors.json não pode conter '''");
  const list = (name, type, vectors) => [
    `const List<(String, ${type})> ${name} = [`,
    ...vectors.map(([a, b]) => `  (${dart(a)}, ${dart(b)}),`),
    '];',
    '',
  ];
  return [
    `// ${HEADER}`,
    '',
    ...list('kSportNormalizeVectors', 'String', catalog.normalizeVectors),
    ...list('kSportResolveVectors', 'String?', catalog.resolveVectors),
    ...list('kSportTitleCaseVectors', 'String', catalog.titleCaseVectors),
    `const String kScoringVectorsJson = r'''${scoringJson}''';`,
    '',
  ].join('\n');
}

export function outputs() {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  const index = validate(catalog);
  const scoring = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/scoring-vectors.json'), 'utf8'));
  for (const [name, p] of Object.entries(scoring.profiles)) validateScoringProfile(`vetor ${name}`, p);
  for (const c of [...scoring.cases, ...scoring.labelVectors, ...scoring.quickVectors, ...scoring.liveVectors, ...scoring.textVectors]) {
    if (!(c.profile in scoring.profiles)) fail(`vetor com perfil desconhecido: ${c.profile}`);
  }
  const tsCatalog = renderTsCatalog(catalog, index);
  const tsVectors = renderTsVectors(catalog, scoring);
  return {
    'functions/src/sports/catalog.generated.ts': tsCatalog,
    'functions/src/sports/vectors.generated.ts': tsVectors,
    'frontend/shared/sports/catalog.generated.ts': tsCatalog,
    'frontend/shared/sports/vectors.generated.ts': tsVectors,
    'nexago_app/lib/core/sports/sport_catalog_data.dart': renderDartCatalog(catalog, index),
    'nexago_app/test/core/sports/sport_vectors_data.dart': renderDartVectors(catalog, scoring),
  };
}

function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [rel, content] of Object.entries(outputs())) {
    const file = path.join(ROOT, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === content) continue;
    if (check) {
      stale.push(rel);
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      console.log(`escrito ${rel}`);
    }
  }
  if (stale.length > 0) {
    console.error(`desatualizados (rode node sports/codegen.mjs):\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
