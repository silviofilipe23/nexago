import {strict as assert} from "node:assert";
import {test} from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {
  ARENA_AREAS,
  ARENA_STAFF_ROLES,
  type ArenaArea,
  type ArenaStaffRole,
  arenaRoleCanRead,
  arenaRoleCanWrite,
  isArenaStaffRole,
  maxArenaStaffSeats,
  normalizeInviteEmail,
} from "./arena-staff-roles";

const NOW = Date.UTC(2026, 6, 31);

test("isArenaStaffRole aceita so os quatro cargos", () => {
  assert.equal(isArenaStaffRole("gestor"), true);
  assert.equal(isArenaStaffRole("recepcao"), true);
  assert.equal(isArenaStaffRole("financeiro"), true);
  assert.equal(isArenaStaffRole("manutencao"), true);
  assert.equal(isArenaStaffRole("dono"), false);
  assert.equal(isArenaStaffRole(""), false);
  assert.equal(isArenaStaffRole(undefined), false);
});

test("sem plano nao tem assento", () => {
  assert.equal(maxArenaStaffSeats({}, NOW), 0);
});

test("starter ativo nao tem assento", () => {
  assert.equal(
    maxArenaStaffSeats({planTier: "starter", planStatus: "active"}, NOW),
    0,
  );
});

test("pro ativo tem 5 assentos", () => {
  assert.equal(maxArenaStaffSeats({planTier: "pro", planStatus: "active"}, NOW), 5);
});

test("elite ativo e ilimitado", () => {
  assert.equal(
    maxArenaStaffSeats({planTier: "elite", planStatus: "active"}, NOW),
    Infinity,
  );
});

test("parceiro (id legado) e tratado como elite", () => {
  assert.equal(
    maxArenaStaffSeats({planTier: "parceiro", planStatus: "active"}, NOW),
    Infinity,
  );
});

test("pro vencido fora da carencia perde os assentos", () => {
  const venceuHa30Dias = {
    planTier: "pro",
    planStatus: "overdue",
    planActiveUntil: Timestamp.fromMillis(NOW - 30 * 24 * 60 * 60 * 1000),
  };
  assert.equal(maxArenaStaffSeats(venceuHa30Dias, NOW), 0);
});

test("pro vencido dentro da carencia mantem os assentos", () => {
  const venceuOntem = {
    planTier: "pro",
    planStatus: "overdue",
    planActiveUntil: Timestamp.fromMillis(NOW - 24 * 60 * 60 * 1000),
  };
  assert.equal(maxArenaStaffSeats(venceuOntem, NOW), 5);
});

test("normalizeInviteEmail apara e minusculiza", () => {
  assert.equal(normalizeInviteEmail("  Rafael@Arena.COM "), "rafael@arena.com");
  assert.equal(normalizeInviteEmail(""), "");
  assert.equal(normalizeInviteEmail(undefined), "");
});

// ---------------------------------------------------------------------------
// Matriz de acesso por área — ESPELHO MANUAL de
// `frontend/projects/arena/src/app/painel/data/arena-roles.model.spec.ts`.
// Uma única célula errada aqui já quebrou a produção uma vez (ver
// `role-to-roles-migration.md`/histórico do projeto) — por isso a matriz
// completa (todo cargo × toda área × os dois modos), não um spot-check.
// `torneios` fica de fora de propósito: não existe no servidor.
// ---------------------------------------------------------------------------

test("torneios nao existe na matriz do servidor (de proposito)", () => {
  assert.equal((ARENA_AREAS as readonly string[]).includes("torneios"), false);
});

test("cargo desconhecido nao alcanca nada", () => {
  for (const area of ARENA_AREAS) {
    assert.equal(arenaRoleCanRead("sindico" as unknown as ArenaStaffRole, area), false);
    assert.equal(arenaRoleCanWrite("sindico" as unknown as ArenaStaffRole, area), false);
  }
});

test("escrita sempre implica leitura", () => {
  for (const role of ARENA_STAFF_ROLES) {
    for (const area of ARENA_AREAS) {
      if (arenaRoleCanWrite(role, area)) {
        assert.equal(
          arenaRoleCanRead(role, area),
          true,
          `${role} escreve ${area} mas nao le`,
        );
      }
    }
  }
});

test("matriz completa: cada cargo em cada area (RW/R/-)", () => {
  const EXPECTED: Record<ArenaStaffRole, Record<ArenaArea, "RW" | "R" | "-">> = {
    gestor: {
      agenda: "RW",
      comandas: "RW",
      estoque: "RW",
      financeiro: "R",
      promocoes: "RW",
      site: "RW",
      quadras: "RW",
      perfil: "RW",
      comunidade: "RW",
    },
    recepcao: {
      agenda: "RW",
      comandas: "RW",
      estoque: "R",
      financeiro: "-",
      promocoes: "-",
      site: "-",
      quadras: "-",
      perfil: "-",
      comunidade: "R",
    },
    financeiro: {
      agenda: "-",
      comandas: "R",
      estoque: "-",
      financeiro: "R",
      promocoes: "RW",
      site: "-",
      quadras: "-",
      perfil: "-",
      comunidade: "R",
    },
    manutencao: {
      agenda: "R",
      comandas: "-",
      estoque: "RW",
      financeiro: "-",
      promocoes: "-",
      site: "-",
      quadras: "RW",
      perfil: "-",
      comunidade: "-",
    },
  };

  for (const role of ARENA_STAFF_ROLES) {
    for (const area of ARENA_AREAS) {
      const expected = EXPECTED[role][area];
      assert.equal(
        arenaRoleCanWrite(role, area),
        expected === "RW",
        `${role} escreve ${area}`,
      );
      assert.equal(
        arenaRoleCanRead(role, area),
        expected !== "-",
        `${role} le ${area}`,
      );
    }
  }
});
