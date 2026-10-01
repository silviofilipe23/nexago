import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  reviewClosedNotification,
  reviewReminderNotification,
  reviewRequestNotification,
} from "./tournament-review-notifications";

const CLOSES = Date.UTC(2026, 9, 15, 13, 0, 0); // 15/10/2026 10:00 em São Paulo

describe("pushes da avaliação de torneio", () => {
  it("pedido: nome no título, url que o app antigo conhece, sem requireInteraction", () => {
    assert.deepEqual(reviewRequestNotification({uid: "u1", tournamentId: "t1", tournamentName: "Desafio Anápolis"}), {
      userId: "u1",
      title: "Como foi o torneio Desafio Anápolis?",
      body: "Avalie em 10 segundos e ganhe 10 XP.",
      type: "tournament_review_request",
      data: {tournamentId: "t1", url: "/torneios/t1"},
      requireInteraction: false,
    });
  });

  it("nome vazio vira 'torneio'", () => {
    assert.equal(
      reviewRequestNotification({uid: "u1", tournamentId: "t1", tournamentName: "  "}).title,
      "Como foi o torneio?",
    );
  });

  it("nome feminino não vira 'o Liga' / 'o Copa': o artigo vai pra palavra 'torneio'", () => {
    const title = (tournamentName: string) =>
      reviewRequestNotification({uid: "u1", tournamentId: "t1", tournamentName}).title;
    assert.equal(title("Liga nexaGO – 1ª etapa"), "Como foi o torneio Liga nexaGO – 1ª etapa?");
    assert.equal(title("Copa VH"), "Como foi o torneio Copa VH?");
  });

  it("nome que já começa com 'Torneio' não repete a palavra", () => {
    assert.equal(
      reviewRequestNotification({uid: "u1", tournamentId: "t1", tournamentName: "Torneio de Verão"}).title,
      "Como foi o Torneio de Verão?",
    );
  });

  it("lembrete: data de fechamento no fuso de São Paulo", () => {
    const n = reviewReminderNotification({uid: "u1", tournamentId: "t1", tournamentName: "Copa", closesAtMs: CLOSES});
    assert.equal(n.title, "Ainda dá tempo de avaliar o torneio Copa");
    assert.equal(n.body, "A avaliação fecha em 15/10.");
    assert.equal(n.type, "tournament_review_reminder");
    assert.deepEqual(n.data, {tournamentId: "t1", url: "/torneios/t1"});
    assert.equal(n.requireInteraction, false);
  });

  it("fechamento com nota: média com vírgula, rota do app e do portal", () => {
    const n = reviewClosedNotification({uid: "org", tournamentId: "t1", tournamentName: "Copa", count: 23, average: 4.567});
    assert.equal(n.userId, "org");
    assert.equal(n.title, "Avaliações do torneio Copa encerradas");
    assert.equal(n.body, "4,6 ★ com 23 avaliações.");
    assert.equal(n.type, "tournament_review_closed");
    assert.deepEqual(n.data, {
      tournamentId: "t1",
      url: "/organizer/tournaments/t1",
      webUrl: "/painel/eventos/t1/avaliacoes",
    });
  });

  it("fechamento abaixo de 3: sem média, com singular certo", () => {
    const base = {uid: "org", tournamentId: "t1", tournamentName: "Copa", average: null};
    assert.equal(reviewClosedNotification({...base, count: 1}).body, "Recebeu 1 avaliação, poucas para exibir.");
    assert.equal(reviewClosedNotification({...base, count: 0}).body, "Nenhum atleta avaliou o torneio.");
  });
});
