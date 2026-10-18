import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  DEFAULT_CYCLE,
  contractDays,
  deriveStatus,
  dropAction,
  freeSeats,
  inviteNote,
  isHotCandidate,
  isValidCode,
  nextCycleStart,
  normalizeCode,
  projectedConversions,
  roiOf,
  roiTone,
  scoreTone,
  suggestTier,
  suggestedCodeFor,
  sweepAction,
  type InviteClock,
  type StatusRules,
} from "./squad-program";

const NOW = new Date("2026-10-17T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

const RULES: StatusRules = {
  promotion: [
    {from: "ath", minConversions: 10, minRoi: null},
    {from: "amb", minConversions: 30, minRoi: 3},
  ],
  termination: {maxRoi: 1.5},
};

describe("código pessoal", () => {
  it("normaliza acento, espaço e caixa", () => {
    assert.equal(normalizeCode(" joão 10 "), "JOAO10");
  });

  it("aceita A–Z/0–9 com 4 a 12 caracteres", () => {
    assert.equal(isValidCode("JOAO10"), true);
    assert.equal(isValidCode("ABC"), false);
    assert.equal(isValidCode("ABCDEFGHIJKLM"), false);
    assert.equal(isValidCode("JOAO-10"), false);
  });

  it("sugere PRIMEIRONOME10 cortado em 12", () => {
    assert.equal(suggestedCodeFor("João Victor"), "JOAO10");
    assert.equal(suggestedCodeFor("Maximiliano Souza"), "MAXIMILIAN10");
    assert.equal(isValidCode(suggestedCodeFor("Maximiliano Souza")), true);
    assert.equal(suggestedCodeFor("  "), "ATLETA10");
  });
});

describe("nível sugerido", () => {
  const base = {leadsGroup: null, referredCount: null, rankingPosition: null, followers: null, engagementPct: null, tournaments: null};

  it("lidera turma ≥ 10 ou ≥ 15 indicados vira Captain", () => {
    assert.equal(suggestTier({...base, leadsGroup: "10to30"}), "cap");
    assert.equal(suggestTier({...base, leadsGroup: "lt10", referredCount: 15}), "cap");
  });

  it("top 10 do ranking ou ≥ 40 mil seguidores vira Pro", () => {
    assert.equal(suggestTier({...base, rankingPosition: 3}), "pro");
    assert.equal(suggestTier({...base, followers: 40_000}), "pro");
  });

  it("Ambassador precisa de ≥ 8 torneios e alcance", () => {
    assert.equal(suggestTier({...base, tournaments: 8, followers: 10_000}), "amb");
    assert.equal(suggestTier({...base, tournaments: 8, engagementPct: 4}), "amb");
    assert.equal(suggestTier({...base, tournaments: 8, followers: 9_999}), "ath");
    assert.equal(suggestTier({...base, tournaments: 7, followers: 30_000}), "ath");
  });

  it("Captain tem prioridade sobre Pro", () => {
    assert.equal(suggestTier({...base, leadsGroup: "gt30", followers: 80_000}), "cap");
  });

  it("borda hot: Captain com ≥ 20 indicados ou score ≥ 80", () => {
    assert.equal(isHotCandidate({suggestedTier: "cap", referredCount: 22, applicationScore: null}), true);
    assert.equal(isHotCandidate({suggestedTier: "cap", referredCount: 19, applicationScore: null}), false);
    assert.equal(isHotCandidate({suggestedTier: "pro", referredCount: 40, applicationScore: null}), false);
    assert.equal(isHotCandidate({suggestedTier: "ath", referredCount: null, applicationScore: 80}), true);
  });
});

describe("status derivado", () => {
  const status = (over: Partial<Parameters<typeof deriveStatus>[0]>) =>
    deriveStatus({state: "active", tier: "amb", start: daysAgo(60), conversions: 20, roi: 3, rules: RULES, now: NOW, ...over});

  it("encerrado e pausado vencem tudo", () => {
    assert.equal(status({state: "ended", roi: 0.5}), "ended");
    assert.equal(status({state: "paused", roi: 0.5}), "paused");
  });

  it("em risco: ROI abaixo do limite com ≥ 30 dias", () => {
    assert.equal(status({roi: 1.2}), "at_risk");
  });

  it("nos 30 primeiros dias mostra Ativo · início no lugar de risco e meta", () => {
    assert.equal(status({start: daysAgo(10), roi: 1.2, conversions: 0}), "active_start");
  });

  it("elegível quando bate conversões e ROI da próxima transição", () => {
    assert.equal(status({conversions: 30, roi: 3.2}), "eligible");
    assert.equal(status({conversions: 30, roi: 2.9}), "active");
    assert.equal(status({tier: "ath", conversions: 10, roi: null}), "eligible");
    assert.equal(status({start: daysAgo(5), tier: "ath", conversions: 12, roi: null}), "eligible");
  });

  it("abaixo da meta: projeção do dia 90 < metade do critério", () => {
    // 60 dias, 9 conversões → 13,5 projetadas < 15 (metade de 30).
    assert.equal(status({conversions: 9, roi: 3}), "below_goal");
    assert.equal(status({conversions: 10, roi: 3}), "active");
  });

  it("Pro e Captain não têm próxima transição: nunca elegível nem abaixo da meta", () => {
    assert.equal(status({tier: "pro", conversions: 0, roi: 3}), "active");
    assert.equal(status({tier: "cap", conversions: 500, roi: 9}), "active");
  });

  it("ritmo e dias de contrato", () => {
    assert.equal(contractDays(daysAgo(30), NOW), 30);
    assert.equal(contractDays(null, NOW), 0);
    assert.equal(projectedConversions(10, 30), 30);
    assert.equal(projectedConversions(1, 0), 90);
  });
});

describe("cores", () => {
  it("ROI: custo 0 não tem ROI; faixas 4x e 2,5x", () => {
    assert.equal(roiOf(100, 0), null);
    assert.equal(roiTone(null), "none");
    assert.equal(roiTone(4), "green");
    assert.equal(roiTone(2.5), "neutral");
    assert.equal(roiTone(2.49), "red");
  });

  it("Score: 75 / 55", () => {
    assert.equal(scoreTone(null), "none");
    assert.equal(scoreTone(75), "hot");
    assert.equal(scoreTone(55), "warm");
    assert.equal(scoreTone(54), "red");
  });
});

describe("ciclo e kanban", () => {
  it("próximo ciclo começa no dia seguinte ao fim (07/12 no piloto)", () => {
    assert.equal(nextCycleStart(DEFAULT_CYCLE), "2026-12-07");
  });

  it("vagas livres descontam contratos vivos e convites em aberto", () => {
    assert.equal(freeSeats(DEFAULT_CYCLE, 18, 1), 1);
    assert.equal(freeSeats(DEFAULT_CYCLE, 20, 2), 0);
  });

  it("arrastar só avança para a coluna vizinha que o time controla", () => {
    assert.equal(dropAction("new", "review"), "review");
    assert.equal(dropAction("review", "invited"), "invite");
    assert.equal(dropAction("new", "invited"), null);
    assert.equal(dropAction("invited", "contract"), null);
    assert.equal(dropAction("review", "new"), null);
  });
});

describe("relógio do convite", () => {
  const clock = (over: Partial<InviteClock>): InviteClock => ({
    status: "sent", sentAt: daysAgo(0), openedAt: null, expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
    scheduledFor: null, reminders: [], ...over,
  });
  const today = "2026-10-17";

  it("convidado: lembrete D+3 uma vez, expira no prazo", () => {
    assert.equal(sweepAction(clock({sentAt: daysAgo(2)}), NOW, today), null);
    assert.deepEqual(sweepAction(clock({sentAt: daysAgo(3)}), NOW, today), {kind: "remind", key: "sent_d3"});
    assert.equal(sweepAction(clock({sentAt: daysAgo(4), reminders: ["sent_d3"]}), NOW, today), null);
    assert.deepEqual(sweepAction(clock({sentAt: daysAgo(7), expiresAt: daysAgo(0)}), NOW, today), {kind: "expire"});
  });

  it("contrato enviado: lembretes D+1 e D+3", () => {
    const opened = (n: number, reminders: string[] = []) => clock({status: "opened", openedAt: daysAgo(n), reminders});
    assert.deepEqual(sweepAction(opened(1), NOW, today), {kind: "remind", key: "opened_d1"});
    assert.equal(sweepAction(opened(2, ["opened_d1"]), NOW, today), null);
    assert.deepEqual(sweepAction(opened(3, ["opened_d1"]), NOW, today), {kind: "remind", key: "opened_d3"});
  });

  it("agendado: envia no início do ciclo", () => {
    assert.equal(sweepAction(clock({status: "scheduled", scheduledFor: "2026-12-07"}), NOW, today), null);
    assert.deepEqual(sweepAction(clock({status: "scheduled", scheduledFor: "2026-12-07"}), NOW, "2026-12-07"), {kind: "send"});
  });

  it("nota automática do card", () => {
    assert.equal(inviteNote(clock({sentAt: daysAgo(3)}), NOW), "Convite enviado há 3 dias · ainda não abriu");
    assert.equal(inviteNote(clock({status: "opened", openedAt: daysAgo(0)}), NOW), "Aguardando assinatura · lembrete automático amanhã");
    assert.equal(inviteNote(clock({status: "scheduled", scheduledFor: "2026-12-07"}), NOW), "Convite agendado para 07/12 · próximo ciclo");
  });
});
