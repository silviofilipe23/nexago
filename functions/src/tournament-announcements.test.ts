import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  postTournamentAnnouncementCore,
  resolveTournamentRegisteredAthleteUids,
} from "./tournament-announcements";
import {artifactsInscriptionsPath, artifactsTeamsPath} from "./firebase-paths";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const TOURNAMENT_ID = "t1";
const now = Date.UTC(2026, 6, 20, 10, 0, 0);

function seedTournament(fake: FakeFirestore, managerId: string): void {
  fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
    managerId,
    name: "Copa Areia",
  });
}

describe("postTournamentAnnouncementCore", () => {
  it("aceita o aviso do organizador dono do torneio e grava no feed com o type correto", async () => {
    const fake = new FakeFirestore();
    seedTournament(fake, "owner-1");

    const result = await postTournamentAnnouncementCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, message: "  Jogos de amanhã remarcados por chuva.  "},
      now,
    );

    assert.equal(result.feedId, `announcement_${TOURNAMENT_ID}_${now}`);
    assert.equal(result.message, "Jogos de amanhã remarcados por chuva.");

    const feedDoc = fake.store.get(`communityFeed/${result.feedId}`);
    assert.ok(feedDoc, "esperava doc gravado em communityFeed");
    assert.equal(feedDoc!.type, "organizer_announcement");
    assert.equal(feedDoc!.tournamentId, TOURNAMENT_ID);
    assert.equal(feedDoc!.message, "Jogos de amanhã remarcados por chuva.");
    assert.ok("createdAt" in feedDoc!, "esperava createdAt (server timestamp sentinel)");
  });

  it("rejeita quando tournamentId ou message estão vazios", async () => {
    const fake = new FakeFirestore();
    seedTournament(fake, "owner-1");

    await assert.rejects(
      postTournamentAnnouncementCore(db(fake), "owner-1", {tournamentId: "", message: "oi"}, now),
      (err: {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );

    await assert.rejects(
      postTournamentAnnouncementCore(
        db(fake),
        "owner-1",
        {tournamentId: TOURNAMENT_ID, message: "   "},
        now,
      ),
      (err: {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );

    assert.equal(fake.store.has(`communityFeed/announcement_${TOURNAMENT_ID}_${now}`), false);
  });

  it("rejeita mensagem acima do limite de caracteres", async () => {
    const fake = new FakeFirestore();
    seedTournament(fake, "owner-1");

    await assert.rejects(
      postTournamentAnnouncementCore(
        db(fake),
        "owner-1",
        {tournamentId: TOURNAMENT_ID, message: "a".repeat(501)},
        now,
      ),
      (err: {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("rejeita quem não é responsável pelo torneio (nem dono) e não grava nada no feed", async () => {
    const fake = new FakeFirestore();
    seedTournament(fake, "owner-1");

    // Fora do caminho "dono" (managerId === uid), `assertCanManageTournament`
    // consulta claims via `getAuth()` — sem um app Firebase Admin
    // inicializado neste processo de teste (nenhum arquivo de teste chama
    // `initializeApp`, só o `index.ts`, que não é importado aqui), a chamada
    // rejeita antes de qualquer escrita. Isso já é suficiente pra confirmar
    // que um uid não vinculado ao torneio não consegue publicar o aviso; o
    // guard em si (owner/staff/admin) já tem cobertura própria em
    // `tournament-acl.test.ts`.
    await assert.rejects(
      postTournamentAnnouncementCore(
        db(fake),
        "intruso",
        {tournamentId: TOURNAMENT_ID, message: "Tentando publicar sem permissão"},
        now,
      ),
    );

    assert.equal(fake.store.has(`communityFeed/announcement_${TOURNAMENT_ID}_${now}`), false);
  });

  it("rejeita quando o torneio não existe", async () => {
    const fake = new FakeFirestore();

    await assert.rejects(
      postTournamentAnnouncementCore(
        db(fake),
        "owner-1",
        {tournamentId: "inexistente", message: "oi"},
        now,
      ),
      (err: {code?: string}) => {
        assert.equal(err.code, "not-found");
        return true;
      },
    );
  });
});

describe("resolveTournamentRegisteredAthleteUids", () => {
  it("junta atletas de todas as categorias do torneio, sem duplicar", async () => {
    const fake = new FakeFirestore();
    const projectId = "test-project";
    const teamsPath = artifactsTeamsPath(projectId);
    const inscriptionsPath = artifactsInscriptionsPath(projectId);

    fake.seedDoc(`${teamsPath}/team-a`, {player1Id: "u1", player2Id: "u2"});
    fake.seedDoc(`${teamsPath}/team-b`, {player1Id: "u2", player2Id: "u3"});
    fake.seedDoc(`${inscriptionsPath}/insc-a`, {
      tournamentId: TOURNAMENT_ID,
      categoryId: "cat-1",
      teamId: "team-a",
    });
    fake.seedDoc(`${inscriptionsPath}/insc-b`, {
      tournamentId: TOURNAMENT_ID,
      categoryId: "cat-2",
      teamId: "team-b",
    });
    // Inscrição de outro torneio — não deve entrar.
    fake.seedDoc(`${inscriptionsPath}/insc-c`, {
      tournamentId: "outro-torneio",
      categoryId: "cat-1",
      teamId: "team-a",
    });

    const uids = await resolveTournamentRegisteredAthleteUids(
      db(fake),
      TOURNAMENT_ID,
      projectId,
    );

    assert.deepEqual([...uids].sort(), ["u1", "u2", "u3"]);
  });

  it("retorna vazio quando não há inscrições", async () => {
    const fake = new FakeFirestore();
    const uids = await resolveTournamentRegisteredAthleteUids(db(fake), "sem-inscritos", "test-project");
    assert.deepEqual(uids, []);
  });
});
