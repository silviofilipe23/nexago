import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  assertArenaAreaAccess,
  decideArenaAreaAccess,
  type ArenaAreaAccessArenaData,
} from "./arena-area-access";

const NOW = Date.UTC(2026, 6, 31);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

function proArena(overrides: Partial<ArenaAreaAccessArenaData> = {}): ArenaAreaAccessArenaData {
  return {
    managerUserId: "owner1",
    planTier: "pro",
    planStatus: "active",
    ...overrides,
  };
}

describe("decideArenaAreaAccess — logica pura (mirror de arenaCanWrite/arenaCanRead das rules)", () => {
  it("dono da arena tem acesso a qualquer area, mesmo sem plano pago", () => {
    const arena: ArenaAreaAccessArenaData = {managerUserId: "owner1", planTier: "starter", planStatus: "active"};
    assert.equal(decideArenaAreaAccess(arena, "owner1", null, "financeiro", "write", NOW), true);
    assert.equal(decideArenaAreaAccess(arena, "owner1", null, "site", "read", NOW), true);
  });

  it("uid que nao e dono nem staff (ex.: admin da plataforma) e negado — bypass de admin vive no call site, nao aqui", () => {
    const arena = proArena();
    assert.equal(decideArenaAreaAccess(arena, "platform-admin-uid", null, "agenda", "read", NOW), false);
  });

  it("staff ativo com a area no cargo tem acesso", () => {
    const arena = proArena();
    const staff = {status: "active", role: "recepcao"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "agenda", "write", NOW), true);
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "estoque", "read", NOW), true);
  });

  it("staff ativo sem a area no cargo e negado", () => {
    const arena = proArena();
    const staff = {status: "active", role: "recepcao"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "financeiro", "read", NOW), false);
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "estoque", "write", NOW), false);
  });

  it("staff inativo (status != active) e negado mesmo com a area no cargo", () => {
    const arena = proArena();
    const staff = {status: "revoked", role: "gestor"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "agenda", "write", NOW), false);
  });

  it("sem doc de staff (nao e membro de equipe) e negado", () => {
    const arena = proArena();
    assert.equal(decideArenaAreaAccess(arena, "naoStaffUid", null, "agenda", "read", NOW), false);
  });

  it("staff ativo com a area certa mas plano vencido (fora da carencia) e negado — entitlement nao e opcional", () => {
    const arena: ArenaAreaAccessArenaData = {
      managerUserId: "owner1",
      planTier: "pro",
      planStatus: "overdue",
      planActiveUntil: Timestamp.fromMillis(NOW - 30 * 24 * 60 * 60 * 1000), // venceu ha 30 dias, fora da carencia de 7d
    };
    const staff = {status: "active", role: "gestor"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "agenda", "write", NOW), false);
  });

  it("staff ativo com a area certa e plano vencido DENTRO da carencia mantem acesso", () => {
    const arena: ArenaAreaAccessArenaData = {
      managerUserId: "owner1",
      planTier: "pro",
      planStatus: "overdue",
      planActiveUntil: Timestamp.fromMillis(NOW - 24 * 60 * 60 * 1000), // venceu ontem
    };
    const staff = {status: "active", role: "gestor"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "agenda", "write", NOW), true);
  });

  it("staff ativo sem plano (starter/sem plano) e negado mesmo com a area no cargo", () => {
    const arena: ArenaAreaAccessArenaData = {managerUserId: "owner1", planTier: "starter", planStatus: "active"};
    const staff = {status: "active", role: "gestor"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "agenda", "write", NOW), false);
  });

  it("parceiro (tier legado) e tratado como elite — staff ativo mantem acesso", () => {
    const arena: ArenaAreaAccessArenaData = {managerUserId: "owner1", planTier: "parceiro", planStatus: "active"};
    const staff = {status: "active", role: "gestor"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "site", "write", NOW), true);
  });

  it("role desconhecido no doc de staff e negado", () => {
    const arena = proArena();
    const staff = {status: "active", role: "sindico"};
    assert.equal(decideArenaAreaAccess(arena, "staffUid", staff, "agenda", "read", NOW), false);
  });
});

describe("assertArenaAreaAccess — integracao com FakeFirestore", () => {
  it("nao encontra arena inexistente", async () => {
    const fake = new FakeFirestore();
    await assertHttpsError(
      assertArenaAreaAccess(db(fake), "arenaFantasma", "uid1", "agenda", "write"),
      "not-found",
    );
  });

  it("dono da arena passa", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "owner1", planTier: "starter", planStatus: "active"});
    await assertArenaAreaAccess(db(fake), "arena1", "owner1", "financeiro", "write");
  });

  it("staff ativo com a area correta passa", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "owner1", planTier: "pro", planStatus: "active"});
    fake.seedDoc("arenas/arena1/staff/staff1", {status: "active", role: "financeiro"});
    await assertArenaAreaAccess(db(fake), "arena1", "staff1", "promocoes", "write");
  });

  it("staff ativo com plano lapsado (fora da carencia) e negado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {
      managerUserId: "owner1",
      planTier: "pro",
      planStatus: "overdue",
      planActiveUntil: Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    fake.seedDoc("arenas/arena1/staff/staff1", {status: "active", role: "gestor"});
    await assertHttpsError(
      assertArenaAreaAccess(db(fake), "arena1", "staff1", "agenda", "write"),
      "permission-denied",
    );
  });

  it("estranho (nem dono nem staff) e negado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "owner1", planTier: "elite", planStatus: "active"});
    await assertHttpsError(
      assertArenaAreaAccess(db(fake), "arena1", "intruder", "agenda", "read"),
      "permission-denied",
    );
  });
});
