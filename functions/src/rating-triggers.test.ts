import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  isPrivilegedLevelChangeWrite,
  levelChangeByOf,
  shouldAuditSelfCorrectionDowngrade,
} from "./rating-triggers";

// F4 (review pós-calibração de nível, 2ª volta): `onUserWrittenTrackLevelChanges`
// (rating-triggers.ts) reage a QUALQUER rebaixamento em `sportOnboarding.levelsBySport`, venha
// do próprio atleta (self-correction, dentro da janela) ou de um rebaixamento manual do admin
// via `setAthleteLevel`. A 1ª volta usava "existe doc em `athleteRatings`" como proxy pra "não é
// o atleta" — mas um self-correction genuíno TAMBÉM não tem doc de rating (é o caso mais comum
// da janela: atleta que nunca jogou partida rateada), então o proxy apagava a auditoria do
// evento mais comum da própria feature. A 2ª volta troca o proxy pelo sinal de verdade:
// `sportOnboarding.levelChangeBy`, marcador que só `levelProfileWriteFields`
// (athlete-level-admin.ts) grava, nos caminhos admin/organizador — nunca o cliente (rules,
// `levelChangeByUnchanged()`).
describe("shouldAuditSelfCorrectionDowngrade (marcador de escrita privilegiada)", () => {
  it("escrita do cliente (sem marcador): audita — self-correction genuíno, com ou sem doc de rating", () => {
    assert.equal(shouldAuditSelfCorrectionDowngrade(false), true);
  });

  it("escrita privilegiada (marcador presente): não audita — o caminho admin/organizador já grava a própria entrada", () => {
    assert.equal(shouldAuditSelfCorrectionDowngrade(true), false);
  });
});

describe("levelChangeByOf / isPrivilegedLevelChangeWrite", () => {
  it("doc sem sportOnboarding: undefined, não privilegiado", () => {
    assert.equal(levelChangeByOf(undefined), undefined);
    assert.equal(isPrivilegedLevelChangeWrite(undefined), false);
  });

  it("sportOnboarding sem levelChangeBy: undefined, não privilegiado (escrita do próprio atleta)", () => {
    const after = {sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "iniciante_1"}}};
    assert.equal(levelChangeByOf(after), undefined);
    assert.equal(isPrivilegedLevelChangeWrite(after), false);
  });

  it("levelChangeBy: 'admin' — privilegiado (rebaixamento manual do backoffice)", () => {
    const after = {sportOnboarding: {levelChangeBy: "admin"}};
    assert.equal(levelChangeByOf(after), "admin");
    assert.equal(isPrivilegedLevelChangeWrite(after), true);
  });

  it("levelChangeBy: 'organizer' — privilegiado (promoção pelo organizador)", () => {
    const after = {sportOnboarding: {levelChangeBy: "organizer"}};
    assert.equal(levelChangeByOf(after), "organizer");
    assert.equal(isPrivilegedLevelChangeWrite(after), true);
  });
});
