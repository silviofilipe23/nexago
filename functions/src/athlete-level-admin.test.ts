import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {
  assertAdminOrPromotingOrganizer,
  effectiveCurrentLevelForSport,
  levelHistoryAuditFields,
  levelProfileWriteFields,
  planLevelChange,
  planLevelChangeAuthorization,
  planOrganizerPromotionDirection,
} from "./athlete-level-admin";
import {parseLadderConfig} from "./rating-config";
import type {AthleteRatingState} from "./rating-ladder";

const NOW = new Date("2026-08-11T12:00:00Z");
const DAY_MS = 86_400_000;

const CONFIG = parseLadderConfig("VOLEI_PRAIA", {});

/** Atleta consolidado em intermediario_1 (rating 1600, banda 1500–1720). */
function rating(overrides: Partial<AthleteRatingState> = {}): AthleteRatingState {
  return {
    athleteId: "a1",
    sportCode: "VOLEI_PRAIA",
    rating: 1600,
    rd: 90,
    volatility: 0.06,
    ratedMatches: 12,
    wins: 7,
    losses: 5,
    lastMatchAt: NOW,
    levelCode: "intermediario_1",
    levelRank: 2,
    zone: "stable",
    ladderState: "stable",
    observationStartedAt: null,
    observationMatches: 0,
    notifiedAt: null,
    protectedUntil: null,
    seededFromLevel: "intermediario_1",
    ...overrides,
  };
}

function plan(targetCode: string, overrides: Partial<Parameters<typeof planLevelChange>[0]> = {}) {
  return planLevelChange({
    currentLevel: "intermediario_1",
    targetCode,
    config: CONFIG,
    currentRating: rating(),
    now: NOW,
    ...overrides,
  });
}

describe("planLevelChange — direção", () => {
  it("classifica descida, subida e no-op", () => {
    assert.equal(plan("iniciante_2").direction, "down");
    assert.equal(plan("open").direction, "up");
    assert.equal(plan("intermediario_1").direction, "same");
  });

  it("perfil sem nível no esporte é seed", () => {
    const result = plan("iniciante_1", {currentLevel: null});
    assert.equal(result.direction, "seed");
    assert.equal(result.fromLevel, null);
  });

  it("nível legado é comparado pelo rank, não pela string", () => {
    // `intermediario` (escada de 3) tem o mesmo rank de `intermediario_1`.
    const result = plan("intermediario_1", {currentLevel: "intermediario"});
    assert.equal(result.direction, "same");
    assert.equal(result.fromLevel, "intermediario");
  });
});

describe("planLevelChange — realinhamento do rating", () => {
  it("descendo, puxa o rating para o teto do nível novo e some com a proteção", () => {
    const {ratingNext} = plan("iniciante_2");
    assert.ok(ratingNext);
    // 1600 > initialRating de iniciante_2 (1450) → desce para 1450.
    assert.equal(ratingNext.rating, 1450);
    assert.equal(ratingNext.levelCode, "iniciante_2");
    assert.equal(ratingNext.levelRank, 1);
    assert.equal(ratingNext.rd, CONFIG.glicko.initialRd);
    assert.equal(ratingNext.protectedUntil, null);
    assert.equal(ratingNext.ladderState, "stable");
  });

  it("descendo, não sobe o rating de quem já está abaixo do inicial", () => {
    const {ratingNext} = plan("iniciante_2", {currentRating: rating({rating: 1300})});
    assert.equal(ratingNext?.rating, 1300);
    // 1300 <= demoteAt (1350) do iniciante_2 → já entra na zona de rebaixamento.
    assert.equal(ratingNext?.zone, "relegation");
  });

  it("subindo, garante o piso do nível novo e protege contra rebaixamento", () => {
    const {ratingNext} = plan("open");
    assert.equal(ratingNext?.rating, 2200);
    assert.deepEqual(
      ratingNext?.protectedUntil,
      new Date(NOW.getTime() + CONFIG.ladder.promotionProtectionDays * DAY_MS),
    );
  });

  it("preserva partidas, vitórias, derrotas e volatilidade", () => {
    const {ratingNext} = plan("iniciante_1");
    assert.equal(ratingNext?.ratedMatches, 12);
    assert.equal(ratingNext?.wins, 7);
    assert.equal(ratingNext?.losses, 5);
    assert.equal(ratingNext?.volatility, 0.06);
  });

  it("limpa a janela de observação de quem estava em risco", () => {
    const {ratingNext} = plan("iniciante_2", {
      currentRating: rating({
        ladderState: "relegation_observation",
        observationStartedAt: NOW,
        observationMatches: 3,
        notifiedAt: NOW,
      }),
    });
    assert.equal(ratingNext?.ladderState, "stable");
    assert.equal(ratingNext?.observationStartedAt, null);
    assert.equal(ratingNext?.observationMatches, 0);
    assert.equal(ratingNext?.notifiedAt, null);
  });
});

describe("planLevelChange — quando NÃO realinha", () => {
  it("esporte fora da escada não tem rating a realinhar", () => {
    const result = plan("iniciante_2", {config: null, currentRating: null});
    assert.equal(result.direction, "down");
    assert.equal(result.ratingNext, null);
  });

  it("sem doc de rating não semeia (a engine semeia na 1ª partida rateada)", () => {
    assert.equal(plan("iniciante_2", {currentRating: null}).ratingNext, null);
  });

  it("doc já no nível alvo é deixado em paz", () => {
    // Reescrever zeraria RD, observação e proteção sem motivo.
    const result = plan("iniciante_2", {
      currentRating: rating({levelCode: "iniciante_2", levelRank: 1}),
    });
    assert.equal(result.ratingNext, null);
  });
});

/**
 * Base "tudo certo" para a FASE 1 (fatos já resolvidos) do caminho do
 * organizador: dono do torneio, torneio do MESMO esporte do request, atleta
 * inscrito. Direção não entra aqui — foi extraída pra `planOrganizerPromotionDirection`.
 */
function authParams(
  overrides: Partial<Parameters<typeof planLevelChangeAuthorization>[0]> = {},
) {
  return {
    isAdmin: false,
    tournamentId: "t1",
    tournamentManagerId: "org-1",
    callerUid: "org-1",
    tournamentSportCode: "VOLEI_PRAIA",
    requestSportCode: "VOLEI_PRAIA",
    athleteHasActiveRegistration: true,
    ...overrides,
  };
}

describe("planLevelChangeAuthorization", () => {
  it("admin sempre autorizado — mesmo sem tournamentId e mesmo esporte divergente", () => {
    const result = planLevelChangeAuthorization(
      authParams({
        isAdmin: true,
        tournamentId: "",
        tournamentManagerId: null,
        tournamentSportCode: "BEACH_TENNIS",
        requestSportCode: "VOLEI_PRAIA",
        athleteHasActiveRegistration: false,
      }),
    );
    assert.deepEqual(result, {mode: "admin"});
  });

  it("organizador promovendo atleta inscrito no próprio torneio, mesmo esporte: autorizado", () => {
    const result = planLevelChangeAuthorization(authParams());
    assert.deepEqual(result, {mode: "organizer"});
  });

  it("sem tournamentId e sem admin: permission-denied", () => {
    const result = planLevelChangeAuthorization(authParams({tournamentId: ""}));
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match(
      (result as {message: string}).message,
      /Apenas administradores/,
    );
  });

  it("caller não é dono do torneio: permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({tournamentManagerId: "outro-uid"}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match(
      (result as {message: string}).message,
      /não é o organizador responsável/,
    );
  });

  it("torneio sem dono identificável (managerId ausente): permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({tournamentManagerId: null}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
  });

  // C1 (fix pós-review): sem checar esporte, um organizador dono de um
  // torneio de BEACH TENNIS conseguia promover um atleta em VOLEI_QUADRA só
  // por ele estar inscrito nesse torneio — furo de anti-sandbagging real.
  it("esporte do torneio diverge do esporte do request: permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({tournamentSportCode: "BEACH_TENNIS", requestSportCode: "VOLEI_QUADRA"}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match((result as {message: string}).message, /esporte/i);
  });

  it("torneio de esporte sem equivalente no perfil (tournamentSportCode null): permission-denied", () => {
    const result = planLevelChangeAuthorization(authParams({tournamentSportCode: null}));
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match((result as {message: string}).message, /esporte/i);
  });

  it("atleta sem inscrição ativa no torneio (mesmo esporte, dono certo): permission-denied", () => {
    const result = planLevelChangeAuthorization(
      authParams({athleteHasActiveRegistration: false}),
    );
    assert.equal(result.mode, "denied");
    assert.equal((result as {code: string}).code, "permission-denied");
    assert.match(
      (result as {message: string}).message,
      /não tem inscrição ativa/,
    );
  });

  it("esporte errado é checado ANTES da inscrição (mensagem certa por prioridade)", () => {
    // Nem esporte bate nem tem inscrição — o motivo relatado é o de esporte,
    // mais fundamental na cascata.
    const result = planLevelChangeAuthorization(
      authParams({
        tournamentSportCode: "BEACH_TENNIS",
        requestSportCode: "VOLEI_QUADRA",
        athleteHasActiveRegistration: false,
      }),
    );
    assert.equal(result.mode, "denied");
    assert.match((result as {message: string}).message, /esporte/i);
  });
});

describe("planOrganizerPromotionDirection", () => {
  it("subindo: autorizado", () => {
    assert.deepEqual(
      planOrganizerPromotionDirection({currentLevel: "iniciante_1", targetLevel: "intermediario_1"}),
      {ok: true},
    );
  });

  it("sem nível atual (seed): autorizado — não há degrau anterior pra violar", () => {
    assert.deepEqual(
      planOrganizerPromotionDirection({currentLevel: null, targetLevel: "iniciante_1"}),
      {ok: true},
    );
  });

  it("tenta manter o mesmo nível: negado com a mensagem exata", () => {
    const result = planOrganizerPromotionDirection({
      currentLevel: "intermediario_1",
      targetLevel: "intermediario_1",
    });
    assert.deepEqual(result, {
      ok: false,
      message: "Organizador só pode promover — o nível de um atleta nunca desce.",
    });
  });

  it("tenta rebaixar: negado com a mesma mensagem exata", () => {
    const result = planOrganizerPromotionDirection({
      currentLevel: "avancado_1",
      targetLevel: "iniciante_2",
    });
    assert.deepEqual(result, {
      ok: false,
      message: "Organizador só pode promover — o nível de um atleta nunca desce.",
    });
  });
});

// F5 (review): a checagem de direção do organizador precisa resolver o nível atual do MESMO
// jeito que o resto do backend (`resolveAthleteLevelRank`, category-level-eligibility.ts) —
// per-sport primeiro, legado global depois. Sem o fallback, um atleta só com `level` legado
// tinha `currentLevel` null pra `planOrganizerPromotionDirection`, virava "seed" e o
// organizador conseguia setar um alvo ABAIXO do rank que a elegibilidade de categoria já
// considerava dele.
describe("effectiveCurrentLevelForSport", () => {
  it("per-sport presente: usa o valor per-sport, ignora o legado", () => {
    const data = {
      level: "Iniciante 1",
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "avancado_1"}},
    };
    assert.equal(effectiveCurrentLevelForSport(data, "VOLEI_PRAIA"), "avancado_1");
  });

  it("atleta legado-only: sem per-sport, cai pro `level` global", () => {
    const data = {level: "Avançado 1", sportOnboarding: {levelsBySport: {}}};
    assert.equal(effectiveCurrentLevelForSport(data, "VOLEI_PRAIA"), "Avançado 1");
  });

  it("nem per-sport nem legado: null (seed genuíno, sem degrau anterior)", () => {
    assert.equal(effectiveCurrentLevelForSport({sportOnboarding: {levelsBySport: {}}}, "VOLEI_PRAIA"), null);
    assert.equal(effectiveCurrentLevelForSport(undefined, "VOLEI_PRAIA"), null);
  });

  it("legado em branco/whitespace conta como ausente", () => {
    assert.equal(effectiveCurrentLevelForSport({level: "   "}, "VOLEI_PRAIA"), null);
  });

  it("atleta legado-only tentando entrar ABAIXO do próprio rank: organizador é barrado", () => {
    // Reprodução do achado: sem o fallback, `currentLevel` seria null (seed) e um alvo
    // Iniciante 1 (abaixo do Avançado 1 legado) seria aceito — não pode.
    const data = {level: "Avançado 1", sportOnboarding: {levelsBySport: {}}};
    const result = planOrganizerPromotionDirection({
      currentLevel: effectiveCurrentLevelForSport(data, "VOLEI_PRAIA"),
      targetLevel: "iniciante_1",
    });
    assert.deepEqual(result, {
      ok: false,
      message: "Organizador só pode promover — o nível de um atleta nunca desce.",
    });
  });
});

// F1 (review): a promoção do organizador precisa fechar a janela de calibração NO MESMO write
// do nível — senão o atleta, ainda destravado até o trigger assíncrono rodar, podia se
// autocorrigir pra baixo e desfazer a promoção que o organizador acabou de confirmar.
describe("levelProfileWriteFields", () => {
  it("organizador: grava levelsBySport, levelLocked E levelChangeBy: 'organizer' no mesmo objeto (fecha a janela)", () => {
    assert.deepEqual(
      levelProfileWriteFields({mode: "organizer", sportCode: "VOLEI_PRAIA", level: "intermediario_1"}),
      {
        levelsBySport: {VOLEI_PRAIA: "intermediario_1"},
        levelLocked: {VOLEI_PRAIA: true},
        levelChangeBy: "organizer",
      },
    );
  });

  // F4 (review): sem `levelChangeBy`, `onUserWrittenTrackLevelChanges` não tinha como distinguir
  // um rebaixamento manual do admin (sem `athleteRatings` prévio) de um self-correction genuíno
  // do atleta — o marcador é o sinal, presente nos dois caminhos privilegiados.
  it("admin: levelsBySport E levelChangeBy: 'admin' — sem levelLocked (só o organizador fecha a janela)", () => {
    assert.deepEqual(
      levelProfileWriteFields({mode: "admin", sportCode: "VOLEI_PRAIA", level: "intermediario_1"}),
      {
        levelsBySport: {VOLEI_PRAIA: "intermediario_1"},
        levelChangeBy: "admin",
      },
    );
  });
});

/**
 * Mock de Firestore mínimo pra `assertAdminOrPromotingOrganizer`, no mesmo
 * espírito do `mockDb` de `tournament-level-lock.test.ts`. Registra CADA
 * caminho lido em `reads` — é a prova de que a fase 1 nunca toca `users/*`
 * (I1 do review: antes, `setAthleteLevel` lia `users/{uid}` ANTES de
 * autorizar, e um caller sem privilégio nenhum conseguia usar
 * `failed-precondition` vs. `permission-denied` como oráculo de quais uids
 * existem).
 */
function mockOrganizerAuthDb(seed: {
  tournaments?: Record<string, Record<string, unknown> | null>;
  inscriptionsExist?: boolean;
} = {}) {
  const tournaments = {...(seed.tournaments ?? {})};
  const inscriptionsExist = seed.inscriptionsExist ?? false;
  const reads: string[] = [];

  return {
    reads,
    doc: (path: string) => ({
      get: async () => {
        reads.push(path);
        if (path.startsWith("tournaments/")) {
          const data = tournaments[path.slice("tournaments/".length)] ?? null;
          return {exists: data != null, data: () => data};
        }
        // Nenhum teste deveria bater aqui (isso é `users/{uid}` ou outro doc
        // que a fase 1 não tem motivo pra ler) — devolve "inexistente" em vez
        // de travar; `reads` acima já denuncia a violação.
        return {exists: false, data: () => undefined};
      },
    }),
    collection: (path: string) => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => {
              reads.push(`query:${path}`);
              return {empty: !inscriptionsExist};
            },
          }),
        }),
      }),
    }),
  };
}

describe("assertAdminOrPromotingOrganizer — fase 1", () => {
  const fakeOrganizerCaller = async () => ({isAdmin: false, actorLabel: "org-1"});

  it("admin: autorizado sem tocar o Firestore nenhuma vez", async () => {
    const db = mockOrganizerAuthDb();
    const result = await assertAdminOrPromotingOrganizer({
      db: db as never,
      callerUid: "admin-1",
      tournamentId: "",
      athleteUid: "atleta-1",
      sportCode: "VOLEI_PRAIA",
      resolveCallerPrivilege: async () => ({isAdmin: true, actorLabel: "admin@nexago.com"}),
    });
    assert.deepEqual(result, {mode: "admin", actorLabel: "admin@nexago.com"});
    assert.deepEqual(db.reads, []);
  });

  it("sem tournamentId e não-admin: permission-denied, zero leituras no Firestore", async () => {
    const db = mockOrganizerAuthDb();
    await assert.rejects(
      () =>
        assertAdminOrPromotingOrganizer({
          db: db as never,
          callerUid: "org-1",
          tournamentId: "",
          athleteUid: "atleta-1",
          sportCode: "VOLEI_PRAIA",
          resolveCallerPrivilege: fakeOrganizerCaller,
        }),
      (err: unknown) => err instanceof HttpsError && err.code === "permission-denied",
    );
    assert.deepEqual(db.reads, []);
  });

  it("caller não é dono: permission-denied, leu só o torneio — nunca users/{uid}", async () => {
    const db = mockOrganizerAuthDb({
      tournaments: {t1: {managerId: "outro-uid", sport: "beachVolleyball"}},
    });
    await assert.rejects(
      () =>
        assertAdminOrPromotingOrganizer({
          db: db as never,
          callerUid: "org-1",
          tournamentId: "t1",
          athleteUid: "atleta-1",
          sportCode: "VOLEI_PRAIA",
          resolveCallerPrivilege: fakeOrganizerCaller,
        }),
      (err: unknown) => err instanceof HttpsError && err.code === "permission-denied",
    );
    assert.deepEqual(db.reads, ["tournaments/t1"]);
  });

  // C1: esporte do torneio precisa bater com o do request — sem essa
  // checagem, o dono de um torneio de BEACH TENNIS promoveria em VOLEI_PRAIA.
  it("esporte do torneio diverge do request: permission-denied, nem consulta inscrições", async () => {
    const db = mockOrganizerAuthDb({
      tournaments: {t1: {managerId: "org-1", sport: "beachTennis"}},
      inscriptionsExist: true, // mesmo que estivesse inscrito, não importa
    });
    await assert.rejects(
      () =>
        assertAdminOrPromotingOrganizer({
          db: db as never,
          callerUid: "org-1",
          tournamentId: "t1",
          athleteUid: "atleta-1",
          sportCode: "VOLEI_PRAIA",
          resolveCallerPrivilege: fakeOrganizerCaller,
        }),
      (err: unknown) =>
        err instanceof HttpsError && err.code === "permission-denied" && /esporte/i.test(err.message),
    );
    // Não chegou a rodar a query de inscrições — só o doc do torneio.
    assert.deepEqual(db.reads, ["tournaments/t1"]);
  });

  it("torneio de esporte sem equivalente no perfil: permission-denied", async () => {
    const db = mockOrganizerAuthDb({
      tournaments: {t1: {managerId: "org-1", sport: "futebol"}},
    });
    await assert.rejects(() =>
      assertAdminOrPromotingOrganizer({
        db: db as never,
        callerUid: "org-1",
        tournamentId: "t1",
        athleteUid: "atleta-1",
        sportCode: "VOLEI_PRAIA",
        resolveCallerPrivilege: fakeOrganizerCaller,
      }),
    );
  });

  it("dono + esporte batendo + inscrito: autoriza organizador, nunca leu users/{uid}", async () => {
    const db = mockOrganizerAuthDb({
      tournaments: {t1: {managerId: "org-1", sport: "beachVolleyball"}},
      inscriptionsExist: true,
    });
    const result = await assertAdminOrPromotingOrganizer({
      db: db as never,
      callerUid: "org-1",
      tournamentId: "t1",
      athleteUid: "atleta-1",
      sportCode: "VOLEI_PRAIA",
      resolveCallerPrivilege: fakeOrganizerCaller,
    });
    assert.deepEqual(result, {mode: "organizer", actorLabel: "org-1"});
    assert.ok(
      db.reads.every((path) => !path.startsWith("users/")),
      `fase 1 não deveria ler users/*, mas leu: ${db.reads.join(", ")}`,
    );
  });

  it("dono + esporte batendo + SEM inscrição: permission-denied, ainda sem tocar users/{uid}", async () => {
    const db = mockOrganizerAuthDb({
      tournaments: {t1: {managerId: "org-1", sport: "beachVolleyball"}},
      inscriptionsExist: false,
    });
    await assert.rejects(
      () =>
        assertAdminOrPromotingOrganizer({
          db: db as never,
          callerUid: "org-1",
          tournamentId: "t1",
          athleteUid: "atleta-1",
          sportCode: "VOLEI_PRAIA",
          resolveCallerPrivilege: fakeOrganizerCaller,
        }),
      (err: unknown) =>
        err instanceof HttpsError &&
        err.code === "permission-denied" &&
        /não tem inscrição ativa/.test(err.message),
    );
    assert.ok(db.reads.every((path) => !path.startsWith("users/")));
  });
});

describe("levelHistoryAuditFields", () => {
  it("admin: reason admin_manual, note = motivo digitado, actor backoffice:{uid}, sem tournamentId", () => {
    const fields = levelHistoryAuditFields({
      mode: "admin",
      callerUid: "admin-1",
      note: "Nível declarado não condizia com o nível real observado em quadra.",
      tournamentId: "",
    });
    assert.deepEqual(fields, {
      reason: "admin_manual",
      note: "Nível declarado não condizia com o nível real observado em quadra.",
      actor: "backoffice:admin-1",
    });
  });

  it("organizador: reason organizer_promotion, actor organizer:{uid}, tournamentId presente", () => {
    const fields = levelHistoryAuditFields({
      mode: "organizer",
      callerUid: "org-1",
      note: "",
      tournamentId: "t1",
    });
    assert.deepEqual(fields, {
      reason: "organizer_promotion",
      note: null,
      actor: "organizer:org-1",
      tournamentId: "t1",
    });
  });
});
