import {strict as assert} from "node:assert";
import {test} from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {
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
