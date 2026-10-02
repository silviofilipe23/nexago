# Perfil público do organizador — Fase 1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materializar `organizerPublicProfiles/{uid}` (identidade, selo, números, seguidores) por Cloud Functions, com regras, índices, push aos seguidores na abertura de inscrição e script de backfill.

**Architecture:** Funções puras em `organizer-public-profile.ts` (projeção de identidade, números, decisões) testadas sem Firestore; orquestração em `organizer-public-profile-sync.ts` e `organizer-follower-push.ts`, testada com o `FakeFirestore`. Os gatilhos herdam a região de `global-options.ts`.

**Tech Stack:** TypeScript, firebase-functions v2, firebase-admin, `node:test`, `@firebase/rules-unit-testing` (emulador).

**Spec:** `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md`

## Global Constraints

- Worktree (TODOS os comandos e caminhos): `WT=/Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/organizador-perfil-publico-f74a1f`. O worktree é ANINHADO dentro do checkout principal: um caminho sem `.claude/worktrees/organizador-perfil-publico-f74a1f` é o checkout principal e NÃO pode ser editado.
- Prefixe todo comando shell com `cd $WT && ` (ou `cd $WT/functions && `). Antes de cada commit: `pwd && git branch --show-current` deve imprimir o worktree e `claude/organizador-perfil-publico-f74a1f`.
- Nunca `git add -A` / `git add .`: `functions/node_modules` é um symlink. Adicione arquivos por nome.
- Código em inglês, strings de UI/notificação em português.
- Coleções: `organizerPublicProfiles`, subcoleção `followers`, `organizerFollowerPushes`.
- Bio ≤ 280. Top 3 locais. Lotes de push de 20.
- Tipo da notificação: `organizer_event_registration_open`. `url` e `webUrl` = `/torneios/{tournamentId}`.
- Testes de unidade: `cd $WT/functions && npm run build && node --test lib/<arquivo>.test.js`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Escrita em `users/{uid}` que não muda a identidade (ex.: `lastActiveAt`) → o gatilho sai sem ler nem gravar (teste em Task 2).
- Gravação de placar/`categoryOps` num torneio → nenhum recálculo (teste em Task 1, `organizerStatsRelevantChange`).
- Torneio reaberto (`open` → `closed` → `open`) → só um push (teste em Task 3).
- Organizador adia `registrationOpensAt` depois de agendado → a trava volta para `scheduled` com o novo horário, não envia antes (teste em Task 3).
- Organizador seguindo a si mesmo / atleta gravando seguidor em nome de outro → negado pela rule (teste em Task 4).

---

### Task 1: Funções puras do perfil público

**Files:**
- Create: `functions/src/organizer-public-profile.ts`
- Test: `functions/src/organizer-public-profile.test.ts`

**Interfaces:**
- Consumes: `normalizePhoneForWhatsApp(phone: string): string` de `./tournament-cancellation-request`.
- Produces (usados pelas Tasks 2, 3 e 5):
  - consts `ORGANIZER_PUBLIC_PROFILES_COLLECTION = "organizerPublicProfiles"`, `ORGANIZER_FOLLOWERS_SUBCOLLECTION = "followers"`, `ORGANIZER_FOLLOWER_PUSHES_COLLECTION = "organizerFollowerPushes"`, `ORGANIZER_BIO_MAX = 280`, `ORGANIZER_VENUES_MAX = 3`
  - `type DocData = Record<string, unknown>`; `interface TournamentRow { id: string; data: DocData }`
  - `interface OrganizerIdentity { name; logoUrl; coverUrl; bio; city; state; whatsapp; isOrganizer }`
  - `interface OrganizerVenue { name: string; arenaId: string | null; city: string | null; count: number }`
  - `interface OrganizerStats { listedEvents; eventsCompleted; openEvents; athletes; organizerSince: Timestamp | null; sports: string[]; venues: OrganizerVenue[] }`
  - `userHasOrganizerRole(user)`, `buildOrganizerIdentity(user): OrganizerIdentity`, `sameOrganizerIdentity(a, b): boolean`
  - `tournamentListingStatus(t)`, `isListedTournament(t)`, `isOpenListedTournament(t)`, `isCompletedListedTournament(t)`
  - `completedListedTournamentIds(rows: ReadonlyArray<TournamentRow>): string[]` (ordenado)
  - `normalizeVenueKey(name: string): string`
  - `computeOrganizerStats(rows: ReadonlyArray<TournamentRow>, athletes: number): OrganizerStats`
  - `isOrganizerListed(isOrganizer: boolean, stats: unknown): boolean`
  - `organizerStatsRelevantChange(before: DocData | null, after: DocData | null): boolean`
  - `touchesCompletedTournament(before: DocData | null, after: DocData | null): boolean`
  - `followerCountDelta(beforeExists: boolean, afterExists: boolean): -1 | 0 | 1`

- [ ] **Step 1: Write the failing test**

`functions/src/organizer-public-profile.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  buildOrganizerIdentity,
  completedListedTournamentIds,
  computeOrganizerStats,
  followerCountDelta,
  isListedTournament,
  isOrganizerListed,
  normalizeVenueKey,
  organizerStatsRelevantChange,
  sameOrganizerIdentity,
  touchesCompletedTournament,
  type TournamentRow,
} from "./organizer-public-profile";

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

function row(id: string, data: Record<string, unknown>): TournamentRow {
  return {id, data: {managerId: "org-1", listingStatus: "open", visibility: "publicListing", ...data}};
}

describe("buildOrganizerIdentity", () => {
  it("usa a marca e só expõe o WhatsApp com opt-in", () => {
    const identity = buildOrganizerIdentity({
      roles: ["athlete", "organizer"],
      displayName: "Fulano",
      organizerProfile: {
        orgName: "  Liga Amadora Goiânia ",
        logoUrl: "https://x/logo.jpg",
        coverUrl: "https://x/capa.jpg",
        bio: "Ligas de areia",
        city: "Goiânia",
        state: "go",
        contactPhone: "(62) 99999-1234",
        contactEmail: "nao@expor.com",
        publicWhatsapp: true,
      },
    });
    assert.deepEqual(identity, {
      name: "Liga Amadora Goiânia",
      logoUrl: "https://x/logo.jpg",
      coverUrl: "https://x/capa.jpg",
      bio: "Ligas de areia",
      city: "Goiânia",
      state: "GO",
      whatsapp: "5562999991234",
      isOrganizer: true,
    });
  });

  it("sem opt-in não há WhatsApp; nome cai para displayName e depois fullName", () => {
    const a = buildOrganizerIdentity({roles: ["organizer"], displayName: "Resp", organizerProfile: {contactPhone: "62999991234"}});
    assert.equal(a.whatsapp, null);
    assert.equal(a.name, "Resp");
    const b = buildOrganizerIdentity({roles: ["organizer"], fullName: "Nome Completo"});
    assert.equal(b.name, "Nome Completo");
    const c = buildOrganizerIdentity({roles: ["athlete"]});
    assert.equal(c.name, "Organizador");
    assert.equal(c.isOrganizer, false);
  });

  it("corta a bio em 280 e ignora telefone curto", () => {
    const identity = buildOrganizerIdentity({
      roles: ["organizer"],
      organizerProfile: {bio: "x".repeat(400), contactPhone: "1234", publicWhatsapp: true},
    });
    assert.equal(identity.bio?.length, 280);
    assert.equal(identity.whatsapp, null);
  });

  it("sameOrganizerIdentity compara campo a campo", () => {
    const base = {roles: ["organizer"], organizerProfile: {orgName: "A"}, lastActiveAt: 1};
    assert.equal(sameOrganizerIdentity(buildOrganizerIdentity(base), buildOrganizerIdentity({...base, lastActiveAt: 2})), true);
    assert.equal(
      sameOrganizerIdentity(buildOrganizerIdentity(base), buildOrganizerIdentity({...base, organizerProfile: {orgName: "B"}})),
      false,
    );
  });
});

describe("eventos listados", () => {
  it("rascunho, cancelado e linkOnly não contam; sem visibility conta", () => {
    assert.equal(isListedTournament({listingStatus: "draft"}), false);
    assert.equal(isListedTournament({listingStatus: "cancelled"}), false);
    assert.equal(isListedTournament({listingStatus: "open", visibility: "linkOnly"}), false);
    assert.equal(isListedTournament({listingStatus: "open"}), true);
    assert.equal(isListedTournament({status: "completed"}), true);
    assert.equal(isListedTournament(null), false);
  });

  it("completedListedTournamentIds devolve ids ordenados", () => {
    const rows = [
      row("b", {listingStatus: "completed"}),
      row("a", {listingStatus: "completed"}),
      row("c", {listingStatus: "completed", visibility: "linkOnly"}),
      row("d", {listingStatus: "open"}),
    ];
    assert.deepEqual(completedListedTournamentIds(rows), ["a", "b"]);
  });
});

describe("computeOrganizerStats", () => {
  it("conta, ordena esportes por frequência, agrupa locais e acha o primeiro evento", () => {
    const stats = computeOrganizerStats([
      row("t1", {listingStatus: "completed", sport: "beach_tennis", startAt: ts("2021-05-01T12:00:00Z"), locationName: "Arena ErreJota", city: "Goiânia"}),
      row("t2", {listingStatus: "completed", sport: "beach_volleyball", startAt: ts("2022-01-01T12:00:00Z"), locationName: "arena  errejota", city: "Goiânia"}),
      row("t3", {listingStatus: "open", sport: "beach_tennis", startAt: ts("2026-11-01T12:00:00Z"), locationName: "Garden Beach"}),
      row("t4", {listingStatus: "closed", sport: "padel", startAt: ts("2026-10-20T12:00:00Z"), arenaId: "arena-9", locationName: "Arena Central"}),
      row("t5", {listingStatus: "draft", sport: "padel", startAt: ts("2019-01-01T12:00:00Z")}),
      row("t6", {listingStatus: "open", visibility: "linkOnly", sport: "padel"}),
    ], 42);
    assert.equal(stats.listedEvents, 4);
    assert.equal(stats.eventsCompleted, 2);
    assert.equal(stats.openEvents, 1);
    assert.equal(stats.athletes, 42);
    assert.equal(stats.organizerSince?.toMillis(), ts("2021-05-01T12:00:00Z").toMillis());
    assert.deepEqual(stats.sports, ["beach_tennis", "beach_volleyball", "padel"]);
    assert.equal(stats.venues.length, 3);
    assert.deepEqual(stats.venues[0], {name: "arena  errejota", arenaId: null, city: "Goiânia", count: 2});
  });

  it("sem eventos listados: zeros e organizerSince nulo", () => {
    const stats = computeOrganizerStats([row("t1", {listingStatus: "draft"})], 0);
    assert.deepEqual(stats, {
      listedEvents: 0, eventsCompleted: 0, openEvents: 0, athletes: 0,
      organizerSince: null, sports: [], venues: [],
    });
  });

  it("normalizeVenueKey tira acento, caixa e espaço duplicado", () => {
    assert.equal(normalizeVenueKey("  Arena  Goiânia "), "arena goiania");
  });
});

describe("isOrganizerListed", () => {
  it("exige papel e ao menos um evento listado", () => {
    assert.equal(isOrganizerListed(true, {listedEvents: 1}), true);
    assert.equal(isOrganizerListed(true, {listedEvents: 0}), false);
    assert.equal(isOrganizerListed(false, {listedEvents: 3}), false);
    assert.equal(isOrganizerListed(true, undefined), false);
  });
});

describe("organizerStatsRelevantChange", () => {
  const base = {managerId: "org-1", listingStatus: "open", startAt: ts("2026-11-01T12:00:00Z"), categoryOps: {a: 1}};
  it("placar e categoryOps não disparam", () => {
    assert.equal(organizerStatsRelevantChange(base, {...base, categoryOps: {a: 2}, liveMatchesNow: 3}), false);
  });
  it("status, data, local e visibilidade disparam", () => {
    assert.equal(organizerStatsRelevantChange(base, {...base, listingStatus: "closed"}), true);
    assert.equal(organizerStatsRelevantChange(base, {...base, startAt: ts("2026-11-02T12:00:00Z")}), true);
    assert.equal(organizerStatsRelevantChange(base, {...base, locationName: "Outra"}), true);
    assert.equal(organizerStatsRelevantChange(base, {...base, visibility: "linkOnly"}), true);
  });
  it("Timestamp igual com instância nova não dispara", () => {
    assert.equal(organizerStatsRelevantChange(base, {...base, startAt: ts("2026-11-01T12:00:00Z")}), false);
  });
  it("criação e exclusão disparam", () => {
    assert.equal(organizerStatsRelevantChange(null, base), true);
    assert.equal(organizerStatsRelevantChange(base, null), true);
    assert.equal(organizerStatsRelevantChange(null, null), false);
  });
});

describe("touchesCompletedTournament / followerCountDelta", () => {
  it("só recontar atletas quando há evento realizado no antes ou no depois", () => {
    assert.equal(touchesCompletedTournament({listingStatus: "open"}, {listingStatus: "completed"}), true);
    assert.equal(touchesCompletedTournament({listingStatus: "completed"}, null), true);
    assert.equal(touchesCompletedTournament({listingStatus: "open"}, {listingStatus: "closed"}), false);
  });
  it("delta de seguidores", () => {
    assert.equal(followerCountDelta(false, true), 1);
    assert.equal(followerCountDelta(true, false), -1);
    assert.equal(followerCountDelta(true, true), 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd $WT/functions && npm run build`
Expected: FAIL (tsc: Cannot find module './organizer-public-profile').

- [ ] **Step 3: Write the implementation**

`functions/src/organizer-public-profile.ts`:

```ts
import {Timestamp} from "firebase-admin/firestore";
import {normalizePhoneForWhatsApp} from "./tournament-cancellation-request";

/**
 * Perfil público do organizador (`organizerPublicProfiles/{uid}`): projeções puras usadas pelos
 * gatilhos e pelo backfill. Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 */

export const ORGANIZER_PUBLIC_PROFILES_COLLECTION = "organizerPublicProfiles";
export const ORGANIZER_FOLLOWERS_SUBCOLLECTION = "followers";
export const ORGANIZER_FOLLOWER_PUSHES_COLLECTION = "organizerFollowerPushes";
export const ORGANIZER_BIO_MAX = 280;
export const ORGANIZER_VENUES_MAX = 3;

export type DocData = Record<string, unknown>;

export interface TournamentRow {
  id: string;
  data: DocData;
}

export interface OrganizerIdentity {
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  whatsapp: string | null;
  isOrganizer: boolean;
}

export interface OrganizerVenue {
  name: string;
  arenaId: string | null;
  city: string | null;
  count: number;
}

export interface OrganizerStats {
  listedEvents: number;
  eventsCompleted: number;
  openEvents: number;
  athletes: number;
  organizerSince: Timestamp | null;
  sports: string[];
  venues: OrganizerVenue[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s.length > 0 ? s : null;
}

function asMap(value: unknown): DocData {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as DocData : {};
}

export function userHasOrganizerRole(user: DocData | null | undefined): boolean {
  const roles = user?.roles;
  return Array.isArray(roles) &&
    roles.some((r) => typeof r === "string" && r.trim().toLowerCase() === "organizer");
}

/** Só o que é exibível. `contactEmail` e o telefone sem opt-in nunca saem de `users`. */
export function buildOrganizerIdentity(user: DocData): OrganizerIdentity {
  const profile = asMap(user.organizerProfile);
  const name = str(profile.orgName) || str(user.displayName) || str(user.fullName) ||
    str(user.name) || "Organizador";
  const bio = str(profile.bio);
  const phone = str(profile.contactPhone);
  const whatsapp = profile.publicWhatsapp === true && phone ? normalizePhoneForWhatsApp(phone) : "";
  const state = str(profile.state).toUpperCase();
  return {
    name,
    logoUrl: strOrNull(profile.logoUrl),
    coverUrl: strOrNull(profile.coverUrl),
    bio: bio ? bio.slice(0, ORGANIZER_BIO_MAX) : null,
    city: strOrNull(profile.city),
    state: state.length > 0 ? state : null,
    // DDI 55 + DDD + 8/9 dígitos. Menos que isso não abre conversa no wa.me.
    whatsapp: whatsapp.length >= 12 ? whatsapp : null,
    isOrganizer: userHasOrganizerRole(user),
  };
}

export function sameOrganizerIdentity(a: OrganizerIdentity, b: OrganizerIdentity): boolean {
  return a.name === b.name && a.logoUrl === b.logoUrl && a.coverUrl === b.coverUrl &&
    a.bio === b.bio && a.city === b.city && a.state === b.state &&
    a.whatsapp === b.whatsapp && a.isOrganizer === b.isOrganizer;
}

export function tournamentListingStatus(t: DocData | null | undefined): string {
  return (str(t?.listingStatus) || str(t?.status)).toLowerCase();
}

const LISTED_STATUSES = new Set(["open", "closed", "completed"]);

/** Mesmo critério do app e do portal (`isPubliclyListedTournamentDoc`): só `linkOnly` explícito
 *  esconde; doc sem `visibility` é anterior ao seletor e conta como público. */
export function isListedTournament(t: DocData | null | undefined): boolean {
  if (!t) return false;
  return LISTED_STATUSES.has(tournamentListingStatus(t)) && str(t.visibility) !== "linkOnly";
}

export function isOpenListedTournament(t: DocData | null | undefined): boolean {
  return isListedTournament(t) && tournamentListingStatus(t) === "open";
}

export function isCompletedListedTournament(t: DocData | null | undefined): boolean {
  return isListedTournament(t) && tournamentListingStatus(t) === "completed";
}

export function completedListedTournamentIds(rows: ReadonlyArray<TournamentRow>): string[] {
  return rows.filter((r) => isCompletedListedTournament(r.data)).map((r) => r.id).sort();
}

export function normalizeVenueKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function millisOf(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

interface VenueAcc extends OrganizerVenue {
  lastMs: number;
}

/** Números do perfil. Nada aqui depende do relógio: só mudam quando um torneio muda. */
export function computeOrganizerStats(rows: ReadonlyArray<TournamentRow>, athletes: number): OrganizerStats {
  const listed = rows.filter((r) => isListedTournament(r.data));
  const sportCounts = new Map<string, number>();
  const venues = new Map<string, VenueAcc>();
  let sinceMs: number | null = null;

  for (const {data} of listed) {
    const sport = str(data.sport);
    if (sport) sportCounts.set(sport, (sportCounts.get(sport) ?? 0) + 1);

    const startMs = millisOf(data.startAt);
    if (startMs != null && (sinceMs == null || startMs < sinceMs)) sinceMs = startMs;

    const arenaId = strOrNull(data.arenaId);
    const name = str(data.locationName);
    const key = arenaId ? `arena:${arenaId}` : name ? `name:${normalizeVenueKey(name)}` : "";
    if (!key) continue;
    const ms = startMs ?? 0;
    const prev = venues.get(key);
    if (!prev) {
      venues.set(key, {name: name || "Local", arenaId, city: strOrNull(data.city), count: 1, lastMs: ms});
      continue;
    }
    prev.count += 1;
    // O rótulo é o do evento mais recente: a grafia mais nova costuma ser a corrigida.
    if (ms >= prev.lastMs && name) {
      prev.name = name;
      prev.city = strOrNull(data.city) ?? prev.city;
      prev.lastMs = ms;
    }
  }

  const sports = [...sportCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sport]) => sport);
  const topVenues = [...venues.values()]
    .sort((a, b) => b.count - a.count || b.lastMs - a.lastMs || a.name.localeCompare(b.name))
    .slice(0, ORGANIZER_VENUES_MAX)
    .map(({name, arenaId, city, count}) => ({name, arenaId, city, count}));

  return {
    listedEvents: listed.length,
    eventsCompleted: listed.filter((r) => tournamentListingStatus(r.data) === "completed").length,
    openEvents: listed.filter((r) => tournamentListingStatus(r.data) === "open").length,
    athletes,
    organizerSince: sinceMs == null ? null : Timestamp.fromMillis(sinceMs),
    sports,
    venues: topVenues,
  };
}

export function isOrganizerListed(isOrganizer: boolean, stats: unknown): boolean {
  const listedEvents = asMap(stats).listedEvents;
  return isOrganizer && typeof listedEvents === "number" && listedEvents > 0;
}

/** Campos que mudam algum número. Placar, `categoryOps` e `liveMatchesNow` ficam de fora: são a
 *  maior parte das escritas em `tournaments` durante o evento. */
const STATS_FIELDS = [
  "managerId", "listingStatus", "status", "visibility", "sport",
  "startAt", "locationName", "arenaId", "city",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function organizerStatsRelevantChange(before: DocData | null, after: DocData | null): boolean {
  if (!before || !after) return before !== after;
  return STATS_FIELDS.some((field) => !sameValue(before[field], after[field]));
}

/** Atletas só mudam quando o conjunto de eventos realizados muda. */
export function touchesCompletedTournament(before: DocData | null, after: DocData | null): boolean {
  return isCompletedListedTournament(before) || isCompletedListedTournament(after);
}

export function followerCountDelta(beforeExists: boolean, afterExists: boolean): -1 | 0 | 1 {
  if (!beforeExists && afterExists) return 1;
  if (beforeExists && !afterExists) return -1;
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd $WT/functions && npm run build && node --test lib/organizer-public-profile.test.js`
Expected: PASS, todos os testes do arquivo (confira que a contagem bate com os `it` escritos).

- [ ] **Step 5: Commit**

```bash
cd $WT && pwd && git branch --show-current
cd $WT && git add functions/src/organizer-public-profile.ts functions/src/organizer-public-profile.test.ts
cd $WT && git commit -m "feat(organizer-profile): projeções puras do perfil público do organizador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sincronização (identidade, selo, números, seguidores)

**Files:**
- Create: `functions/src/organizer-public-profile-sync.ts`
- Test: `functions/src/organizer-public-profile-sync.test.ts`

**Interfaces:**
- Consumes: tudo de Task 1; `isConfirmedInscription`, `reviewEligibleUids` de `./tournament-review-window`; `artifactsInscriptionsPath`, `artifactsTeamsPath`, `getFirebaseProjectId` de `./firebase-paths`.
- Produces:
  - `syncOrganizerIdentity(db: Firestore, uid: string, before: DocData | null, after: DocData | null, nowMs?: number): Promise<void>`
  - `syncOrganizerVerified(db: Firestore, uid: string, verified: boolean): Promise<void>`
  - `countOrganizerAthletes(db: Firestore, organizerId: string, completedIds: string[], projectId?: string): Promise<number>`
  - `recomputeOrganizerStats(db: Firestore, organizerId: string, opts: {recountAthletes: boolean; nowMs?: number; projectId?: string}): Promise<OrganizerStats>`
  - gatilhos `onUserWrittenSyncOrganizerPublicProfile`, `onOrganizerRecordWrittenSyncVerified`, `onTournamentWrittenOrganizerStats`, `onOrganizerFollowerWritten`

- [ ] **Step 1: Write the failing test**

`functions/src/organizer-public-profile-sync.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  countOrganizerAthletes,
  recomputeOrganizerStats,
  syncOrganizerIdentity,
  syncOrganizerVerified,
} from "./organizer-public-profile-sync";

const NOW = Date.UTC(2026, 9, 2, 15, 0, 0);
const PROJECT = "proj";
const PROFILE = "organizerPublicProfiles/org-1";

function asDb(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const organizerUser = {
  roles: ["organizer"],
  displayName: "Resp",
  organizerProfile: {orgName: "Liga A", city: "Goiânia", state: "GO"},
};

describe("syncOrganizerIdentity", () => {
  it("cria o doc do organizador com selo lido de organizers/{uid}", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("organizers/org-1", {document: "x"});
    await syncOrganizerIdentity(asDb(fake), "org-1", null, organizerUser, NOW);
    const doc = fake.store.get(PROFILE);
    assert.equal(doc?.name, "Liga A");
    assert.equal(doc?.verified, true);
    assert.equal(doc?.listed, false);
    assert.equal(doc?.isOrganizer, true);
    assert.equal(doc?.uid, "org-1");
  });

  it("não cria doc para quem nunca foi organizador", async () => {
    const fake = new FakeFirestore();
    await syncOrganizerIdentity(asDb(fake), "u-1", null, {roles: ["athlete"], fullName: "Atleta"}, NOW);
    assert.equal(fake.store.has("organizerPublicProfiles/u-1"), false);
  });

  it("escrita que não muda a identidade não grava nada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", name: "Antigo"});
    await syncOrganizerIdentity(asDb(fake), "org-1", {...organizerUser, lastActiveAt: 1}, {...organizerUser, lastActiveAt: 2}, NOW);
    assert.equal(fake.store.get(PROFILE)?.name, "Antigo");
  });

  it("perder o papel tira da lista e preserva números", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", name: "Liga A", isOrganizer: true, listed: true, verified: true, stats: {listedEvents: 2}});
    await syncOrganizerIdentity(asDb(fake), "org-1", organizerUser, {...organizerUser, roles: ["athlete"]}, NOW);
    const doc = fake.store.get(PROFILE);
    assert.equal(doc?.isOrganizer, false);
    assert.equal(doc?.listed, false);
    assert.equal(doc?.verified, true);
    assert.deepEqual(doc?.stats, {listedEvents: 2});
  });

  it("listed fica true quando já há eventos listados", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", stats: {listedEvents: 1}});
    await syncOrganizerIdentity(asDb(fake), "org-1", null, organizerUser, NOW);
    assert.equal(fake.store.get(PROFILE)?.listed, true);
  });

  it("usuário apagado apaga o doc público", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1"});
    await syncOrganizerIdentity(asDb(fake), "org-1", organizerUser, null, NOW);
    assert.equal(fake.store.has(PROFILE), false);
  });
});

describe("syncOrganizerVerified", () => {
  it("atualiza só doc existente", async () => {
    const fake = new FakeFirestore();
    await syncOrganizerVerified(asDb(fake), "org-1", true);
    assert.equal(fake.store.has(PROFILE), false);
    fake.seedDoc(PROFILE, {uid: "org-1", verified: false});
    await syncOrganizerVerified(asDb(fake), "org-1", true);
    assert.equal(fake.store.get(PROFILE)?.verified, true);
  });
});

function seedTournament(fake: FakeFirestore, id: string, data: Record<string, unknown>) {
  fake.seedDoc(`tournaments/${id}`, {managerId: "org-1", visibility: "publicListing", ...data});
}

function seedInscription(fake: FakeFirestore, id: string, data: Record<string, unknown>) {
  fake.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/${id}`, data);
}

describe("countOrganizerAthletes", () => {
  it("conta atletas distintos de inscrições confirmadas, sem o organizador", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-1`, {player1Id: "a1", player2Id: "a2"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-2`, {player1Id: "a2", player2Id: "org-1"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-3`, {player1Id: "a9", player2Id: "a8"});
    seedInscription(fake, "i1", {tournamentId: "t1", teamId: "team-1", isPaid: true});
    seedInscription(fake, "i2", {tournamentId: "t2", teamId: "team-2", isPaid: true});
    seedInscription(fake, "i3", {tournamentId: "t2", teamId: "team-3", isPaid: true, waitlist: true});
    seedInscription(fake, "i4", {tournamentId: "t3", teamId: "team-3", isPaid: true});
    const count = await countOrganizerAthletes(asDb(fake), "org-1", ["t1", "t2"], PROJECT);
    assert.equal(count, 2); // a1, a2 — a9/a8 estavam na fila; t3 não foi pedido
  });
});

describe("recomputeOrganizerStats", () => {
  it("grava stats e listed; sem recontagem preserva atletas", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", isOrganizer: true, stats: {athletes: 7}});
    seedTournament(fake, "t1", {listingStatus: "open", sport: "padel", startAt: Timestamp.fromMillis(NOW)});
    seedTournament(fake, "t-other", {managerId: "org-2", listingStatus: "open"});
    const stats = await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: false, nowMs: NOW, projectId: PROJECT});
    assert.equal(stats.listedEvents, 1);
    assert.equal(stats.athletes, 7);
    const doc = fake.store.get(PROFILE);
    assert.equal(doc?.listed, true);
    assert.equal((doc?.stats as {openEvents: number}).openEvents, 1);
  });

  it("com recontagem conta atletas dos eventos realizados", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROFILE, {uid: "org-1", isOrganizer: true});
    seedTournament(fake, "t1", {listingStatus: "completed"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/team-1`, {player1Id: "a1", player2Id: "a2"});
    seedInscription(fake, "i1", {tournamentId: "t1", teamId: "team-1", isPaid: true});
    const stats = await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: true, nowMs: NOW, projectId: PROJECT});
    assert.equal(stats.athletes, 2);
    assert.equal(stats.eventsCompleted, 1);
  });

  it("doc ausente: cria com listed false (identidade ainda não sincronizada)", async () => {
    const fake = new FakeFirestore();
    seedTournament(fake, "t1", {listingStatus: "open"});
    await recomputeOrganizerStats(asDb(fake), "org-1", {recountAthletes: false, nowMs: NOW, projectId: PROJECT});
    assert.equal(fake.store.get(PROFILE)?.listed, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd $WT/functions && npm run build`
Expected: FAIL (Cannot find module './organizer-public-profile-sync').

- [ ] **Step 3: Write the implementation**

`functions/src/organizer-public-profile-sync.ts`:

```ts
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {
  buildOrganizerIdentity,
  completedListedTournamentIds,
  computeOrganizerStats,
  followerCountDelta,
  isOrganizerListed,
  ORGANIZER_FOLLOWERS_SUBCOLLECTION,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
  organizerStatsRelevantChange,
  sameOrganizerIdentity,
  touchesCompletedTournament,
  type DocData,
  type OrganizerStats,
  type TournamentRow,
} from "./organizer-public-profile";
import {isConfirmedInscription, reviewEligibleUids} from "./tournament-review-window";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileRef(db: Firestore, uid: string) {
  return db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Copia a identidade exibível de `users/{uid}`. `users` é gravado o tempo todo (`lastActiveAt`),
 * então sai sem ler nada quando a projeção não mudou. Quem nunca foi organizador não ganha doc.
 */
export async function syncOrganizerIdentity(
  db: Firestore,
  uid: string,
  before: DocData | null,
  after: DocData | null,
  nowMs: number = Date.now(),
): Promise<void> {
  const ref = profileRef(db, uid);
  if (!after) {
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
    return;
  }
  const next = buildOrganizerIdentity(after);
  if (before && sameOrganizerIdentity(buildOrganizerIdentity(before), next)) return;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists && !next.isOrganizer) return;
    const current = snap.exists ? snap.data() as DocData : {};
    // O selo nasce aqui só na criação; depois quem mantém é o gatilho de `organizers/{uid}`.
    const verified = snap.exists ?
      current.verified === true :
      (await tx.get(db.collection("organizers").doc(uid))).exists;
    tx.set(ref, {
      uid,
      ...next,
      verified,
      listed: isOrganizerListed(next.isOrganizer, current.stats),
      identityUpdatedAt: Timestamp.fromMillis(nowMs),
    }, {merge: true});
  });
}

export async function syncOrganizerVerified(db: Firestore, uid: string, verified: boolean): Promise<void> {
  const ref = profileRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    if ((snap.data() as DocData).verified === verified) return;
    tx.update(ref, {verified});
  });
}

/** Atletas distintos que jogaram (mesmo filtro dos convites de avaliação), sem o organizador. */
export async function countOrganizerAthletes(
  db: Firestore,
  organizerId: string,
  completedIds: string[],
  projectId: string = getFirebaseProjectId(),
): Promise<number> {
  const uids = new Set<string>();
  for (const group of chunk(completedIds, 5)) {
    const perTournament = await Promise.all(group.map(async (tournamentId) => {
      const snap = await db.collection(artifactsInscriptionsPath(projectId))
        .where("tournamentId", "==", tournamentId)
        .get();
      const inscriptions = snap.docs.map((d) => d.data() as DocData);
      const teamIds = [...new Set(inscriptions.filter(isConfirmedInscription).map((i) => str(i.teamId)))];
      const teamsById = new Map<string, DocData>();
      for (const ids of chunk(teamIds, 100)) {
        const snaps = await db.getAll(...ids.map((id) => db.doc(`${artifactsTeamsPath(projectId)}/${id}`)));
        for (const s of snaps) if (s.exists) teamsById.set(s.id, s.data() as DocData);
      }
      return reviewEligibleUids(inscriptions, teamsById, [organizerId]);
    }));
    for (const list of perTournament) for (const uid of list) uids.add(uid);
  }
  return uids.size;
}

function rowsOf(snap: {docs: Array<{id: string; data: () => unknown}>}): TournamentRow[] {
  return snap.docs.map((d) => ({id: d.id, data: (d.data() ?? {}) as DocData}));
}

const MAX_STATS_ATTEMPTS = 3;

/**
 * Recalcula os números do zero. A leitura dos torneios e a escrita ficam na mesma transação (dois
 * gatilhos do mesmo organizador correm juntos). A contagem de atletas é cara e fica fora; se o
 * conjunto de eventos realizados mudou entre a contagem e a transação, conta de novo.
 */
export async function recomputeOrganizerStats(
  db: Firestore,
  organizerId: string,
  opts: {recountAthletes: boolean; nowMs?: number; projectId?: string},
): Promise<OrganizerStats> {
  const nowMs = opts.nowMs ?? Date.now();
  const projectId = opts.projectId ?? getFirebaseProjectId();
  const ref = profileRef(db, organizerId);
  const tournamentsQuery = db.collection("tournaments").where("managerId", "==", organizerId);

  for (let attempt = 0; attempt < MAX_STATS_ATTEMPTS; attempt++) {
    let athletes: number | null = null;
    let basis: string | null = null;
    if (opts.recountAthletes) {
      const completed = completedListedTournamentIds(rowsOf(await tournamentsQuery.get()));
      athletes = await countOrganizerAthletes(db, organizerId, completed, projectId);
      basis = completed.join(",");
    }
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const rows = rowsOf(await tx.get(tournamentsQuery) as {docs: Array<{id: string; data: () => unknown}>});
      if (basis != null && completedListedTournamentIds(rows).join(",") !== basis) return null;
      const current = snap.exists ? snap.data() as DocData : {};
      const previous = (current.stats ?? {}) as DocData;
      const previousAthletes = typeof previous.athletes === "number" ? previous.athletes : 0;
      const stats = computeOrganizerStats(rows, athletes ?? previousAthletes);
      tx.set(ref, {
        uid: organizerId,
        stats,
        listed: isOrganizerListed(current.isOrganizer === true, stats),
        statsUpdatedAt: Timestamp.fromMillis(nowMs),
      }, {merge: true});
      return stats;
    });
    if (result) return result;
  }
  throw new Error(`recomputeOrganizerStats: eventos realizados mudando sem parar (${organizerId})`);
}

function dataOf(snap: {exists: boolean; data: () => unknown} | undefined): DocData | null {
  return snap?.exists ? (snap.data() ?? {}) as DocData : null;
}

export const onUserWrittenSyncOrganizerPublicProfile = onDocumentWritten(
  "users/{userId}",
  async (event) => {
    await syncOrganizerIdentity(
      getFirestore(),
      event.params.userId,
      dataOf(event.data?.before),
      dataOf(event.data?.after),
    );
  },
);

export const onOrganizerRecordWrittenSyncVerified = onDocumentWritten(
  "organizers/{organizerId}",
  async (event) => {
    await syncOrganizerVerified(getFirestore(), event.params.organizerId, event.data?.after?.exists === true);
  },
);

export const onTournamentWrittenOrganizerStats = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const before = dataOf(event.data?.before);
    const after = dataOf(event.data?.after);
    if (!organizerStatsRelevantChange(before, after)) return;
    const organizerIds = new Set([str(before?.managerId), str(after?.managerId)].filter((id) => id));
    const recountAthletes = touchesCompletedTournament(before, after);
    for (const organizerId of organizerIds) {
      const stats = await recomputeOrganizerStats(getFirestore(), organizerId, {recountAthletes});
      logger.info("organizerPublicProfile: números recalculados", {
        organizerId,
        tournamentId: event.params.tournamentId,
        recountAthletes,
        listedEvents: stats.listedEvents,
      });
    }
  },
);

export const onOrganizerFollowerWritten = onDocumentWritten(
  `${ORGANIZER_PUBLIC_PROFILES_COLLECTION}/{organizerId}/${ORGANIZER_FOLLOWERS_SUBCOLLECTION}/{userId}`,
  async (event) => {
    const delta = followerCountDelta(event.data?.before?.exists === true, event.data?.after?.exists === true);
    if (delta === 0) return;
    await profileRef(getFirestore(), event.params.organizerId)
      .set({followersCount: FieldValue.increment(delta)}, {merge: true});
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd $WT/functions && npm run build && node --test lib/organizer-public-profile-sync.test.js lib/organizer-public-profile.test.js`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
cd $WT && pwd && git branch --show-current
cd $WT && git add functions/src/organizer-public-profile-sync.ts functions/src/organizer-public-profile-sync.test.ts
cd $WT && git commit -m "feat(organizer-profile): gatilhos de identidade, selo, números e seguidores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Push aos seguidores na abertura de inscrição

**Files:**
- Modify: `functions/src/fake-firestore.test-helper.ts` (adicionar `create` ao `FakeDocRef`)
- Create: `functions/src/organizer-follower-push.ts`
- Test: `functions/src/organizer-follower-push.test.ts`

**Interfaces:**
- Consumes: Task 1 (`isOpenListedTournament`, constantes, `buildOrganizerIdentity`); `deliverNotificationToUser`, `DeliverNotificationInput`, `WEB_PUSH_*` de `./notification-delivery`; `EVENT_TIME_ZONE` de `./event-timezone`.
- Produces:
  - `ORGANIZER_FOLLOWER_PUSH_TYPE = "organizer_event_registration_open"`
  - `type FollowerPushDecision = {action: "none"} | {action: "send"} | {action: "schedule"; sendAtMs: number}`
  - `organizerFollowerPushDecision(before, after, nowMs): FollowerPushDecision`
  - `organizerFollowerPushContent(organizerName, tournamentId, tournament): Omit<DeliverNotificationInput, "userId">`
  - `type Notify = (input: DeliverNotificationInput) => Promise<unknown>`
  - `notifyOrganizerFollowers(db, tournamentId, tournament, notify): Promise<number>`
  - `handleTournamentOpenedForFollowers(db, tournamentId, before, after, nowMs, notify): Promise<void>`
  - `sendDueOrganizerFollowerPushes(db, nowMs, notify): Promise<number>`
  - gatilhos `onTournamentWrittenNotifyOrganizerFollowers`, `sendScheduledOrganizerFollowerPushes`

- [ ] **Step 1: Estender o fake com `create`**

Em `functions/src/fake-firestore.test-helper.ts`, no `FakeDocRef` adicione `create: (data: DocData) => Promise<void>;` e no `makeRef`:

```ts
      create: async (data: DocData) => {
        // Espelha o Admin SDK: `create` em doc existente falha com ALREADY_EXISTS (código 6).
        if (self.store.has(path)) {
          const error = new Error(`6 ALREADY_EXISTS: Document already exists: ${path}`);
          (error as Error & {code: number}).code = 6;
          throw error;
        }
        self.write(path, data);
      },
```

- [ ] **Step 2: Write the failing test**

`functions/src/organizer-follower-push.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {DeliverNotificationInput} from "./notification-delivery";
import {
  handleTournamentOpenedForFollowers,
  organizerFollowerPushContent,
  organizerFollowerPushDecision,
  sendDueOrganizerFollowerPushes,
} from "./organizer-follower-push";

const NOW = Date.UTC(2026, 9, 2, 15, 0, 0);
const HOUR = 3_600_000;
const LOCK = "organizerFollowerPushes/t1";

function asDb(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const open = {managerId: "org-1", listingStatus: "open", visibility: "publicListing", name: "Copa Verão",
  startAt: Timestamp.fromMillis(Date.UTC(2026, 7, 4, 12)), locationName: "Arena ErreJota"};

function setup() {
  const fake = new FakeFirestore();
  fake.seedDoc("organizerPublicProfiles/org-1", {uid: "org-1", name: "Liga A"});
  fake.seedDoc("organizerPublicProfiles/org-1/followers/a1", {userId: "a1"});
  fake.seedDoc("organizerPublicProfiles/org-1/followers/a2", {userId: "a2"});
  fake.seedDoc("organizerPublicProfiles/org-1/followers/org-1", {userId: "org-1"});
  const sent: DeliverNotificationInput[] = [];
  const notify = async (input: DeliverNotificationInput) => {
    sent.push(input);
  };
  return {fake, sent, notify};
}

describe("organizerFollowerPushDecision", () => {
  it("só na transição para aberto e listado", () => {
    assert.deepEqual(organizerFollowerPushDecision({...open, listingStatus: "draft"}, open, NOW), {action: "send"});
    assert.deepEqual(organizerFollowerPushDecision(null, open, NOW), {action: "send"});
    assert.deepEqual(organizerFollowerPushDecision(open, {...open, name: "x"}, NOW), {action: "none"});
    assert.deepEqual(organizerFollowerPushDecision(null, {...open, visibility: "linkOnly"}, NOW), {action: "none"});
    assert.deepEqual(
      organizerFollowerPushDecision({...open, visibility: "linkOnly"}, open, NOW),
      {action: "send"},
    );
  });

  it("abertura futura agenda", () => {
    const opensAt = Timestamp.fromMillis(NOW + 2 * HOUR);
    assert.deepEqual(
      organizerFollowerPushDecision(null, {...open, registrationOpensAt: opensAt}, NOW),
      {action: "schedule", sendAtMs: NOW + 2 * HOUR},
    );
  });
});

describe("organizerFollowerPushContent", () => {
  it("título com a marca e corpo com nome, dia e local", () => {
    const content = organizerFollowerPushContent("Liga A", "t1", open);
    assert.equal(content.title, "Liga A abriu inscrições");
    assert.equal(content.body, "Copa Verão · 04/08 · Arena ErreJota");
    assert.equal(content.type, "organizer_event_registration_open");
    assert.deepEqual(content.data, {url: "/torneios/t1", webUrl: "/torneios/t1", tournamentId: "t1", organizerId: "org-1"});
  });

  it("partes vazias somem", () => {
    const content = organizerFollowerPushContent("Liga A", "t1", {managerId: "org-1", name: "Copa"});
    assert.equal(content.body, "Copa");
  });
});

describe("handleTournamentOpenedForFollowers", () => {
  it("envia aos seguidores (menos o organizador) e grava a trava", async () => {
    const {fake, sent, notify} = setup();
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", {...open, listingStatus: "draft"}, open, NOW, notify);
    assert.deepEqual(sent.map((s) => s.userId).sort(), ["a1", "a2"]);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
    assert.equal(fake.store.get(LOCK)?.recipients, 2);
  });

  it("reabrir não reenvia", async () => {
    const {fake, sent, notify} = setup();
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, open, NOW, notify);
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", {...open, listingStatus: "closed"}, open, NOW + HOUR, notify);
    assert.equal(sent.length, 2);
  });

  it("abertura futura só agenda", async () => {
    const {fake, sent, notify} = setup();
    const opensAt = Timestamp.fromMillis(NOW + 2 * HOUR);
    await handleTournamentOpenedForFollowers(asDb(fake), "t1", null, {...open, registrationOpensAt: opensAt}, NOW, notify);
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(LOCK)?.status, "scheduled");
    assert.equal((fake.store.get(LOCK)?.sendAt as Timestamp).toMillis(), NOW + 2 * HOUR);
  });
});

describe("sendDueOrganizerFollowerPushes", () => {
  function seedScheduled(fake: FakeFirestore, sendAtMs: number) {
    fake.seedDoc(LOCK, {organizerId: "org-1", status: "scheduled", sendAt: Timestamp.fromMillis(sendAtMs)});
  }

  it("envia as vencidas e ignora as futuras", async () => {
    const {fake, sent, notify} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", open);
    fake.seedDoc("organizerFollowerPushes/t2", {organizerId: "org-1", status: "scheduled", sendAt: Timestamp.fromMillis(NOW + HOUR)});
    const count = await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(count, 1);
    assert.equal(sent.length, 2);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
    assert.equal(fake.store.get("organizerFollowerPushes/t2")?.status, "scheduled");
  });

  it("torneio que deixou de estar aberto vira skipped", async () => {
    const {fake, sent, notify} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", {...open, listingStatus: "cancelled"});
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(LOCK)?.status, "skipped");
  });

  it("abertura adiada reagenda", async () => {
    const {fake, sent, notify} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", {...open, registrationOpensAt: Timestamp.fromMillis(NOW + 3 * HOUR)});
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(LOCK)?.status, "scheduled");
    assert.equal((fake.store.get(LOCK)?.sendAt as Timestamp).toMillis(), NOW + 3 * HOUR);
  });

  it("um push que falha não derruba os outros", async () => {
    const {fake} = setup();
    seedScheduled(fake, NOW - 1);
    fake.seedDoc("tournaments/t1", open);
    const delivered: string[] = [];
    const notify = async (input: DeliverNotificationInput) => {
      if (input.userId === "a1") throw new Error("boom");
      delivered.push(input.userId);
    };
    await sendDueOrganizerFollowerPushes(asDb(fake), NOW, notify);
    assert.deepEqual(delivered, ["a2"]);
    assert.equal(fake.store.get(LOCK)?.status, "sent");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd $WT/functions && npm run build`
Expected: FAIL (Cannot find module './organizer-follower-push').

- [ ] **Step 4: Write the implementation**

`functions/src/organizer-follower-push.ts`:

```ts
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {
  deliverNotificationToUser,
  type DeliverNotificationInput,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {
  buildOrganizerIdentity,
  isOpenListedTournament,
  ORGANIZER_FOLLOWER_PUSHES_COLLECTION,
  ORGANIZER_FOLLOWERS_SUBCOLLECTION,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
  type DocData,
} from "./organizer-public-profile";

export const ORGANIZER_FOLLOWER_PUSH_TYPE = "organizer_event_registration_open";
const PUSH_BATCH = 20;
const DUE_LIMIT = 50;

export type Notify = (input: DeliverNotificationInput) => Promise<unknown>;

export type FollowerPushDecision =
  | {action: "none"}
  | {action: "send"}
  | {action: "schedule"; sendAtMs: number};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function opensAtMs(tournament: DocData): number | null {
  const raw = tournament.registrationOpensAt;
  return raw instanceof Timestamp ? raw.toMillis() : null;
}

/** Avisa uma vez, na transição para "inscrição aberta e listado". */
export function organizerFollowerPushDecision(
  before: DocData | null,
  after: DocData | null,
  nowMs: number,
): FollowerPushDecision {
  if (!after || !isOpenListedTournament(after) || !str(after.managerId)) return {action: "none"};
  if (isOpenListedTournament(before)) return {action: "none"};
  const opensAt = opensAtMs(after);
  if (opensAt != null && opensAt > nowMs) return {action: "schedule", sendAtMs: opensAt};
  return {action: "send"};
}

function eventDay(value: unknown): string {
  if (!(value instanceof Timestamp)) return "";
  return value.toDate().toLocaleDateString("pt-BR", {timeZone: EVENT_TIME_ZONE, day: "2-digit", month: "2-digit"});
}

export function organizerFollowerPushContent(
  organizerName: string,
  tournamentId: string,
  tournament: DocData,
): Omit<DeliverNotificationInput, "userId"> {
  const body = [str(tournament.name), eventDay(tournament.startAt), str(tournament.locationName)]
    .filter((part) => part.length > 0)
    .join(" · ");
  const path = `/torneios/${tournamentId}`;
  return {
    title: `${organizerName} abriu inscrições`,
    body,
    type: ORGANIZER_FOLLOWER_PUSH_TYPE,
    // `/torneios/{id}` existe no app e no portal; build antigo do app abre `url` que começa com `/`.
    data: {url: path, webUrl: path, tournamentId, organizerId: str(tournament.managerId)},
  };
}

async function resolveOrganizerName(db: Firestore, organizerId: string): Promise<string> {
  const profile = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(organizerId).get();
  const name = profile.exists ? str((profile.data() as DocData).name) : "";
  if (name) return name;
  const user = await db.collection("users").doc(organizerId).get();
  return user.exists ? buildOrganizerIdentity(user.data() as DocData).name : "Organizador";
}

export async function notifyOrganizerFollowers(
  db: Firestore,
  tournamentId: string,
  tournament: DocData,
  notify: Notify,
): Promise<number> {
  const organizerId = str(tournament.managerId);
  const followers = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(organizerId)
    .collection(ORGANIZER_FOLLOWERS_SUBCOLLECTION).get();
  const recipients = followers.docs.map((d) => d.id).filter((uid) => uid !== organizerId);
  if (recipients.length === 0) return 0;
  const content = organizerFollowerPushContent(await resolveOrganizerName(db, organizerId), tournamentId, tournament);
  for (let i = 0; i < recipients.length; i += PUSH_BATCH) {
    await Promise.all(recipients.slice(i, i + PUSH_BATCH).map((userId) =>
      notify({userId, ...content}).catch((error) => {
        logger.warn("organizerFollowerPush: push falhou", {userId, tournamentId, error});
      }),
    ));
  }
  return recipients.length;
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as {code?: unknown})?.code;
  return code === 6 || code === "already-exists" || /already exists/i.test(String((error as Error)?.message));
}

/**
 * A trava (`create`) garante um aviso por evento, mesmo com o gatilho reentregue ou o evento
 * reaberto. Criada já como `sending`: se a function cair no meio, preferimos perder um aviso a
 * duplicar.
 */
export async function handleTournamentOpenedForFollowers(
  db: Firestore,
  tournamentId: string,
  before: DocData | null,
  after: DocData | null,
  nowMs: number,
  notify: Notify,
): Promise<void> {
  const decision = organizerFollowerPushDecision(before, after, nowMs);
  if (decision.action === "none" || !after) return;
  const lockRef = db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION).doc(tournamentId);
  const base = {organizerId: str(after.managerId), createdAt: Timestamp.fromMillis(nowMs)};
  try {
    await lockRef.create(decision.action === "schedule" ?
      {...base, status: "scheduled", sendAt: Timestamp.fromMillis(decision.sendAtMs)} :
      {...base, status: "sending", sendAt: Timestamp.fromMillis(nowMs)});
  } catch (error) {
    if (isAlreadyExists(error)) return;
    throw error;
  }
  if (decision.action === "schedule") return;
  const recipients = await notifyOrganizerFollowers(db, tournamentId, after, notify);
  await lockRef.update({status: "sent", sentAt: Timestamp.fromMillis(nowMs), recipients});
}

export async function sendDueOrganizerFollowerPushes(db: Firestore, nowMs: number, notify: Notify): Promise<number> {
  const due = await db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION)
    .where("status", "==", "scheduled")
    .where("sendAt", "<=", Timestamp.fromMillis(nowMs))
    .limit(DUE_LIMIT)
    .get();
  let sent = 0;
  for (const lock of due.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lock.ref);
      if ((snap.data() as DocData | undefined)?.status !== "scheduled") return false;
      tx.update(lock.ref, {status: "sending"});
      return true;
    });
    if (!claimed) continue;

    const tournamentSnap = await db.collection("tournaments").doc(lock.id).get();
    const tournament = tournamentSnap.exists ? tournamentSnap.data() as DocData : null;
    if (!tournament || !isOpenListedTournament(tournament)) {
      await lock.ref.update({status: "skipped", skippedReason: tournament ? "not_open" : "deleted"});
      continue;
    }
    const opensAt = opensAtMs(tournament);
    if (opensAt != null && opensAt > nowMs) {
      await lock.ref.update({status: "scheduled", sendAt: Timestamp.fromMillis(opensAt)});
      continue;
    }
    const recipients = await notifyOrganizerFollowers(db, lock.id, tournament, notify);
    await lock.ref.update({status: "sent", sentAt: Timestamp.fromMillis(nowMs), recipients});
    sent += 1;
  }
  return sent;
}

function dataOf(snap: {exists: boolean; data: () => unknown} | undefined): DocData | null {
  return snap?.exists ? (snap.data() ?? {}) as DocData : null;
}

export const onTournamentWrittenNotifyOrganizerFollowers = onDocumentWritten(
  {
    document: "tournaments/{tournamentId}",
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    await handleTournamentOpenedForFollowers(
      getFirestore(),
      event.params.tournamentId,
      dataOf(event.data?.before),
      dataOf(event.data?.after),
      Date.now(),
      deliverNotificationToUser,
    );
  },
);

export const sendScheduledOrganizerFollowerPushes = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: EVENT_TIME_ZONE,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async () => {
    const sent = await sendDueOrganizerFollowerPushes(getFirestore(), Date.now(), deliverNotificationToUser);
    if (sent > 0) logger.info("sendScheduledOrganizerFollowerPushes", {sent});
  },
);
```

Nota: o fake só aceita `where` com `<=` comparando Timestamp com Timestamp (vira millis) — é o caso aqui.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd $WT/functions && npm run build && node --test lib/organizer-follower-push.test.js lib/fake-firestore-tx.test.js lib/fake-firestore-queries.test.js`
Expected: PASS em todos (os testes do fake continuam verdes com o `create` novo).

Se o corpo do push sair com dia diferente de `04/08`, confira o `timeZone` (America/Sao_Paulo) — `Date.UTC(2026, 7, 4, 12)` é 09:00 em Brasília.

- [ ] **Step 6: Commit**

```bash
cd $WT && pwd && git branch --show-current
cd $WT && git add functions/src/fake-firestore.test-helper.ts functions/src/organizer-follower-push.ts functions/src/organizer-follower-push.test.ts
cd $WT && git commit -m "feat(organizer-profile): push aos seguidores quando o evento abre inscrição

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Regras, índice e teste de regras

**Files:**
- Modify: `firestore.rules` (logo depois do bloco `match /organizerReputation/{organizerId}`, hoje por volta da linha 2217)
- Modify: `firestore.indexes.json` (array `indexes`)
- Test: `functions/test/organizer-public-profiles.rules.test.mjs`

**Interfaces:**
- Consumes: nomes de coleção da Task 1.
- Produces: rules que os clientes (fases 2–4) usam: leitura pública do perfil; seguir/deixar de seguir com doc `{userId, organizerId, followedAt: serverTimestamp()}` em `organizerPublicProfiles/{org}/followers/{meuUid}`.

- [ ] **Step 1: Write the failing test**

`functions/test/organizer-public-profiles.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-organizer-public-profiles-test';
const ORG = 'org-uid';
const ATHLETE = 'athlete-uid';
const OTHER = 'other-uid';

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });
const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();
const followerRef = (db, orgId, uid) => doc(db, 'organizerPublicProfiles', orgId, 'followers', uid);

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizerPublicProfiles', ORG), { uid: ORG, name: 'Liga A', listed: true });
    await setDoc(followerRef(db, ORG, OTHER), { userId: OTHER, organizerId: ORG, followedAt: Timestamp.now() });
    await setDoc(doc(db, 'organizerFollowerPushes', 't1'), { status: 'sent' });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('perfil: leitura pública, inclusive sem login', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'organizerPublicProfiles', ORG)));
  await assertSucceeds(getDoc(doc(as(ATHLETE), 'organizerPublicProfiles', ORG)));
});

test('perfil: ninguém grava pelo cliente, nem o próprio organizador', async () => {
  await assertFails(setDoc(doc(as(ORG), 'organizerPublicProfiles', ORG), { name: 'Hack' }, { merge: true }));
  await assertFails(setDoc(doc(as(ATHLETE), 'organizerPublicProfiles', ORG), { followersCount: 999 }, { merge: true }));
});

test('seguidores: leitura só logado', async () => {
  await assertSucceeds(getDocs(collection(as(ATHLETE), 'organizerPublicProfiles', ORG, 'followers')));
  await assertFails(getDocs(collection(anon(), 'organizerPublicProfiles', ORG, 'followers')));
});

test('seguir: o próprio atleta, com as três chaves e serverTimestamp', async () => {
  const db = as(ATHLETE);
  await assertSucceeds(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: serverTimestamp() }));
});

test('seguir: negado em nome de outro, com chave extra, data forjada ou a si mesmo', async () => {
  const db = as(ATHLETE);
  await assertFails(setDoc(followerRef(db, ORG, 'someone-else'), { userId: 'someone-else', organizerId: ORG, followedAt: serverTimestamp() }));
  await assertFails(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: serverTimestamp(), extra: 1 }));
  await assertFails(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: Timestamp.fromMillis(0) }));
  await assertFails(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: 'other-org', followedAt: serverTimestamp() }));
  await assertFails(setDoc(followerRef(as(ORG), ORG, ORG), { userId: ORG, organizerId: ORG, followedAt: serverTimestamp() }));
});

test('deixar de seguir: só o próprio', async () => {
  await assertFails(deleteDoc(followerRef(as(ATHLETE), ORG, OTHER)));
  await assertSucceeds(deleteDoc(followerRef(as(OTHER), ORG, OTHER)));
});

test('seguidor não é editável (sem update)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(followerRef(ctx.firestore(), ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: Timestamp.now() });
  });
  await assertFails(setDoc(followerRef(as(ATHLETE), ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: serverTimestamp() }));
});

test('trava de push: fechada para todos', async () => {
  await assertFails(getDoc(doc(as(ORG), 'organizerFollowerPushes', 't1')));
  await assertFails(setDoc(doc(as(ORG), 'organizerFollowerPushes', 't2'), { status: 'sent' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd $WT/functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/organizer-public-profiles.rules.test.mjs"`
Expected: FAIL (leitura pública e seguir negados — coleção sem regra cai no catch-all `if false`).

- [ ] **Step 3: Write the rules**

Em `firestore.rules`, logo depois do bloco `match /organizerReputation/{organizerId} { ... }`:

```
    // Perfil público do organizador — mantido só por Cloud Function
    // (organizer-public-profile-sync.ts). Leitura pública, como organizerReputation.
    // Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
    match /organizerPublicProfiles/{organizerId} {
      allow read: if true;
      allow write: if false;

      // Quem segue. O contador `followersCount` do doc pai é mantido pelo gatilho
      // onOrganizerFollowerWritten. Sem update: seguir é criar, deixar de seguir é apagar.
      match /followers/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null &&
          request.auth.uid == userId &&
          userId != organizerId &&
          request.resource.data.keys().hasAll(['userId', 'organizerId', 'followedAt']) &&
          request.resource.data.keys().hasOnly(['userId', 'organizerId', 'followedAt']) &&
          request.resource.data.userId == userId &&
          request.resource.data.organizerId == organizerId &&
          request.resource.data.followedAt == request.time;
        allow delete: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Trava do push "abriu inscrições" aos seguidores (organizer-follower-push.ts).
    match /organizerFollowerPushes/{tournamentId} {
      allow read, write: if false;
    }
```

Em `firestore.indexes.json`, adicionar ao array `indexes`:

```json
    {
      "collectionGroup": "organizerFollowerPushes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "sendAt", "order": "ASCENDING" }
      ]
    },
```

Valide o JSON: `cd $WT && node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd $WT/functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/organizer-public-profiles.rules.test.mjs"`
Expected: PASS (8 testes).

Também rode `test/public-profiles-public-read.rules.test.mjs` e `test/tournament-reviews.rules.test.mjs` para garantir que nada vizinho quebrou.

- [ ] **Step 5: Commit**

```bash
cd $WT && pwd && git branch --show-current
cd $WT && git add firestore.rules firestore.indexes.json functions/test/organizer-public-profiles.rules.test.mjs
cd $WT && git commit -m "feat(rules): perfil público do organizador, seguidores e trava do push

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Exportar os gatilhos e script de backfill

**Files:**
- Modify: `functions/src/index.ts` (perto das linhas de `tournament-review-*`, ~413)
- Create: `functions/scripts/backfill-organizer-public-profiles.js`

**Interfaces:**
- Consumes: Tasks 1–3 compiladas em `functions/lib/`.

- [ ] **Step 1: Exportar**

Em `functions/src/index.ts`, depois do bloco de `tournament-review-*`:

```ts
// Perfil público do organizador: espelho, números, seguidores e push "abriu inscrições".
// Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
export {
  onUserWrittenSyncOrganizerPublicProfile,
  onOrganizerRecordWrittenSyncVerified,
  onTournamentWrittenOrganizerStats,
  onOrganizerFollowerWritten,
} from "./organizer-public-profile-sync";
export {
  onTournamentWrittenNotifyOrganizerFollowers,
  sendScheduledOrganizerFollowerPushes,
} from "./organizer-follower-push";
```

- [ ] **Step 2: Script de backfill**

`functions/scripts/backfill-organizer-public-profiles.js`:

```js
/* eslint-disable */
/**
 * Cria/atualiza organizerPublicProfiles/{uid} para todo usuário com papel de organizador:
 * identidade, selo, números (com atletas) e contagem de seguidores. Mesma lógica dos gatilhos
 * de functions/src/organizer-public-profile-sync.ts — eles só reagem a escritas NOVAS.
 *
 * Pré-requisitos: credenciais admin (gcloud auth application-default login) e lib/ compilada
 * (`npm run build` em functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-organizer-public-profiles.js --project volley-track-dev-4596c          # simula
 *   node scripts/backfill-organizer-public-profiles.js --project volley-track-dev-4596c --yes    # grava
 *   ... --only <uid>   # um organizador só
 */

const admin = require("firebase-admin");
const {
  buildOrganizerIdentity,
  completedListedTournamentIds,
  computeOrganizerStats,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
} = require("../lib/organizer-public-profile");
const {
  countOrganizerAthletes,
  recomputeOrganizerStats,
  syncOrganizerIdentity,
} = require("../lib/organizer-public-profile-sync");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const ONLY = argValue("--only");
const projectId = argValue("--project");
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

async function organizerDocs() {
  if (ONLY) {
    const snap = await db.collection("users").doc(ONLY).get();
    return snap.exists ? [snap] : [];
  }
  const snap = await db.collection("users").where("roles", "array-contains", "organizer").get();
  return snap.docs;
}

async function run() {
  const docs = await organizerDocs();
  console.log(`${docs.length} organizador(es) em ${projectId}. Modo: ${APPLY ? "GRAVAR" : "simulação"}`);
  for (const userDoc of docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const identity = buildOrganizerIdentity(data);
    const tournaments = await db.collection("tournaments").where("managerId", "==", uid).get();
    const rows = tournaments.docs.map((d) => ({id: d.id, data: d.data()}));
    const athletes = await countOrganizerAthletes(db, uid, completedListedTournamentIds(rows), projectId);
    const stats = computeOrganizerStats(rows, athletes);
    const followers = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid).collection("followers").count().get();
    const followersCount = followers.data().count;
    console.log(
      `${uid} | ${identity.name} | eventos ${stats.listedEvents} (realizados ${stats.eventsCompleted}, abertos ${stats.openEvents})` +
      ` | atletas ${stats.athletes} | seguidores ${followersCount}`,
    );
    if (!APPLY) continue;
    await syncOrganizerIdentity(db, uid, null, data);
    await recomputeOrganizerStats(db, uid, {recountAthletes: true, projectId});
    await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid).set({followersCount}, {merge: true});
  }
  console.log(APPLY ? "Concluído." : "Simulação concluída. Rode com --yes para gravar.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Verificar build, testes e regiões**

Run: `cd $WT/functions && npm run build && node --test lib/organizer-public-profile.test.js lib/organizer-public-profile-sync.test.js lib/organizer-follower-push.test.js lib/function-regions.test.js && node -e "require('./scripts/backfill-organizer-public-profiles.js')" 2>&1 | head -2`
Expected: testes PASS; o `require` do script falha só por falta de `--project` ("Informe o projeto"), provando que os `require` de `lib/` resolvem.

Depois rode a suíte inteira: `cd $WT/functions && npm test` — Expected: PASS (compare a contagem de falhas com a `main`: só pode ser igual ou menor).

- [ ] **Step 4: Commit**

```bash
cd $WT && pwd && git branch --show-current
cd $WT && git add functions/src/index.ts functions/scripts/backfill-organizer-public-profiles.js
cd $WT && git commit -m "feat(organizer-profile): exporta os gatilhos e script de backfill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
