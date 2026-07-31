import {strict as assert} from "node:assert";
import {test} from "node:test";
import {assertSeatAvailable, inviteIsClaimable} from "./arena-staff-ops";

const NOW = Date.UTC(2026, 6, 31);
const AMANHA = {toMillis: () => NOW + 24 * 60 * 60 * 1000};
const ONTEM = {toMillis: () => NOW - 24 * 60 * 60 * 1000};

test("assertSeatAvailable passa quando ha vaga", () => {
  assert.doesNotThrow(() => assertSeatAvailable(5, 4));
  assert.doesNotThrow(() => assertSeatAvailable(Infinity, 900));
});

test("assertSeatAvailable barra quando lotou", () => {
  assert.throws(() => assertSeatAvailable(5, 5), /limite/i);
});

test("assertSeatAvailable barra plano sem assentos", () => {
  assert.throws(() => assertSeatAvailable(0, 0), /plano/i);
});

test("convite valido e reivindicavel pelo email certo", () => {
  const invite = {status: "pending", emailLower: "a@b.com", expiresAt: AMANHA};
  assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), true);
});

test("convite de outro email nao e reivindicavel", () => {
  const invite = {status: "pending", emailLower: "a@b.com", expiresAt: AMANHA};
  assert.equal(inviteIsClaimable(invite, "z@b.com", NOW), false);
});

test("convite expirado nao e reivindicavel", () => {
  const invite = {status: "pending", emailLower: "a@b.com", expiresAt: ONTEM};
  assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), false);
});

test("convite ja aceito ou revogado nao e reivindicavel", () => {
  for (const status of ["accepted", "revoked", "expired"]) {
    const invite = {status, emailLower: "a@b.com", expiresAt: AMANHA};
    assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), false);
  }
});

test("convite sem expiresAt e tratado como valido", () => {
  const invite = {status: "pending", emailLower: "a@b.com"};
  assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), true);
});

test("convite nao e reivindicavel por sessao sem e-mail", () => {
  const invite = {status: "pending", emailLower: "", expiresAt: AMANHA};
  assert.equal(inviteIsClaimable(invite, "", NOW), false);
});
