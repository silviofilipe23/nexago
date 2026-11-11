import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  isAthleteAccount,
  isProfileComplete,
  isReviewBot,
  lastMonths,
  monthKeyOf,
  primaryLevel,
  statusOf,
  summarizeAthleteBase,
  type AthleteBaseRow,
} from "./athlete-base-model";

const NOW = Date.UTC(2026, 10, 8, 15); // 08/11/2026
const DAY = 86_400_000;

function row(over: Partial<AthleteBaseRow> = {}): AthleteBaseRow {
  const base: AthleteBaseRow = {
    uid: "u", email: null, displayName: null, fullName: null, nickname: null, photoUrl: null,
    roles: ["athlete"], disabled: false, emailVerified: true,
    createdAtMs: Date.UTC(2026, 5, 1), lastSignInMs: Date.UTC(2026, 5, 1), lastSeenMs: NOW - DAY,
    profileComplete: true, isAthlete: true, inactive: null, sportCode: null, level: null,
    status: "active", ...over,
  };
  return {...base, status: statusOf(base)};
}

describe("athlete-base-model.isProfileComplete", () => {
  it("segue a derivação do app", () => {
    assert.equal(isProfileComplete(undefined), false);
    assert.equal(isProfileComplete({}), false);
    assert.equal(isProfileComplete({isProfileComplete: true}), true);
    assert.equal(isProfileComplete({onboardingCompleted: true}), true);
    assert.equal(isProfileComplete({sportOnboarding: {completedAt: new Date()}}), true);
    assert.equal(isProfileComplete({sportOnboarding: {completedAt: null}}), false);
  });
});

describe("athlete-base-model.isAthleteAccount", () => {
  it("sem papel é atleta (padrão do cadastro); só equipe não é", () => {
    assert.equal(isAthleteAccount([]), true);
    assert.equal(isAthleteAccount(["athlete", "organizer"]), true);
    assert.equal(isAthleteAccount(["admin"]), false);
  });
});

describe("athlete-base-model.statusOf", () => {
  it("cadastro completo + já entrou = ativo", () => {
    assert.equal(row().status, "active");
  });
  it("nunca entrou não é ativo, mesmo com cadastro", () => {
    assert.equal(row({lastSignInMs: null}).status, "never_signed_in");
  });
  it("cadastro incompleto não é ativo", () => {
    assert.equal(row({profileComplete: false}).status, "incomplete");
  });
  it("marca manual vence o resto, e desativada no Auth vence a marca", () => {
    const mark = {reason: "duplicada", markedAtMs: NOW, markedByName: "Ops"};
    assert.equal(row({inactive: mark, profileComplete: false}).status, "inactive");
    assert.equal(row({inactive: mark, disabled: true}).status, "disabled");
  });
});

describe("athlete-base-model.isReviewBot", () => {
  it("pre-launch report da Play é sempre robô", () => {
    assert.equal(isReviewBot("abc.def.123@cloudtestlabaccounts.com", false), true);
    assert.equal(isReviewBot("abc.def.123@cloudtestlabaccounts.com", true), true);
  });
  it("revisão da Play (nome.12345@gmail.com) é robô só com cadastro incompleto", () => {
    assert.equal(isReviewBot("daniel.48213@gmail.com", false), true);
    assert.equal(isReviewBot("Daniel.48213@Gmail.com", false), true);
    assert.equal(isReviewBot("daniel.48213@gmail.com", true), false);
  });
  it("e-mails parecidos de gente de verdade não são robô", () => {
    assert.equal(isReviewBot("daniel.4821@gmail.com", false), false);
    assert.equal(isReviewBot("daniel.482139@gmail.com", false), false);
    assert.equal(isReviewBot("daniel48213@gmail.com", false), false);
    assert.equal(isReviewBot("joao.silva.48213@gmail.com", false), false);
    assert.equal(isReviewBot("daniel.48213@hotmail.com", false), false);
    assert.equal(isReviewBot(null, false), false);
  });
  it("robô vence nunca entrou/incompleto/inativa; desativada no Auth vence o robô", () => {
    const mark = {reason: "x", markedAtMs: NOW, markedByName: "Ops"};
    assert.equal(row({email: "ana.12345@gmail.com", profileComplete: false}).status, "review_bot");
    assert.equal(row({email: "ana.12345@gmail.com", profileComplete: false, inactive: mark}).status, "review_bot");
    assert.equal(row({email: "ana.12345@gmail.com", profileComplete: false, disabled: true}).status, "disabled");
    assert.equal(row({email: "ana.12345@gmail.com"}).status, "active");
  });
});

describe("athlete-base-model.primaryLevel", () => {
  it("usa o esporte principal; sem principal, só o único esporte", () => {
    assert.deepEqual(
      primaryLevel({sportOnboarding: {primarySportId: "bt", levelsBySport: {bt: "C", fv: "B"}}}),
      {sportCode: "bt", level: "C"},
    );
    assert.deepEqual(primaryLevel({sportOnboarding: {levelsBySport: {fv: "B"}}}), {sportCode: "fv", level: "B"});
    assert.deepEqual(primaryLevel({sportOnboarding: {levelsBySport: {fv: "B", bt: "C"}}}), {sportCode: null, level: null});
  });
});

describe("athlete-base-model meses", () => {
  it("vira o mês no fuso de São Paulo", () => {
    // 01/11 01:00 UTC ainda é 31/10 em Brasília.
    assert.equal(monthKeyOf(Date.UTC(2026, 10, 1, 1)), "2026-10");
    assert.equal(monthKeyOf(Date.UTC(2026, 10, 1, 4)), "2026-11");
  });
  it("últimos 12 meses atravessam o ano", () => {
    const months = lastMonths(NOW, 12);
    assert.equal(months.length, 12);
    assert.equal(months[0], "2025-12");
    assert.equal(months[11], "2026-11");
  });
});

describe("athlete-base-model.summarizeAthleteBase", () => {
  it("robôs das lojas saem de todos os números de atleta", () => {
    const s = summarizeAthleteBase([
      row({uid: "a"}),
      row({uid: "b", profileComplete: false}),
      row({uid: "bot1", email: "ana.12345@gmail.com", profileComplete: false}),
      row({uid: "bot2", email: "x@cloudtestlabaccounts.com", profileComplete: false, roles: []}),
    ], NOW);
    assert.equal(s.accounts, 4);
    assert.equal(s.athletes, 2);
    assert.equal(s.active, 1);
    assert.equal(s.incomplete, 1);
    assert.equal(s.neverSignedIn, 0);
    assert.equal(s.reviewBots, 2);
  });
  it("conta só atletas e separa cada situação", () => {
    const rows = [
      row({uid: "a"}),
      row({uid: "b", lastSeenMs: NOW - 40 * DAY}),
      row({uid: "c", profileComplete: false}),
      row({uid: "d", lastSignInMs: null}),
      row({uid: "e", inactive: {reason: null, markedAtMs: null, markedByName: null}}),
      row({uid: "f", disabled: true}),
      row({uid: "staff", roles: ["admin"], isAthlete: false}),
    ];
    const s = summarizeAthleteBase(rows, NOW);
    assert.equal(s.accounts, 7);
    assert.equal(s.athletes, 6);
    assert.equal(s.active, 2);
    assert.equal(s.incomplete, 1);
    assert.equal(s.neverSignedIn, 1);
    assert.equal(s.inactive, 1);
    assert.equal(s.disabled, 1);
    assert.equal(s.activeSeenLast30d, 1);
  });

  it("acumulado mês a mês pela data do cadastro", () => {
    const rows = [
      row({uid: "a", createdAtMs: Date.UTC(2026, 0, 10)}),
      row({uid: "b", createdAtMs: Date.UTC(2026, 9, 10)}),
      row({uid: "c", createdAtMs: Date.UTC(2020, 0, 1)}),
    ];
    const byMonth = summarizeAthleteBase(rows, NOW).activeByMonth;
    assert.equal(byMonth.find((m) => m.month === "2025-12")?.count, 1);
    assert.equal(byMonth.find((m) => m.month === "2026-01")?.count, 2);
    assert.equal(byMonth.find((m) => m.month === "2026-11")?.count, 3);
  });
});
