# Multiesporte, fase 1: catálogo canônico de esportes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um arquivo, `sports/catalog.json`, passa a ser a única fonte de código, código de perfil, rótulo e arte de cada esporte; Cloud Functions, portais web e app leem dele através de arquivos gerados, e nenhuma tela mostra "Vôlei de praia" para algo que não é.

**Architecture:** Um script Node (`sports/codegen.mjs`) valida o JSON e gera dados estáticos para três alvos (TypeScript das functions, TypeScript dos portais em `@nexago/sports`, Dart em `core/sports/`). Cada alvo tem um módulo escrito à mão com as mesmas quatro funções (normalizar, resolver, rótulo, title case); os vetores de teste moram no JSON e são emitidos nos três alvos, então a paridade é provada por teste. Os mapas espalhados passam a delegar para o catálogo mantendo a assinatura pública, o que deixa o diff pequeno nos consumidores.

**Tech Stack:** Node 22 (ESM), Cloud Functions TypeScript (`node --test`), Angular 20 (Karma/Jasmine, aliases `@nexago/*`), Flutter/Dart 3.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md`, seção "Eixo 1" e "Fase 1", **com a emenda de 04/10/2026** (beach tennis abre na fase 2; desconhecido mostra o código em title case; padel, pickleball, ícones e chips de arena ficam fora).

**Base:** branch `claude/multiesporte-fase-1-catalogo`, empilhada sobre a fase 0 (`claude/multi-sport-architecture-f9e84a`, PR #569). O PR desta fase aponta para a branch da fase 0.

## Global Constraints

- Retrocompatibilidade: nenhum valor persistido muda; tudo é resolvido na leitura.
- Nada grava `sport` diferente do que já grava hoje. Esta fase só muda leitura e exibição.
- Rótulo: código conhecido → `label` do catálogo; código desconhecido não vazio → title case do próprio código; vazio/ausente → `null` (cada consumidor mantém o fallback que já tinha para vazio).
- Normalização igual nas três linguagens: minúsculas, tabela fixa de acentos (`á à â ã ä é è ê ë í ì î ï ó ò ô õ ö ú ù û ü ç ñ`), remove tudo que não é `[a-z0-9]`.
- `TournamentSport` (Dart e TS) continua com os 3 valores de hoje; um teste prova que é igual aos esportes `competition` do catálogo.
- **Nunca rodar `dart format` em arquivo Dart existente**, nem em pasta. Arquivo Dart novo escrito à mão pode ser formatado com o dart do Flutter (`/Users/silviodionizio/development/flutter/bin/cache/dart-sdk/bin/dart format <arquivo>`), nunca com o `dart` do PATH (Homebrew 3.5.4). Arquivo gerado não é formatado: o codegen já emite no estilo final.
- Worktree: `node_modules` vêm por symlink do checkout principal (`functions/node_modules`, `frontend/node_modules`); apagar o de `functions/` antes do PR. Karma sempre com `cd <worktree>/frontend` e `--browsers=ChromeHeadless`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Doc com `sport: "beach_tennis"` (grafia com sublinhado): deve resolver para `BEACH_TENNIS` no nível por esporte e mostrar "Beach tennis". Teste no Task 2 (backend) e Task 3 (web).
2. Código desconhecido (`padel`, `curling`, `FUTEVOLEI_MISTO`): rótulo em title case, nunca "Vôlei de praia" e nunca vazio. Vetores no Task 1, consumidos nos Tasks 2, 3 e 6.
3. Arquivo gerado editado à mão ou JSON alterado sem rodar o codegen: o teste de `--check` tem de falhar. Teste no Task 1.
4. Código de perfil no catálogo que não está na lista de `sportLevelNotLowered` das rules (ou vice-versa): teste tem de falhar. Teste no Task 1.
5. Arte declarada no catálogo sem o `.webp` no app ou no portal: o codegen tem de recusar. Validação no Task 1.

---

## Comandos de teste

| Camada | Comando |
|---|---|
| Codegen + rules × catálogo | `cd functions && node --test test/sports-catalog.test.mjs` |
| Functions | `cd functions && npm run build && node --test lib/sports/catalog.test.js` / tudo: `npm test` |
| Portal (por projeto) | `cd frontend && npx ng test <organizer\|athlete\|arena\|backoffice\|site> --watch=false --browsers=ChromeHeadless [--include='**/<arquivo>.spec.ts']` |
| App | `cd nexago_app && flutter test test/core/sports/` / tudo: `flutter test` |

---

### Task 1: Catálogo, codegen e guardas

**Files:**
- Create: `sports/catalog.json`, `sports/codegen.mjs`
- Create (gerados): `functions/src/sports/catalog.generated.ts`, `functions/src/sports/vectors.generated.ts`, `frontend/shared/sports/catalog.generated.ts`, `frontend/shared/sports/vectors.generated.ts`, `nexago_app/lib/core/sports/sport_catalog_data.dart`, `nexago_app/test/core/sports/sport_vectors_data.dart`
- Create: `functions/test/sports-catalog.test.mjs`
- Copy: `nexago_app/assets/images/sports/{futebol,basquete,tenis,corrida}.webp` → `frontend/shared/tournament-covers/media/`
- Modify: `functions/package.json` (script `test`: acrescentar `test/sports-catalog.test.mjs`)

**Interfaces:**
- Produces (TS, nos dois alvos): `SportSupport`, `SportCatalogEntry {code, profileCode, appId, label, art, support}`, `SPORT_CATALOG`, `SPORT_INDEX: Record<chaveNormalizada, code>`, `SPORT_UNKNOWN_LABEL`; vetores `SPORT_NORMALIZE_VECTORS`, `SPORT_RESOLVE_VECTORS`, `SPORT_TITLE_CASE_VECTORS`.
- Produces (Dart): `SportSupport`, `SportCatalogEntry`, `kSportCatalog`, `kSportIndex`, `kSportUnknownLabel`; vetores `kSportNormalizeVectors`, `kSportResolveVectors`, `kSportTitleCaseVectors` (listas de records).

- [ ] **Step 1: Escrever o teste que falha**

```js
// functions/test/sports-catalog.test.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('arquivos gerados do catálogo de esportes estão em dia', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'sports/codegen.mjs'), '--check'], {
    stdio: 'pipe',
  });
});

// As rules não iteram mapas: `athleteLevelsNotDowngraded` lista um
// `sportLevelNotLowered(...)` por código de perfil. Esporte novo no catálogo
// sem a linha nas rules deixaria o nível dele sem a guarda "só sobe".
test('rules guardam o nível de todo código de perfil do catálogo', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const inRules = [
    ...rules.matchAll(/sportLevelNotLowered\(reqLevels, curLevels, '([A-Z_]+)'/g),
  ].map((m) => m[1]).sort();
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  assert.deepEqual(inRules, catalog.sports.map((s) => s.profileCode).sort());
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && node --test test/sports-catalog.test.mjs`
Expected: FAIL nos dois (codegen e `catalog.json` não existem).

- [ ] **Step 3: Escrever o catálogo**

```json
{
  "$comment": "Fonte única dos esportes. Edite aqui e rode `node sports/codegen.mjs`. Spec: docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md",
  "unknownLabel": "Esporte não informado",
  "sports": [
    {"code": "beachVolleyball", "profileCode": "VOLEI_PRAIA", "appId": "beach_volleyball", "label": "Vôlei de praia", "art": "volei_praia", "support": "competition", "aliases": []},
    {"code": "indoorVolleyball", "profileCode": "VOLEI_QUADRA", "appId": "indoor_volleyball", "label": "Vôlei de quadra", "art": "volei_quadra", "support": "competition", "aliases": ["Vôlei indoor"]},
    {"code": "footvolley", "profileCode": "FUTEVOLEI", "appId": "footvolley", "label": "Futevôlei", "art": "futevolei", "support": "competition", "aliases": []},
    {"code": "football", "profileCode": "FUTEBOL", "appId": "football", "label": "Futebol", "art": "futebol", "support": "profile", "aliases": []},
    {"code": "basketball", "profileCode": "BASQUETE", "appId": "basketball", "label": "Basquete", "art": "basquete", "support": "profile", "aliases": []},
    {"code": "tennis", "profileCode": "TENIS", "appId": "tennis", "label": "Tênis", "art": "tenis", "support": "profile", "aliases": []},
    {"code": "beachTennis", "profileCode": "BEACH_TENNIS", "appId": "beach_tennis", "label": "Beach tennis", "art": "beach_tennis", "support": "profile", "aliases": ["Beach tênis"]},
    {"code": "running", "profileCode": "CORRIDA", "appId": "running", "label": "Corrida", "art": "corrida", "support": "profile", "aliases": []},
    {"code": "other", "profileCode": "OUTROS", "appId": "other", "label": "Outros", "art": null, "support": "profile", "aliases": []}
  ],
  "normalizeVectors": [
    ["Vôlei de praia", "voleidepraia"],
    ["beach_tennis", "beachtennis"],
    ["  BEACH-TENNIS ", "beachtennis"],
    ["Futevôlei", "futevolei"],
    ["AÇÃO ñ", "acaon"],
    ["", ""]
  ],
  "resolveVectors": [
    ["beachVolleyball", "beachVolleyball"],
    ["VOLEI_PRAIA", "beachVolleyball"],
    ["beach_volleyball", "beachVolleyball"],
    ["Vôlei de praia", "beachVolleyball"],
    ["beach_tennis", "beachTennis"],
    ["Beach tênis", "beachTennis"],
    ["Vôlei indoor", "indoorVolleyball"],
    ["futevolei", "footvolley"],
    ["TENIS", "tennis"],
    ["padel", null],
    ["", null]
  ],
  "titleCaseVectors": [
    ["padel", "Padel"],
    ["curling", "Curling"],
    ["FUTEVOLEI_MISTO", "Futevolei Misto"],
    ["beachTennisPro", "Beach Tennis Pro"],
    ["  ", ""]
  ]
}
```

A ordem de `sports` é a ordem de exibição do onboarding do app e do `SPORT_CATALOG` do portal do atleta (o spec `sport-catalog.spec.ts` trava essa ordem).

- [ ] **Step 4: Escrever o codegen**

```js
// sports/codegen.mjs
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

export function validate(catalog) {
  const index = new Map();
  for (const s of catalog.sports) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(s.code)) fail(`code inválido: ${s.code}`);
    if (!/^[A-Z][A-Z0-9_]*$/.test(s.profileCode)) fail(`profileCode inválido: ${s.profileCode}`);
    if (!/^[a-z][a-z0-9_]*$/.test(s.appId)) fail(`appId inválido: ${s.appId}`);
    if (typeof s.label !== 'string' || !s.label.trim()) fail(`label vazio em ${s.code}`);
    if (!SUPPORT.includes(s.support)) fail(`support inválido em ${s.code}: ${s.support}`);
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
      `label: ${ts(s.label)}, art: ${ts(s.art)}, support: ${ts(s.support)}},`,
  );
  const keys = [...index.entries()].map(([k, code]) => `  ${ts(k)}: ${ts(code)},`);
  return [
    `// ${HEADER}`,
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

function renderTsVectors(catalog) {
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
  ].join('\n');
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
    '  ),',
  ]);
  const keys = [...index.entries()].map(([k, code]) => `  ${dart(k)}: ${dart(code)},`);
  return [
    `// ${HEADER}`,
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
    '  });',
    '',
    '  final String code;',
    '  final String profileCode;',
    '  final String appId;',
    '  final String label;',
    '  final String? art;',
    '  final SportSupport support;',
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

function renderDartVectors(catalog) {
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
  ].join('\n');
}

export function outputs() {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  const index = validate(catalog);
  const tsCatalog = renderTsCatalog(catalog, index);
  const tsVectors = renderTsVectors(catalog);
  return {
    'functions/src/sports/catalog.generated.ts': tsCatalog,
    'functions/src/sports/vectors.generated.ts': tsVectors,
    'frontend/shared/sports/catalog.generated.ts': tsCatalog,
    'frontend/shared/sports/vectors.generated.ts': tsVectors,
    'nexago_app/lib/core/sports/sport_catalog_data.dart': renderDartCatalog(catalog, index),
    'nexago_app/test/core/sports/sport_vectors_data.dart': renderDartVectors(catalog),
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
```

- [ ] **Step 5: Copiar as artes e gerar**

```bash
for a in futebol basquete tenis corrida; do cp nexago_app/assets/images/sports/$a.webp frontend/shared/tournament-covers/media/; done
node sports/codegen.mjs
```
Expected: seis linhas `escrito ...`.

- [ ] **Step 6: Rodar e ver passar; provar que o check pega edição à mão**

Run: `cd functions && node --test test/sports-catalog.test.mjs`
Expected: PASS 2/2.

Depois: acrescentar um espaço em `frontend/shared/sports/catalog.generated.ts`, rodar de novo (Expected: FAIL no primeiro teste listando o arquivo), e `git checkout -- frontend/shared/sports/catalog.generated.ts` não serve (arquivo novo): rodar `node sports/codegen.mjs` para restaurar e confirmar PASS.

- [ ] **Step 7: Registrar o teste no `npm test` e commitar**

Em `functions/package.json`, no script `test`, acrescentar ` test/sports-catalog.test.mjs` ao fim da lista de `test/*.mjs`.

```bash
git add sports functions/test/sports-catalog.test.mjs functions/package.json functions/src/sports frontend/shared/sports frontend/shared/tournament-covers/media nexago_app/lib/core/sports nexago_app/test/core/sports
git commit -m "feat(sports): catálogo canônico de esportes com codegen para as três plataformas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Backend lê do catálogo

**Files:**
- Create: `functions/src/sports/catalog.ts`, `functions/src/sports/catalog.test.ts`
- Modify: `functions/src/category-level-eligibility.ts` (`tournamentSportToLevelSportCode`), `functions/src/rating-ladder.ts` (`sportLabel`)

**Interfaces:**
- Consumes: gerados do Task 1.
- Produces: `normalizeSportKey(raw: unknown): string`, `resolveSport(raw: unknown): SportCatalogEntry | null`, `sportProfileCode(raw: unknown): string | null`, `titleCaseSportCode(raw: string): string`, `sportLabel(raw: unknown): string | null`, `sportsWithSupport(s: SportSupport): SportCatalogEntry[]`; reexporta `SPORT_CATALOG`, `SPORT_UNKNOWN_LABEL` e os tipos.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// functions/src/sports/catalog.test.ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  SPORT_CATALOG,
  normalizeSportKey,
  resolveSport,
  sportLabel,
  sportProfileCode,
  titleCaseSportCode,
} from "./catalog";
import {
  SPORT_NORMALIZE_VECTORS,
  SPORT_RESOLVE_VECTORS,
  SPORT_TITLE_CASE_VECTORS,
} from "./vectors.generated";
import {ATHLETE_SPORT_CODES, tournamentSportToLevelSportCode} from "../category-level-eligibility";
import {sportLabel as ladderSportLabel} from "../rating-ladder";

describe("sports/catalog · vetores compartilhados com app e portais", () => {
  it("normaliza", () => {
    for (const [input, want] of SPORT_NORMALIZE_VECTORS) assert.equal(normalizeSportKey(input), want, input);
  });
  it("resolve", () => {
    for (const [input, want] of SPORT_RESOLVE_VECTORS) assert.equal(resolveSport(input)?.code ?? null, want, input);
  });
  it("title case", () => {
    for (const [input, want] of SPORT_TITLE_CASE_VECTORS) assert.equal(titleCaseSportCode(input), want, input);
  });
});

describe("sports/catalog · rótulo e pontes", () => {
  it("rótulo: conhecido → catálogo; desconhecido → title case; vazio → null", () => {
    assert.equal(sportLabel("beach_tennis"), "Beach tennis");
    assert.equal(sportLabel("padel"), "Padel");
    assert.equal(sportLabel("  "), null);
    assert.equal(sportLabel(undefined), null);
  });

  it("código de perfil de qualquer grafia conhecida", () => {
    assert.equal(sportProfileCode("beachVolleyball"), "VOLEI_PRAIA");
    assert.equal(sportProfileCode("padel"), null);
  });

  it("ATHLETE_SPORT_CODES é o conjunto de códigos de perfil do catálogo", () => {
    assert.deepEqual([...ATHLETE_SPORT_CODES].sort(), SPORT_CATALOG.map((e) => e.profileCode).sort());
  });

  it("nível por esporte aceita a grafia legada do torneio", () => {
    assert.equal(tournamentSportToLevelSportCode("beach_tennis"), "BEACH_TENNIS");
    assert.equal(tournamentSportToLevelSportCode("Vôlei de praia"), "VOLEI_PRAIA");
  });

  it("rótulo da notificação de nível vem do catálogo, em minúsculas", () => {
    assert.equal(ladderSportLabel("FUTEVOLEI"), "futevôlei");
    assert.equal(ladderSportLabel("XADREZ"), "XADREZ");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build`
Expected: FAIL de compilação, `./catalog` não existe.

- [ ] **Step 3: Implementar**

```ts
// functions/src/sports/catalog.ts
/**
 * Catálogo de esportes (spec multiesporte 2026-10-03, eixo 1). Os dados vêm de
 * `catalog.generated.ts` (gerado de `sports/catalog.json`); a lógica aqui é a
 * MESMA de `frontend/shared/sports/index.ts` e `core/sports/sport_catalog.dart`
 * — os vetores em `vectors.generated.ts` provam a paridade.
 */
import {
  SPORT_CATALOG,
  SPORT_INDEX,
  type SportCatalogEntry,
  type SportSupport,
} from "./catalog.generated";

export {SPORT_CATALOG, SPORT_UNKNOWN_LABEL} from "./catalog.generated";
export type {SportCatalogEntry, SportSupport} from "./catalog.generated";

const FOLD: Readonly<Record<string, string>> = {
  "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i", "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n",
};

const INDEX = new Map(Object.entries(SPORT_INDEX));
const BY_CODE = new Map(SPORT_CATALOG.map((e) => [e.code, e]));

export function normalizeSportKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw.toLowerCase()) {
    const c = FOLD[ch] ?? ch;
    if (/^[a-z0-9]$/.test(c)) out += c;
  }
  return out;
}

export function resolveSport(raw: unknown): SportCatalogEntry | null {
  const code = INDEX.get(normalizeSportKey(raw));
  return code ? BY_CODE.get(code) ?? null : null;
}

export function sportProfileCode(raw: unknown): string | null {
  return resolveSport(raw)?.profileCode ?? null;
}

export function titleCaseSportCode(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Conhecido → rótulo do catálogo; desconhecido → o código em title case; vazio → null. */
export function sportLabel(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return resolveSport(raw)?.label ?? titleCaseSportCode(raw);
}

export function sportsWithSupport(support: SportSupport): SportCatalogEntry[] {
  return SPORT_CATALOG.filter((e) => e.support === support);
}
```

Em `functions/src/category-level-eligibility.ts`, importar `sportProfileCode` de `./sports/catalog` e trocar o corpo de `tournamentSportToLevelSportCode` (linhas 195-209) por:

```ts
export function tournamentSportToLevelSportCode(sport: unknown): string | null {
  return sportProfileCode(sport);
}
```

Atualizar o doc-comment para: "Esporte do torneio, em qualquer grafia que o catálogo conheça (`sports/catalog.json`) → código de esporte do perfil. `null` quando não há equivalente (esporte desconhecido cai no nível global)."

Em `functions/src/rating-ladder.ts`, apagar `SPORT_LABELS` e trocar `sportLabel`:

```ts
import {resolveSport} from "./sports/catalog";

export function sportLabel(sportCode: string): string {
  return resolveSport(sportCode)?.label.toLowerCase() ?? sportCode;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/sports/catalog.test.js lib/category-level-eligibility.test.js lib/rating-ladder.test.js lib/draw-sessions-sport.test.js lib/head-to-head.test.js`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/sports functions/src/category-level-eligibility.ts functions/src/rating-ladder.ts
git commit -m "feat(functions): pontes de esporte e rótulos leem do catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pacote `@nexago/sports` e pacotes compartilhados dos portais

**Files:**
- Create: `frontend/shared/sports/index.ts`
- Modify: `frontend/tsconfig.json` (alias), `frontend/shared/levels/index.ts`, `frontend/shared/tournament-covers/index.ts`, `frontend/shared/leagues/league.model.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/sports-catalog.spec.ts`

**Interfaces:**
- Produces (`@nexago/sports`): as mesmas funções do Task 2 com os mesmos nomes e tipos; reexporta `catalog.generated`.
- Mantém as assinaturas públicas: `ATHLETE_SPORT_CODES`, `athleteSportLabel`, `tournamentSportToLevelSportCode`, `tournamentCoverArt`, `tournamentCoverOrDefault`, `SPORTS_WITH_COVER_ART`, `leagueSportLabel`.

- [ ] **Step 1: Escrever o spec que falha**

```ts
// frontend/projects/organizer/src/app/painel/data/sports-catalog.spec.ts
import {
  SPORT_CATALOG,
  normalizeSportKey,
  resolveSport,
  sportLabel,
  titleCaseSportCode,
} from '@nexago/sports';
import {
  SPORT_NORMALIZE_VECTORS,
  SPORT_RESOLVE_VECTORS,
  SPORT_TITLE_CASE_VECTORS,
} from '../../../../../../shared/sports/vectors.generated';
import { ATHLETE_SPORT_CODES, athleteSportLabel, tournamentSportToLevelSportCode } from '@nexago/levels';
import { SPORTS_WITH_COVER_ART, tournamentCoverArt } from '@nexago/tournament-covers';
import { leagueSportLabel } from '@nexago/leagues';

describe('@nexago/sports · vetores compartilhados com functions e app', () => {
  it('normaliza', () => {
    for (const [input, want] of SPORT_NORMALIZE_VECTORS) expect(normalizeSportKey(input)).withContext(input).toBe(want);
  });
  it('resolve', () => {
    for (const [input, want] of SPORT_RESOLVE_VECTORS) expect(resolveSport(input)?.code ?? null).withContext(input).toBe(want);
  });
  it('title case', () => {
    for (const [input, want] of SPORT_TITLE_CASE_VECTORS) expect(titleCaseSportCode(input)).withContext(input).toBe(want);
  });
  it('rótulo: conhecido, desconhecido e vazio', () => {
    expect(sportLabel('beach_tennis')).toBe('Beach tennis');
    expect(sportLabel('padel')).toBe('Padel');
    expect(sportLabel('')).toBeNull();
  });
});

describe('pacotes compartilhados leem do catálogo', () => {
  it('@nexago/levels', () => {
    expect([...ATHLETE_SPORT_CODES]).toEqual(SPORT_CATALOG.map((s) => s.profileCode));
    expect(tournamentSportToLevelSportCode('beach_tennis')).toBe('BEACH_TENNIS');
    expect(athleteSportLabel('FUTEVOLEI')).toBe('Futevôlei');
    expect(athleteSportLabel('XADREZ')).toBe('Xadrez');
  });

  it('@nexago/tournament-covers', () => {
    expect(tournamentCoverArt('beach_tennis')).toBe('/media/tournament-covers/beach_tennis.webp');
    expect(tournamentCoverArt('tennis')).toBe('/media/tournament-covers/tenis.webp');
    expect(tournamentCoverArt('other')).toBeNull();
    expect(SPORTS_WITH_COVER_ART).toContain('beachVolleyball');
  });

  it('@nexago/leagues', () => {
    expect(leagueSportLabel('beachTennis')).toBe('Beach tennis');
    expect(leagueSportLabel(null)).toBe('Esporte');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/sports-catalog.spec.ts'`
Expected: FAIL de compilação, `@nexago/sports` não resolve.

- [ ] **Step 3: Implementar**

`frontend/tsconfig.json`, em `paths`, após `@nexago/search-keywords`:

```json
      "@nexago/sports": ["shared/sports/index.ts"],
```

`frontend/shared/sports/index.ts`: mesmo conteúdo de `functions/src/sports/catalog.ts` (Task 2, Step 3), com aspas simples, o comentário de topo apontando para os outros dois módulos e, no lugar dos dois `export ... from "./catalog.generated"`, um único:

```ts
export * from './catalog.generated';
```

`frontend/shared/levels/index.ts`: importar `{ SPORT_CATALOG, sportLabel, sportProfileCode } from '@nexago/sports'`; apagar `SPORT_LABELS`; e:

```ts
/** Códigos de esporte do perfil (chaves de `sportOnboarding.levelsBySport`), na ordem do catálogo. */
export const ATHLETE_SPORT_CODES: readonly string[] = SPORT_CATALOG.map((s) => s.profileCode);

/** Código de esporte do perfil → rótulo; desconhecido sai em title case (nunca vazio se veio algo). */
export function athleteSportLabel(code: string | null | undefined): string {
  return sportLabel(code) ?? '';
}

/** Esporte do torneio, em qualquer grafia do catálogo → código do perfil. `null` → nível global. */
export function tournamentSportToLevelSportCode(sport: string | null | undefined): string | null {
  return sportProfileCode(sport);
}
```

`frontend/shared/tournament-covers/index.ts`: apagar `BY_SPORT`, importar `{ SPORT_CATALOG, resolveSport } from '@nexago/sports'` e:

```ts
const COVER_DIR = '/media/tournament-covers';

/** Caminho da arte do esporte (qualquer grafia do catálogo), ou `null` quando ele não tem uma. */
export function tournamentCoverArt(sport: string | null | undefined): string | null {
  const art = resolveSport(sport)?.art;
  return art ? `${COVER_DIR}/${art}.webp` : null;
}

/** Esportes que hoje têm arte — usado em teste para travar o catálogo. */
export const SPORTS_WITH_COVER_ART: readonly string[] = SPORT_CATALOG.filter((s) => s.art).map((s) => s.code);
```

Reescrever o doc-comment de topo para dizer que a arte vem de `sports/catalog.json` (`art`) e que o codegen recusa arte sem arquivo em `media/`.

`frontend/shared/leagues/league.model.ts`: apagar `SPORT_LABELS`, importar `sportLabel` de `@nexago/sports` e:

```ts
export function leagueSportLabel(raw: unknown): string {
  return sportLabel(raw) ?? 'Esporte';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: suíte inteira do organizador SUCCESS.

Run: `cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless --include='**/tournament-cover-art.spec.ts'`
Expected: SUCCESS (o spec de capa do site segue valendo).

- [ ] **Step 5: Commit**

```bash
git add frontend/tsconfig.json frontend/shared frontend/projects/organizer/src/app/painel/data/sports-catalog.spec.ts
git commit -m "feat(web): pacote @nexago/sports; níveis, capas e ligas leem do catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Portal do organizador

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts` (`SPORT_LABEL`)
- Modify: `frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts` (apagar `SPORT_LABELS`, `sportLabelOf` exportado)
- Modify: `frontend/projects/organizer/src/app/painel/data/organizer-settings.model.ts:183` e `frontend/projects/organizer/src/app/painel/config/regras-card.component.ts:29` (cópias da lista de esportes → `KNOWN_TOURNAMENT_SPORTS`)
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts` (rótulo do esporte travado)
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-create.sports-catalog.spec.ts`

**Interfaces:**
- Consumes: `SPORT_CATALOG`, `sportLabel` de `@nexago/sports`.
- Produces: `export function sportLabelOf(raw: unknown): string` em `tournaments-repository.ts`.

- [ ] **Step 1: Escrever o spec que falha**

```ts
// tournament-create.sports-catalog.spec.ts
import { SPORT_CATALOG } from '@nexago/sports';
import { KNOWN_TOURNAMENT_SPORTS, SPORT_LABEL } from './tournament-create.model';
import { sportLabelOf } from './tournaments-repository';

describe('wizard de torneio × catálogo de esportes', () => {
  it('os esportes do wizard são exatamente os de suporte competition do catálogo', () => {
    expect([...KNOWN_TOURNAMENT_SPORTS]).toEqual(
      SPORT_CATALOG.filter((s) => s.support === 'competition').map((s) => s.code),
    );
  });

  it('rótulos do wizard vêm do catálogo', () => {
    for (const s of KNOWN_TOURNAMENT_SPORTS) {
      expect(SPORT_LABEL[s]).toBe(SPORT_CATALOG.find((e) => e.code === s)!.label);
    }
  });

  it('listagem de eventos: conhecido, legado, desconhecido e vazio', () => {
    expect(sportLabelOf('beachTennis')).toBe('Beach tennis');
    expect(sportLabelOf('beach_tennis')).toBe('Beach tennis');
    expect(sportLabelOf('padel')).toBe('Padel');
    expect(sportLabelOf(null)).toBe('Esporte');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-create.sports-catalog.spec.ts'`
Expected: FAIL de compilação (`sportLabelOf` não exportado).

- [ ] **Step 3: Implementar**

`tournament-create.model.ts`: importar `sportLabel` de `@nexago/sports` e trocar o literal de `SPORT_LABEL` por:

```ts
export const SPORT_LABEL = Object.fromEntries(
  KNOWN_TOURNAMENT_SPORTS.map((s) => [s, sportLabel(s) ?? s]),
) as Record<TournamentSport, string>;
```

`tournaments-repository.ts`: apagar `SPORT_LABELS` e o comentário dele; importar `sportLabel` de `@nexago/sports`; e:

```ts
export function sportLabelOf(raw: unknown): string {
  return sportLabel(raw) ?? 'Esporte';
}
```

`organizer-settings.model.ts:183` e `regras-card.component.ts:29`: trocar `const SPORTS: readonly TournamentSport[] = [...]` por `const SPORTS = KNOWN_TOURNAMENT_SPORTS;`, importando de `../data/tournament-create.model` (no `regras-card`) ou `./tournament-create.model` (no settings). Remover o import de `TournamentSport` se ficar sem uso.

`criar-torneio.component.ts`: importar `sportLabel` de `@nexago/sports`; no template do esporte travado trocar `{{ sportRaw }}` por `{{ lockedSportLabel(sportRaw) }}`; e:

```ts
  protected lockedSportLabel(raw: string): string {
    return sportLabel(raw) ?? raw;
  }

  protected reviewSport(): string {
    const raw = this.draft().sportRaw;
    return raw ? this.lockedSportLabel(raw) : SPORT_LABEL[this.draft().sport];
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx tsc -p projects/organizer/tsconfig.spec.json --noEmit && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: `tsc` sem saída; suíte SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer
git commit -m "feat(organizer-web): rótulos e lista de esportes do wizard vêm do catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Portais da arena, backoffice, atleta e site

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/tournaments/tournaments-repository.ts` e `leagues-repository.ts` (apagar `SPORT_LABELS`; exportar a função de rótulo que já existe nas linhas ~20-37)
- Modify: `frontend/projects/backoffice/src/app/painel/torneios/data/tournaments.repository.ts` (apagar `SPORT_LABEL`; exportar `sportLabel`)
- Modify: `frontend/projects/athlete/src/app/organizadores/organizer-profile.vm.ts` (`tournamentSportLabel`), `frontend/projects/athlete/src/app/data/sport-catalog.ts` (`SPORT_CATALOG`, `sportLabelForCode`)
- Modify: `frontend/projects/site/src/lib/format.ts` (`sportLabel`), `frontend/projects/site/src/app/pages/s/arena-site.page.ts` (`SPORT_LABEL`)
- Test: um spec por projeto (abaixo)

**Interfaces:**
- Consumes: `sportLabel`, `SPORT_CATALOG`, `SPORT_UNKNOWN_LABEL` de `@nexago/sports`.

- [ ] **Step 1: Escrever os specs que falham**

Arena, `frontend/projects/arena/src/app/painel/tournaments/sport-label.spec.ts` (usar o nome real da função de rótulo de cada repositório, lido no arquivo antes de escrever; abaixo `tournamentSportLabel` e `leagueSportLabelOf` como marcadores do nome real):

```ts
import { tournamentSportLabel } from './tournaments-repository';
import { leagueSportLabelOf } from './leagues-repository';

describe('arena · rótulo de esporte vem do catálogo', () => {
  it('torneio e liga', () => {
    expect(tournamentSportLabel('beachTennis')).toBe('Beach tennis');
    expect(leagueSportLabelOf('beach_tennis')).toBe('Beach tennis');
    expect(tournamentSportLabel('padel')).toBe('Padel');
  });
});
```

Backoffice, `frontend/projects/backoffice/src/app/painel/torneios/data/sport-label.spec.ts`:

```ts
import { sportLabel } from './tournaments.repository';

describe('backoffice · rótulo de esporte vem do catálogo', () => {
  it('conhecido, legado, desconhecido e vazio', () => {
    expect(sportLabel('indoorVolleyball')).toBe('Vôlei de quadra');
    expect(sportLabel('beach_tennis')).toBe('Beach tennis');
    expect(sportLabel('padel')).toBe('Padel');
    expect(sportLabel(null)).toBeNull();
  });
});
```

Atleta: acrescentar em `organizer-profile.vm.spec.ts` (dentro do `it` existente de `tournamentSportLabel` ou num `it` novo):

```ts
    expect(tournamentSportLabel('beach_tennis')).toBe('Beach tennis');
```

e em `sport-catalog.spec.ts`:

```ts
    it('resolves any spelling the catalog knows', () => {
      expect(sportLabelForCode('beachVolleyball')).toBe('Vôlei de praia');
    });
```

Site, `frontend/projects/site/src/lib/format.sport.spec.ts`:

```ts
import { sportLabel } from './format';

describe('site · rótulo de esporte vem do catálogo', () => {
  it('não chama futevôlei de "esporte de areia"', () => {
    expect(sportLabel('footvolley')).toBe('Futevôlei');
    expect(sportLabel('beachVolleyball')).toBe('Vôlei de praia');
    expect(sportLabel('padel')).toBe('Padel');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run, cada um: `cd frontend && npx ng test <projeto> --watch=false --browsers=ChromeHeadless --include='<spec>'`
Expected: arena e backoffice FAIL de compilação (função não exportada); atleta FAIL (`'beach_tennis'` sai "Beach Tennis", `'beachVolleyball'` sai "Beachvolleyball"); site FAIL ("Esporte de areia").

- [ ] **Step 3: Implementar**

Arena (os dois repositórios): apagar `SPORT_LABELS`, importar `sportLabel` de `@nexago/sports`, exportar a função de rótulo e trocar `return SPORT_LABELS[v] ?? v;` por `return sportLabel(v) ?? v;`.

Backoffice: apagar `SPORT_LABEL`, importar `sportLabel as catalogSportLabel` de `@nexago/sports` e:

```ts
export function sportLabel(raw: string | null): string | null {
  return catalogSportLabel(raw);
}
```

Atleta, `organizer-profile.vm.ts`: apagar `TOURNAMENT_SPORT_LABELS` e o comentário dele; importar `sportLabel` de `@nexago/sports`; e:

```ts
export function tournamentSportLabel(code: string | null | undefined): string | null {
  return sportLabel(code);
}
```

Remover o import de `sportLabelForCode` se ficar sem uso.

Atleta, `sport-catalog.ts`: manter a interface e o tipo de ícone; trocar a lista literal e `sportLabelForCode` por (o comentário sobre `titleCaseCode` e o ciclo de import sai junto com a função):

```ts
import { SPORT_CATALOG as CATALOG, sportLabel } from '@nexago/sports';

const ICON_BY_CODE: Readonly<Record<string, SportCatalogEntry['icon']>> = {
  TENIS: 'racket',
  BEACH_TENNIS: 'racket',
  CORRIDA: 'running',
  OUTROS: 'plus',
};

/** Ordem e rótulos do catálogo canônico (`sports/catalog.json`); ícone é escolha desta tela. */
export const SPORT_CATALOG: readonly SportCatalogEntry[] = CATALOG.map((s) => ({
  code: s.profileCode,
  label: s.label,
  icon: ICON_BY_CODE[s.profileCode] ?? 'ball',
}));

/** Qualquer grafia conhecida → rótulo; desconhecido → title case; vazio → ''. */
export function sportLabelForCode(code: string): string {
  return sportLabel(code) ?? '';
}
```

Site, `format.ts`: importar `sportLabel as catalogSportLabel, SPORT_UNKNOWN_LABEL` de `@nexago/sports` e:

```ts
export function sportLabel(sport: Sport): string {
  return catalogSportLabel(sport) ?? SPORT_UNKNOWN_LABEL;
}
```

Site, `arena-site.page.ts`: apagar `SPORT_LABEL`; trocar `protected readonly sportLabel = SPORT_LABEL;` por `protected readonly sportLabel = sportLabel;` importando `sportLabel` de `../../../lib/format`; no template, trocar cada `sportLabel[x]` por `sportLabel(x)` (procurar `sportLabel[` no arquivo).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && for p in arena backoffice athlete site; do npx ng test $p --watch=false --browsers=ChromeHeadless 2>&1 | grep -E 'Executed [0-9]+ of [0-9]+ .*(SUCCESS|FAILED)' | tail -1; done`
Expected: as quatro linhas com SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena frontend/projects/backoffice frontend/projects/athlete frontend/projects/site
git commit -m "feat(web): arena, backoffice, atleta e site leem rótulos de esporte do catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: App, núcleo do catálogo, pontes e rótulos

**Files:**
- Create: `nexago_app/lib/core/sports/sport_catalog.dart`, `nexago_app/test/core/sports/sport_catalog_test.dart`
- Modify: `nexago_app/lib/features/tournaments/domain/category_level_eligibility.dart` (`tournamentSportToLevelSportCode`)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_firestore_codes.dart` (os três mapas de esporte)
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_logic.dart` (`sportLabel`)
- Modify: `nexago_app/lib/features/organizer_public_profile/domain/organizer_public_profile_logic.dart` (`organizerSportLabel`)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_profile_options.dart` (`sports`), `nexago_app/lib/features/athlete/domain/athlete_profile.dart` (`_sportLabelToFirestoreId`, `_labelToAppSportId`)
- Modify: `nexago_app/lib/features/athlete/onboarding/domain/athlete_onboarding_options.dart` (`label` vira getter)
- Modify: `nexago_app/test/features/organizer_public_profile/organizer_public_profile_logic_test.dart` (expectativas de rótulo)

**Interfaces:**
- Consumes: `kSportCatalog`, `kSportIndex`, `kSportUnknownLabel` (Task 1).
- Produces: `SportCatalog.normalizeKey(String?)`, `.resolve(String?) → SportCatalogEntry?`, `.byAppId(String?)`, `.byProfileCode(String?)`, `.profileCodeOf(String?)`, `.labelOf(String?) → String?`, `.titleCase(String)`, `.artOf(String?)`, `.withSupport(SportSupport)`. O Task 7 consome `artOf`, `labelOf`, `kSportUnknownLabel`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// nexago_app/test/core/sports/sport_catalog_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_options.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_logic.dart';
import 'package:nexago_app/features/tournaments/domain/category_level_eligibility.dart';

import 'sport_vectors_data.dart';

void main() {
  group('vetores compartilhados com functions e portais', () {
    test('normaliza', () {
      for (final (input, want) in kSportNormalizeVectors) {
        expect(SportCatalog.normalizeKey(input), want, reason: input);
      }
    });
    test('resolve', () {
      for (final (input, want) in kSportResolveVectors) {
        expect(SportCatalog.resolve(input)?.code, want, reason: input);
      }
    });
    test('title case', () {
      for (final (input, want) in kSportTitleCaseVectors) {
        expect(SportCatalog.titleCase(input), want, reason: input);
      }
    });
  });

  test('rótulo: conhecido, desconhecido e vazio', () {
    expect(SportCatalog.labelOf('beach_tennis'), 'Beach tennis');
    expect(SportCatalog.labelOf('padel'), 'Padel');
    expect(SportCatalog.labelOf('  '), isNull);
    expect(SportCatalog.labelOf(null), isNull);
  });

  test('enum do wizard é exatamente o conjunto competition do catálogo', () {
    expect(
      TournamentSport.values.map((s) => s.name).toList(),
      SportCatalog.withSupport(SportSupport.competition).map((e) => e.code).toList(),
    );
  });

  test('pontes e listas do app leem do catálogo', () {
    expect(
      CategoryLevelEligibility.tournamentSportToLevelSportCode('beach_tennis'),
      'BEACH_TENNIS',
    );
    expect(AthleteFirestoreCodes.sportAppToFirestore('footvolley'), 'FUTEVOLEI');
    expect(AthleteFirestoreCodes.sportFirestoreToApp('futevolei'), 'footvolley');
    expect(AthleteFirestoreCodes.sportFirestoreToLabel('BEACH_TENNIS'), 'Beach tennis');
    expect(AthleteProfileOptions.sports, [for (final e in kSportCatalog) e.label]);
    expect(
      AthleteOnboardingOptions.sports.map((o) => o.id).toList(),
      [for (final e in kSportCatalog) e.appId],
    );
    expect(
      AthleteOnboardingOptions.sports.map((o) => o.label).toList(),
      [for (final e in kSportCatalog) e.label],
    );
    expect(sportLabel(TournamentSport.footvolley), 'Futevôlei');
    expect(organizerSportLabel('beach_tennis'), 'Beach tennis');
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/core/sports/sport_catalog_test.dart`
Expected: FAIL de compilação, `core/sports/sport_catalog.dart` não existe.

- [ ] **Step 3: Implementar o núcleo**

```dart
// nexago_app/lib/core/sports/sport_catalog.dart
import 'sport_catalog_data.dart';

export 'sport_catalog_data.dart';

/// Catálogo de esportes (spec multiesporte 2026-10-03, eixo 1). Os dados vêm de
/// `sport_catalog_data.dart` (gerado de `sports/catalog.json`); a lógica é a
/// MESMA de `functions/src/sports/catalog.ts` e `frontend/shared/sports` — os
/// vetores em `test/core/sports/sport_vectors_data.dart` provam a paridade.
abstract final class SportCatalog {
  SportCatalog._();

  static const Map<String, String> _fold = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n',
  };

  static final RegExp _keyChar = RegExp(r'^[a-z0-9]$');

  static final Map<String, SportCatalogEntry> _byCode = {
    for (final e in kSportCatalog) e.code: e,
  };

  static String normalizeKey(String? raw) {
    if (raw == null) return '';
    final out = StringBuffer();
    for (final rune in raw.toLowerCase().runes) {
      final ch = String.fromCharCode(rune);
      final c = _fold[ch] ?? ch;
      if (_keyChar.hasMatch(c)) out.write(c);
    }
    return out.toString();
  }

  /// Qualquer grafia conhecida (código, código de perfil, id do app, rótulo,
  /// alias) → entrada do catálogo. `null` para desconhecido ou vazio.
  static SportCatalogEntry? resolve(String? raw) {
    final code = kSportIndex[normalizeKey(raw)];
    return code == null ? null : _byCode[code];
  }

  static SportCatalogEntry? byAppId(String? appId) {
    for (final e in kSportCatalog) {
      if (e.appId == appId) return e;
    }
    return null;
  }

  static SportCatalogEntry? byProfileCode(String? code) {
    final key = code?.trim().toUpperCase();
    for (final e in kSportCatalog) {
      if (e.profileCode == key) return e;
    }
    return null;
  }

  static String? profileCodeOf(String? raw) => resolve(raw)?.profileCode;

  static String? artOf(String? raw) => resolve(raw)?.art;

  static String titleCase(String raw) {
    return raw
        .trim()
        .replaceAllMapped(
          RegExp(r'([a-z0-9])([A-Z])'),
          (m) => '${m[1]} ${m[2]}',
        )
        .split(RegExp(r'[\s_-]+'))
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
        .join(' ');
  }

  /// Conhecido → rótulo do catálogo; desconhecido → o código em title case;
  /// vazio → `null`.
  static String? labelOf(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    return resolve(raw)?.label ?? titleCase(raw);
  }

  static Iterable<SportCatalogEntry> withSupport(SportSupport support) =>
      kSportCatalog.where((e) => e.support == support);
}
```

Formatar só este arquivo novo com o dart do Flutter: `/Users/silviodionizio/development/flutter/bin/cache/dart-sdk/bin/dart format lib/core/sports/sport_catalog.dart test/core/sports/sport_catalog_test.dart`.

- [ ] **Step 4: Ligar os consumidores (edição mínima, no estilo de cada arquivo, sem `dart format`)**

`category_level_eligibility.dart`: importar `../../../core/sports/sport_catalog.dart` e trocar o `switch` de `tournamentSportToLevelSportCode` por `return SportCatalog.profileCodeOf(sport);`, atualizando o doc-comment ("qualquer grafia do catálogo").

`athlete_firestore_codes.dart`: importar o catálogo; apagar `_sportAppToFirestore`, `_sportFirestoreToApp` e `_sportFirestoreToLabel`; e:

```dart
  static String? sportAppToFirestore(String? appId) {
    if (appId == null || appId.isEmpty) return null;
    return SportCatalog.byAppId(appId)?.profileCode;
  }

  static String? sportFirestoreToLabel(String? code) {
    if (code == null || code.isEmpty) return null;
    return SportCatalog.byProfileCode(code)?.label;
  }

  static String? sportFirestoreToApp(String? code) {
    if (code == null || code.isEmpty) return null;
    return SportCatalog.byProfileCode(code)?.appId;
  }
```

`tournament_create_logic.dart`: importar o catálogo e trocar o `switch` de `sportLabel` por:

```dart
String sportLabel(TournamentSport sport) =>
    SportCatalog.labelOf(sport.name) ?? sport.name;
```

`organizer_public_profile_logic.dart`: apagar `_sportLabels`; importar o catálogo; e:

```dart
/// Rótulo do código de `tournaments.sport`, em qualquer grafia do catálogo.
/// Código desconhecido sai em title case; vazio sai vazio.
String organizerSportLabel(String code) => SportCatalog.labelOf(code) ?? '';
```

`athlete_profile_options.dart`: importar o catálogo e trocar a lista literal `sports` por:

```dart
  /// Rótulos dos esportes, na ordem do catálogo (`sports/catalog.json`).
  static final List<String> sports = List.unmodifiable([
    for (final e in kSportCatalog) e.label,
  ]);
```

`athlete_profile.dart`: apagar `_labelToAppSportId` (e o comentário dele) e trocar o corpo de `_sportLabelToFirestoreId` por `return SportCatalog.resolve(label)?.profileCode;`, importando o catálogo.

`athlete_onboarding_options.dart`: importar o catálogo; em `OnboardingSportOption`, remover `required this.label` do construtor e o campo `label`, e acrescentar:

```dart
  /// Rótulo do catálogo (`sports/catalog.json`); o ícone é escolha desta tela.
  String get label => SportCatalog.byAppId(id)?.label ?? id;
```

Remover os nove argumentos `label: '...'` da lista `sports`.

`organizer_public_profile_logic_test.dart`: as expectativas de `organizerSportLabel` mudam por decisão do spec (emenda de 04/10): `'beachTennis'` → `'Beach tennis'`, `'curling'` → `'Curling'`; e o texto composto da linha ~548 passa de `'... · Beach Tennis'` para `'... · Beach tennis'`.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd nexago_app && flutter analyze lib/core/sports lib/features/athlete lib/features/organizer lib/features/organizer_public_profile lib/features/tournaments test/core/sports 2>&1 | grep -E "error •|warning •"; flutter test test/core/sports test/features/athlete test/features/organizer test/features/organizer_public_profile test/features/tournaments`
Expected: nenhum erro/warning novo; todos os testes passando. Se algum uso de `AthleteProfileOptions.sports` ou de `OnboardingSportOption(label: ...)` estiver em contexto `const`, o analyze aponta: trocar o `const` daquele ponto por `final`.

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): núcleo do catálogo de esportes; pontes, rótulos e onboarding leem dele

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: App, artes e telas que exibem esporte

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_cover_art.dart`, `nexago_app/lib/features/athlete/domain/sport_art_catalog.dart`
- Modify: `nexago_app/lib/features/organizer/presentation/tournament_create/steps/tournament_create_identity_page.dart`, `nexago_app/lib/features/organizer/presentation/league_create/steps/league_create_identity_page.dart`, `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_logic.dart` (`reviewSportSummary`), `nexago_app/lib/features/organizer/presentation/league_create/steps/league_create_review_page.dart`
- Modify: `nexago_app/lib/features/athlete/presentation/widgets/athlete_profile_main_view.dart:114-116`
- Test: `nexago_app/test/core/sports/sport_catalog_art_test.dart` (novo), `nexago_app/test/features/organizer/tournament_create_identity_page_sport_raw_test.dart` (expectativa)

**Interfaces:**
- Consumes: `SportCatalog.artOf`, `.labelOf`, `kSportUnknownLabel`, `kSportCatalog` (Task 6).
- Mantém: `TournamentCoverArt.assetFor/sportsWithArt`, `SportArtCatalog.assetFor/codesWithArt`.

- [ ] **Step 1: Escrever os testes que falham**

```dart
// nexago_app/test/core/sports/sport_catalog_art_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/sport_art_catalog.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_cover_art.dart';

void main() {
  test('capa de torneio aceita qualquer grafia do catálogo', () {
    expect(
      TournamentCoverArt.assetFor('beach_tennis'),
      'assets/images/sports/beach_tennis.webp',
    );
    expect(TournamentCoverArt.assetFor('other'), isNull);
    expect(TournamentCoverArt.assetFor('padel'), isNull);
  });

  test('arte do perfil aceita o id do app', () {
    expect(SportArtCatalog.assetFor('tennis'), 'assets/images/sports/tenis.webp');
    expect(SportArtCatalog.assetFor('OUTROS'), isNull);
  });

  test('revisão do wizard mostra o rótulo do esporte travado', () {
    expect(
      reviewSportSummary(const TournamentCreateDraft(sportRaw: 'beachTennis')),
      'Beach tennis',
    );
  });
}
```

Em `tournament_create_identity_page_sport_raw_test.dart`, trocar `expect(find.text('beachTennis'), findsOneWidget);` por `expect(find.text('Beach tennis'), findsOneWidget);`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/core/sports/sport_catalog_art_test.dart test/features/organizer/tournament_create_identity_page_sport_raw_test.dart`
Expected: FAIL: `'beach_tennis'` e `'tennis'` dão `null`; revisão e campo travado mostram `beachTennis`.

- [ ] **Step 3: Implementar (edição mínima, sem `dart format`)**

`tournament_cover_art.dart`: importar o catálogo; apagar `_bySport`; reescrever o doc-comment (a arte vem do campo `art` de `sports/catalog.json`, em qualquer grafia); e:

```dart
  static String? assetFor(String? sport) {
    final art = SportCatalog.artOf(sport);
    return art == null ? null : 'assets/images/sports/$art.webp';
  }

  static Iterable<String> get sportsWithArt =>
      kSportCatalog.where((e) => e.art != null).map((e) => e.code);
```

`sport_art_catalog.dart`: mesmo padrão; `codesWithArt` devolve `e.profileCode` das entradas com arte.

`tournament_create_identity_page.dart` e `league_create_identity_page.dart`: no `TextFormField` travado, `initialValue: SportCatalog.labelOf(sportRaw) ?? sportRaw,` (importar o catálogo).

`tournament_create_logic.dart`:

```dart
String reviewSportSummary(TournamentCreateDraft draft) =>
    SportCatalog.labelOf(draft.sportRaw) ?? sportLabel(draft.sport);
```

`league_create_review_page.dart`: `(SportCatalog.labelOf(draft.sportRaw) ?? sportLabel(draft.sport)).toUpperCase()`.

`athlete_profile_main_view.dart:114-116`: o fallback `'Vôlei de praia'` vira `kSportUnknownLabel` (importar o catálogo).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && flutter analyze lib/features 2>&1 | grep -E "error •|warning •" | grep -E "sport|cover_art|identity_page|review_page|profile_main_view"; flutter test test/core/sports test/features/athlete test/features/organizer test/features/tournaments`
Expected: nada no grep; testes passando.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): artes e telas de esporte leem do catálogo; perfil sem esporte não vira vôlei

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificação final e PR empilhado

- [ ] **Step 1: Varredura de mapas que sobraram**

```bash
grep -rn "'Vôlei de praia'" nexago_app/lib frontend/projects/*/src frontend/shared --include=*.dart --include=*.ts | grep -v "arena\|court_type\|discover\|arena_search\|agenda\|\.spec\.ts"
grep -rn "beachvolleyball': \|beachVolleyball: 'Vôlei" nexago_app/lib frontend/projects/*/src frontend/shared functions/src --include=*.dart --include=*.ts | grep -v generated
```
Expected: nenhuma saída fora das áreas de arena/descoberta/agenda (fase 5) e dos arquivos gerados.

- [ ] **Step 2: Suítes completas**

```bash
cd functions && npm test && npm run test:rules
cd nexago_app && flutter analyze && flutter test
cd frontend && for p in organizer athlete arena backoffice site; do npx ng test $p --watch=false --browsers=ChromeHeadless 2>&1 | grep -E 'Executed [0-9]+ of [0-9]+ .*(SUCCESS|FAILED)' | tail -1; done
node sports/codegen.mjs --check
```
Expected: tudo verde; `flutter analyze` sem erro nem warning novo.

- [ ] **Step 3: Apagar o symlink de `functions/node_modules`, push e PR contra a branch da fase 0**

```bash
rm -f functions/node_modules
git push -u origin claude/multiesporte-fase-1-catalogo
gh pr create --base claude/multi-sport-architecture-f9e84a --title "Multiesporte fase 1: catálogo canônico de esportes" --body "<resumo, emenda do spec, testes, nota de merge: #569 primeiro>"
```
