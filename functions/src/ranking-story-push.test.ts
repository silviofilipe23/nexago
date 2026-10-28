import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {DeliverNotificationInput} from "./notification-delivery";
import {
  rankingStoryNotification,
  rankingStoryRecipients,
  recentRankingStages,
  runRankingStoryPushSweep,
} from "./ranking-story-push";
import {DAY_MS} from "./tournament-review-constants";

const PROJECT = "test-project";
const STAGES = `artifacts/${PROJECT}/public/data/rankingStages`;
const ATHLETES = `artifacts/${PROJECT}/public/data/athleteRankingsBySport`;
const NOW = Date.UTC(2026, 9, 26, 15, 0, 0); // segunda 26/10/2026, 12:00 em São Paulo
const ts = (ms: number) => Timestamp.fromMillis(ms);

function setup(enabled = true) {
  const fake = new FakeFirestore();
  if (enabled) fake.seedDoc("appConfig/rankingStoryPush", {enabled: true});
  const sent: DeliverNotificationInput[] = [];
  const notify = async (input: DeliverNotificationInput) => {
    sent.push(input);
  };
  const run = (nowMs = NOW) => runRankingStoryPushSweep(fake as unknown as Firestore, nowMs, notify, PROJECT);
  return {fake, sent, run};
}

/** Torneio de vôlei que terminou ontem (domingo) e pontuou: a, b e c têm resultado nele; d só
 *  de um torneio antigo. */
function seedFinishedTournament(fake: FakeFirestore, id = "t1", extra: Record<string, unknown> = {}) {
  fake.seedDoc(`tournaments/${id}`, {
    name: "Copa Areia",
    listingStatus: "open",
    endAt: ts(Date.UTC(2026, 9, 25, 3, 0, 0)), // domingo 25/10 (00:00 em SP)
    ...extra,
  });
  fake.seedDoc(`${STAGES}/VOLEI_PRAIA`, {
    sport: "VOLEI_PRAIA",
    stages: {
      [id]: {year: 2026, at: ts(Date.UTC(2026, 9, 25, 21, 0, 0))},
      antigo: {year: 2026, at: ts(Date.UTC(2026, 8, 20, 21, 0, 0))},
    },
  });
  const result = (tournamentId: string, points = 100) => ({
    tournamentId, categoryId: "c1", finalPlace: 1, points, year: 2026, sport: "VOLEI_PRAIA",
  });
  fake.seedDoc(`${ATHLETES}/a_VOLEI_PRAIA`, {
    athleteId: "a", sport: "VOLEI_PRAIA", results: [result("antigo"), result(id)],
  });
  fake.seedDoc(`${ATHLETES}/b_VOLEI_PRAIA`, {athleteId: "b", sport: "VOLEI_PRAIA", results: [result(id)]});
  // Duas categorias do mesmo torneio: um push só.
  fake.seedDoc(`${ATHLETES}/c_VOLEI_PRAIA`, {
    athleteId: "c", sport: "VOLEI_PRAIA", results: [result(id), {...result(id), categoryId: "c2"}],
  });
  fake.seedDoc(`${ATHLETES}/d_VOLEI_PRAIA`, {athleteId: "d", sport: "VOLEI_PRAIA", results: [result("antigo")]});
  // Outro esporte, mesmo atleta: não recebe pelo torneio de vôlei.
  fake.seedDoc(`${ATHLETES}/e_FUTEVOLEI`, {athleteId: "e", sport: "FUTEVOLEI", results: [result(id)]});
}

const userIds = (sent: DeliverNotificationInput[]) => sent.map((n) => n.userId).sort();

describe("runRankingStoryPushSweep", () => {
  it("flag desligada: não faz nada", async () => {
    const {fake, sent, run} = setup(false);
    seedFinishedTournament(fake);
    assert.deepEqual(await run(), {tournaments: 0, notified: 0});
    assert.equal(sent.length, 0);
    assert.equal(fake.store.has("rankingStoryPushes/t1"), false);
  });

  it("dia seguinte ao torneio: um push por atleta que pontuou, com o story do esporte", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    assert.deepEqual(await run(), {tournaments: 1, notified: 3});
    assert.deepEqual(userIds(sent), ["a", "b", "c"]);
    const push = sent.find((n) => n.userId === "a")!;
    assert.equal(push.type, "ranking_story_share");
    assert.equal(push.title, "Seus pontos do torneio Copa Areia entraram no ranking");
    assert.equal(push.body, "Toque para ver sua posição no ranking de vôlei de praia e postar no story.");
    assert.equal(push.data.url, "/competir/ranking?story=1&esporte=VOLEI_PRAIA&ano=2026");
    assert.equal(push.data.tournamentId, "t1");
    const marker = fake.store.get("rankingStoryPushes/t1")!;
    assert.equal(marker.recipients, 3);
    assert.equal(marker.sport, "VOLEI_PRAIA");
  });

  it("não repete: a execução de amanhã acha a marca", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    await run();
    sent.length = 0;
    assert.deepEqual(await run(NOW + DAY_MS), {tournaments: 0, notified: 0});
    assert.equal(sent.length, 0);
  });

  it("torneio ainda em andamento (último dia é hoje) espera", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake, "t1", {endAt: ts(Date.UTC(2026, 9, 26, 3, 0, 0))});
    assert.deepEqual(await run(), {tournaments: 0, notified: 0});
    assert.equal(sent.length, 0);
    assert.equal(fake.store.has("rankingStoryPushes/t1"), false);
  });

  it("torneio cancelado não avisa", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake, "t1", {listingStatus: "cancelled"});
    await run();
    assert.equal(sent.length, 0);
  });

  it("dois torneios no mesmo fim de semana: um push só, com a contagem", async () => {
    const {fake, sent, run} = setup();
    seedFinishedTournament(fake);
    fake.seedDoc("tournaments/t2", {name: "Open Sol", endAt: ts(Date.UTC(2026, 9, 24, 3, 0, 0))});
    const stages = fake.store.get(`${STAGES}/VOLEI_PRAIA`)!;
    fake.seedDoc(`${STAGES}/VOLEI_PRAIA`, {
      ...stages,
      stages: {
        ...(stages.stages as Record<string, unknown>),
        t2: {year: 2026, at: ts(Date.UTC(2026, 9, 24, 20, 0, 0))},
      },
    });
    const a = fake.store.get(`${ATHLETES}/a_VOLEI_PRAIA`)!;
    fake.seedDoc(`${ATHLETES}/a_VOLEI_PRAIA`, {
      ...a,
      results: [...(a.results as unknown[]), {tournamentId: "t2", categoryId: "c1", points: 50, year: 2026}],
    });
    assert.deepEqual(await run(), {tournaments: 2, notified: 3});
    assert.equal(sent.filter((n) => n.userId === "a").length, 1);
    assert.equal(
      sent.find((n) => n.userId === "a")!.title,
      "Seus pontos de 2 torneios entraram no ranking",
    );
    assert.equal(fake.store.get("rankingStoryPushes/t2")!.recipients, 1);
  });

  it("um push que falha não segura os outros nem a marca", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("appConfig/rankingStoryPush", {enabled: true});
    seedFinishedTournament(fake);
    const sent: string[] = [];
    const notify = async (input: DeliverNotificationInput) => {
      if (input.userId === "a") throw new Error("token morto");
      sent.push(input.userId);
    };
    await runRankingStoryPushSweep(fake as unknown as Firestore, NOW, notify, PROJECT);
    assert.deepEqual(sent.sort(), ["b", "c"]);
    assert.ok(fake.store.get("rankingStoryPushes/t1")!.sentAt);
  });
});

describe("peças do push do story", () => {
  it("etapas recentes: só as da janela, com o esporte do doc", () => {
    const stages = recentRankingStages([
      {
        id: "VOLEI_PRAIA",
        data: {
          stages: {
            novo: {year: 2026, at: ts(NOW - DAY_MS)},
            velho: {year: 2026, at: ts(NOW - 6 * DAY_MS)},
            futuro: {year: 2026, at: ts(NOW + DAY_MS)},
            semHora: {year: 2026},
          },
        },
      },
    ], NOW);
    assert.deepEqual(stages, [{sportCode: "VOLEI_PRAIA", tournamentId: "novo", year: 2026}]);
  });

  it("destinatários: pontos positivos do torneio pedido", () => {
    const recipients = rankingStoryRecipients([
      {athleteId: "a", results: [{tournamentId: "t1", points: 10}, {tournamentId: "t2", points: 5}]},
      {athleteId: "b", results: [{tournamentId: "t1", points: 0}]},
      {athleteId: "", results: [{tournamentId: "t1", points: 10}]},
      {athleteId: "c", results: "quebrado"},
    ], new Set(["t1", "t2"]));
    assert.deepEqual([...recipients], [["a", ["t1", "t2"]]]);
  });

  it("nome que já começa com Torneio vai como está; esporte fora do catálogo", () => {
    const push = rankingStoryNotification({
      uid: "a",
      sportCode: "FUTEVOLEI",
      year: 2026,
      tournaments: [{id: "t1", name: "Torneio de Verão"}],
    });
    assert.equal(push.title, "Seus pontos do Torneio de Verão entraram no ranking");
    assert.equal(push.body, "Toque para ver sua posição no ranking de futevôlei e postar no story.");
    assert.equal(push.data.year, "2026");
  });
});
