import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  STORY_SHARE_MAX_PAGES,
  cleanupExpiredStoryShares,
  createStoryShareCore,
  storySharePagePath,
  type StoryShareBucket,
} from "./organizer-stories-share";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

/** Bucket em memória: caminho -> data de criação. */
class FakeBucket implements StoryShareBucket {
  files = new Map<string, number>();

  put(path: string, createdAtMs: number): void {
    this.files.set(path, createdAtMs);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async list(prefix: string) {
    return [...this.files.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, createdAtMs]) => ({path, createdAtMs}));
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}

const OWNER = "owner-1";
const TOURNAMENT_ID = "t1";
const SHARE_ID = "share_abc12345";
const now = Date.UTC(2026, 9, 28, 15, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function setup(pages = 2) {
  const fake = new FakeFirestore();
  fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {managerId: OWNER, name: "Copa Verão"});
  const bucket = new FakeBucket();
  for (let p = 1; p <= pages; p++) {
    bucket.put(storySharePagePath(OWNER, TOURNAMENT_ID, SHARE_ID, p), now);
  }
  return {fake, bucket};
}

const input = {
  tournamentId: TOURNAMENT_ID,
  shareId: SHARE_ID,
  pageCount: 2,
  categoryName: "Feminino Open",
  unitLabel: "duplas",
  link: "https://organizador.nexago.app/t/copa-verao",
};

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code);
    return true;
  });
}

describe("createStoryShareCore", () => {
  it("grava o envio com as páginas em ordem e monta o push do app", async () => {
    const {fake, bucket} = setup();

    const share = await createStoryShareCore(db(fake), bucket, OWNER, input, now);

    const doc = fake.store.get(`users/${OWNER}/storyShares/${SHARE_ID}`);
    assert.ok(doc, "esperava o doc do envio");
    assert.deepEqual(doc!.pagePaths, [
      `storyShares/${OWNER}/${TOURNAMENT_ID}/${SHARE_ID}/1.png`,
      `storyShares/${OWNER}/${TOURNAMENT_ID}/${SHARE_ID}/2.png`,
    ]);
    assert.equal(doc!.tournamentName, "Copa Verão");
    assert.equal(doc!.categoryName, "Feminino Open");
    assert.equal(doc!.unitLabel, "duplas");
    assert.equal(doc!.pageCount, 2);
    assert.equal(doc!.link, input.link);
    assert.equal((doc!.expiresAt as Timestamp).toMillis(), now + 7 * DAY);

    assert.equal(share.title, "Stories prontos para postar");
    assert.equal(share.body, "Feminino Open · Copa Verão: 2 stories. Toque para abrir no Instagram.");
    // `url` existe nos builds antigos do app; o tipo + shareId abrem a tela nova.
    assert.deepEqual(share.data, {
      tournamentId: TOURNAMENT_ID,
      shareId: SHARE_ID,
      url: `/organizer/tournaments/${TOURNAMENT_ID}`,
      webUrl: `/painel/eventos/${TOURNAMENT_ID}/inscricoes`,
    });
  });

  it("story único no singular", async () => {
    const {fake, bucket} = setup(1);
    const share = await createStoryShareCore(db(fake), bucket, OWNER, {...input, pageCount: 1}, now);
    assert.match(share.body, /: 1 story\. /);
  });

  it("link que não é https não vai pra figurinha", async () => {
    for (const link of ["javascript:alert(1)", "http://inseguro.com", "não é link", 42]) {
      const {fake, bucket} = setup();
      await createStoryShareCore(db(fake), bucket, OWNER, {...input, link}, now);
      assert.equal(fake.store.get(`users/${OWNER}/storyShares/${SHARE_ID}`)!.link, null);
    }
  });

  it("recusa entrada inválida antes de tocar no banco", async () => {
    const {fake, bucket} = setup();
    const bad = [
      {...input, tournamentId: ""},
      {...input, tournamentId: "a/b"},
      {...input, shareId: "curto"},
      {...input, shareId: "../../x/abcdefgh"},
      {...input, pageCount: 0},
      {...input, pageCount: 1.5},
      {...input, pageCount: "2"},
      {...input, pageCount: STORY_SHARE_MAX_PAGES + 1},
      {...input, categoryName: "   "},
    ];
    for (const payload of bad) {
      await rejectsWith(createStoryShareCore(db(fake), bucket, OWNER, payload, now), "invalid-argument");
    }
    assert.equal(fake.store.has(`users/${OWNER}/storyShares/${SHARE_ID}`), false);
  });

  it("torneio inexistente vira not-found", async () => {
    const {fake, bucket} = setup();
    await rejectsWith(
      createStoryShareCore(db(fake), bucket, OWNER, {...input, tournamentId: "nao-existe"}, now),
      "not-found",
    );
  });

  it("falta de qualquer imagem recusa o envio sem gravar nada", async () => {
    const {fake, bucket} = setup(1);
    await rejectsWith(createStoryShareCore(db(fake), bucket, OWNER, input, now), "failed-precondition");
    assert.equal(fake.store.has(`users/${OWNER}/storyShares/${SHARE_ID}`), false);
  });

  it("imagens de outro usuário não servem", async () => {
    const {fake, bucket} = setup(0);
    bucket.put(storySharePagePath("intruso", TOURNAMENT_ID, SHARE_ID, 1), now);
    bucket.put(storySharePagePath("intruso", TOURNAMENT_ID, SHARE_ID, 2), now);
    await rejectsWith(createStoryShareCore(db(fake), bucket, OWNER, input, now), "failed-precondition");
  });

  it("o mesmo envio não sai duas vezes", async () => {
    const {fake, bucket} = setup();
    await createStoryShareCore(db(fake), bucket, OWNER, input, now);
    await rejectsWith(createStoryShareCore(db(fake), bucket, OWNER, input, now), "already-exists");
  });
});

describe("cleanupExpiredStoryShares", () => {
  it("apaga envios vencidos e imagens com mais de 7 dias, inclusive as órfãs", async () => {
    const fake = new FakeFirestore();
    const bucket = new FakeBucket();
    fake.seedDoc(`users/${OWNER}/storyShares/velho`, {expiresAt: Timestamp.fromMillis(now - DAY)});
    fake.seedDoc(`users/${OWNER}/storyShares/novo`, {expiresAt: Timestamp.fromMillis(now + 6 * DAY)});
    bucket.put(storySharePagePath(OWNER, TOURNAMENT_ID, "velho", 1), now - 8 * DAY);
    bucket.put(storySharePagePath(OWNER, TOURNAMENT_ID, "orfao", 1), now - 7 * DAY);
    bucket.put(storySharePagePath(OWNER, TOURNAMENT_ID, "novo", 1), now - DAY);
    bucket.put(storySharePagePath("outro", TOURNAMENT_ID, "velho", 1), now - 30 * DAY);

    const result = await cleanupExpiredStoryShares(db(fake), bucket, OWNER, now);

    assert.deepEqual(result, {docs: 1, files: 2});
    assert.equal(fake.store.has(`users/${OWNER}/storyShares/velho`), false);
    assert.equal(fake.store.has(`users/${OWNER}/storyShares/novo`), true);
    assert.deepEqual([...bucket.files.keys()].sort(), [
      storySharePagePath(OWNER, TOURNAMENT_ID, "novo", 1),
      // Só os do próprio usuário: o de outro organizador fica para a limpeza dele.
      storySharePagePath("outro", TOURNAMENT_ID, "velho", 1),
    ].sort());
  });
});
