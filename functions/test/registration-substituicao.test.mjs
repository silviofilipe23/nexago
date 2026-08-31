/**
 * Matriz da SUBSTITUIÇÃO de atleta: convite → aceite, permitida até a
 * publicação das chaves da categoria (categoryOps[categoryId].bracketStatus).
 */
import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  INSCRIPTIONS,
  INVITES,
  Timestamp,
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  formDupla,
  formTeam,
  getInvite,
  getRegistration,
  getTeam,
  markSharePaid,
  markStaleSubstitutionInvitesForCategory,
  publishBracket,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Dupla A+B formada numa categoria masculina livre de nível. */
async function duplaFormada() {
  const a = await seedMan({uid: 'ana-a', name: 'Atleta A'});
  const b = await seedMan({uid: 'beto-b', name: 'Atleta B'});
  const c = await seedMan({uid: 'caio-c', name: 'Atleta C'});
  const tournamentId = await seedTournament({
    categories: [duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'})],
  });
  const {registrationId, teamId} = await formDupla({
    tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
  });
  return {a, b, c, tournamentId, registrationId, teamId};
}

function sendPayload(over = {}) {
  return {
    replacedName: 'Atleta B',
    inviteeName: 'Atleta C',
    inviterName: 'Atleta A',
    ...over,
  };
}

describe('substituição — envio do convite', () => {
  test('membro da dupla convida substituto para a vaga do parceiro', async () => {
    const {a, b, c, registrationId, teamId, tournamentId} = await duplaFormada();

    const {inviteId} = await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));

    const invite = await getInvite(inviteId);
    assert.equal(invite.isSubstitutionInvite, true);
    assert.equal(invite.replacedUid, b);
    assert.equal(invite.replacedName, 'Atleta B');
    assert.equal(invite.attachRegistrationId, registrationId);
    assert.equal(invite.attachTeamId, teamId);
    assert.equal(invite.tournamentId, tournamentId);
    assert.equal(invite.status, 'pending');
  });

  test('membro também indica substituto para a PRÓPRIA vaga', async () => {
    const {b, c, registrationId} = await duplaFormada();
    const {inviteId} = await call(callables.sendSubstitution, b, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c, inviterName: 'Atleta B',
    }));
    assert.ok(inviteId);
  });

  test('quem não é da inscrição não inicia', async () => {
    const {b, c, registrationId} = await duplaFormada();
    const intruso = await seedMan({uid: 'intruso'});
    const msg = await callExpectingError(callables.sendSubstitution, intruso, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    assert.match(msg, /não é um dos atletas/i);
  });

  test('chave publicada bloqueia o envio', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    await publishBracket(tournamentId, 'masc');
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    assert.match(msg, /chaves.*publicadas/i);
  });

  test('substituto já inscrito na categoria é recusado', async () => {
    const {a, b, registrationId, tournamentId} = await duplaFormada();
    const d = await seedMan({uid: 'davi-d'});
    const e = await seedMan({uid: 'edu-e'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: d, inviteeUid: e});
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: d,
    }));
    assert.match(msg, /já está inscrito/i);
  });

  test('um convite pendente por vaga', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const d = await seedMan({uid: 'davi-d'});
    await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: d,
    }));
    assert.match(msg, /convite de substituição pendente/i);
  });

  test('substituto fora da faixa de nível da categoria é barrado', async () => {
    // Códigos conferidos em category-level-eligibility.ts (LEVEL_RANK): o
    // atleta usa o CÓDIGO ('iniciante_1'/'avancado_1' — 'avancado' bare não
    // existe no mapa), a categoria usa o LABEL ('Iniciante 1'), mesmo padrão
    // de registration-gates.test.mjs ("gates — nível").
    const a = await seedMan({uid: 'ana-a', level: 'iniciante_1'});
    const b = await seedMan({uid: 'beto-b', level: 'iniciante_1'});
    const forte = await seedMan({uid: 'forte', level: 'avancado_1'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'inic', categoryName: 'Dupla Iniciante', level: 'Iniciante 1'})],
    });
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'inic', inviterUid: a, inviteeUid: b,
    });
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: forte,
    }));
    assert.match(msg, /não pode disputar a categoria/i);
  });

  test('equipe: só o capitão convida, e nunca para a própria vaga', async () => {
    const cap = await seedMan({uid: 'cap'});
    const m1 = await seedMan({uid: 'm1'});
    const m2 = await seedMan({uid: 'm2'});
    const sub = await seedMan({uid: 'sub'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'trio', categoryName: 'Trio Livre', teamSize: 3, genderMode: 'free'})],
    });
    const {registrationId} = await formTeam({
      tournamentId, categoryId: 'trio', captainUid: cap, memberUids: [m1, m2],
    });

    const naoCapitao = await callExpectingError(callables.sendSubstitution, m1, sendPayload({
      registrationId, replacedUid: m2, inviteeUid: sub,
    }));
    assert.match(naoCapitao, /capitão/i);

    const capitaoSaindo = await callExpectingError(callables.sendSubstitution, cap, sendPayload({
      registrationId, replacedUid: cap, inviteeUid: sub,
    }));
    assert.match(capitaoSaindo, /capitão não pode ser substituído/i);

    const {inviteId} = await call(callables.sendSubstitution, cap, sendPayload({
      registrationId, replacedUid: m1, inviteeUid: sub,
    }));
    assert.ok(inviteId);
  });
});

async function enviarConvite({registrationId, replacedUid, inviteeUid, inviterUid}) {
  const {inviteId} = await call(callables.sendSubstitution, inviterUid, sendPayload({
    registrationId, replacedUid, inviteeUid,
  }));
  return inviteId;
}

describe('substituição — aceite', () => {
  test('dupla: substituto entra preservando o índice e o pagamento da vaga', async () => {
    const {a, b, c, registrationId, teamId} = await duplaFormada();
    await markSharePaid(registrationId, [b]);
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const result = await call(callables.acceptInvite, c, {inviteId, lgpdAccepted: true});
    assert.equal(result.registrationId, registrationId);
    assert.equal(result.teamId, teamId, 'teamId nunca muda na troca');

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.participantUids, [a, c], 'B era índice 1; C herda a posição');
    assert.deepEqual(reg.sharePaidUids, [c], 'a vaga paga segue paga, agora no nome do substituto');
    assert.ok(reg.lgpdAcceptedUids.includes(c));
    assert.equal(reg.substitutionHistory.length, 1);
    assert.equal(reg.substitutionHistory[0].outUid, b);
    assert.equal(reg.substitutionHistory[0].inUid, c);
    assert.equal(reg.substitutionHistory[0].outHadPaid, true);

    const team = await getTeam(teamId);
    assert.equal(team.player2Id, c, 'espelho legado acompanha');
    assert.equal(team.player1Id, a);

    const invite = await getInvite(inviteId);
    assert.equal(invite.status, 'accepted');
  });

  test('dupla: troca no índice 0 reescreve player1Id e o slot Player1 do uniforme', async () => {
    const a = await seedMan({uid: 'ana-a', name: 'Atleta A'});
    const b = await seedMan({uid: 'beto-b', name: 'Atleta B'});
    const c = await seedMan({uid: 'caio-c', name: 'Atleta C'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc-idx0', categoryName: 'Dupla Masculina Índice 0', uniformType: 'top_only'})],
    });
    // Reserva solo do convidante: única forma de a inscrição nascer com
    // player1Id gravado no PRÓPRIO doc (dupla via convite direto não tem).
    const {registrationId} = await call(callables.registerSolo, a, {
      tournamentId, categoryId: 'masc-idx0',
    });
    const {inviteId: partnerInviteId} = await call(callables.sendInvite, a, {
      tournamentId, categoryId: 'masc-idx0', inviteeUid: b, inviteeName: 'Atleta B', inviterName: 'Atleta A',
    });
    const {teamId} = await call(callables.acceptInvite, b, {inviteId: partnerInviteId});
    await call(callables.setUniform, a, {registrationId, uniform: {sizeTop: 'M'}});

    const inviteId = await enviarConvite({registrationId, replacedUid: a, inviteeUid: c, inviterUid: b});
    await call(callables.acceptInvite, c, {inviteId, inviteeUniform: {sizeTop: 'G'}});

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.participantUids, [c, b], 'A era índice 0; C herda a posição');
    assert.equal(reg.player1Id, c);
    assert.equal(reg.sizeTopPlayer1, 'G');

    const team = await getTeam(teamId);
    assert.equal(team.player1Id, c);
    assert.equal(team.player2Id, b);
  });

  test('dupla: troca herda organizerConfirmedShareUids junto com sharePaidUids', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    await db.doc(`${INSCRIPTIONS}/${registrationId}`).set(
      {sharePaidUids: [b], organizerConfirmedShareUids: [b]}, {merge: true},
    );

    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await call(callables.acceptInvite, c, {inviteId});

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.sharePaidUids, [c]);
    assert.deepEqual(reg.organizerConfirmedShareUids, [c], 'confirmação do organizador também migra pro substituto');
  });

  test('dupla: aceite sem uniforme limpa o slot de quem saiu sem tocar no outro', async () => {
    const a = await seedMan({uid: 'ana-a', name: 'Atleta A'});
    const b = await seedMan({uid: 'beto-b', name: 'Atleta B'});
    const c = await seedMan({uid: 'caio-c', name: 'Atleta C'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc-idx1', categoryName: 'Dupla Masculina Índice 1', uniformType: 'top_only'})],
    });
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'masc-idx1', inviterUid: a, inviteeUid: b,
    });
    await call(callables.setUniform, b, {registrationId, uniform: {sizeTop: 'M'}});

    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await call(callables.acceptInvite, c, {inviteId});

    const reg = await getRegistration(registrationId);
    assert.equal(reg.sizeTopPlayer2, undefined, 'uniforme de quem saiu é removido, substituto não mandou o dele');
    assert.equal(reg.sizeTopPlayer1, undefined, 'sem efeito colateral no slot do outro parceiro');
  });

  test('chave publicada entre o envio e o aceite bloqueia', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await publishBracket(tournamentId, 'masc');
    // PIX aberto de quem sairia: o gate tem que travar ANTES de tocar nele.
    const pixRef = db.doc(`${INSCRIPTIONS}/${registrationId}/pixPending/${b}`);
    await pixRef.set({status: 'pending', payerUid: b});
    const msg = await callExpectingError(callables.acceptInvite, c, {inviteId});
    assert.match(msg, /chaves.*publicadas/i);
    assert.equal((await pixRef.get()).exists, true, 'PIX de quem sairia não foi tocado');
  });

  test('quem sairia já saiu: aceite falha e convite vira stale', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    const d = await seedMan({uid: 'davi-d'});
    await db.doc(`${INSCRIPTIONS}/${registrationId}`).set(
      {participantUids: [a, d]}, {merge: true},
    );
    const msg = await callExpectingError(callables.acceptInvite, c, {inviteId});
    assert.match(msg, /já saiu da equipe/i);
    assert.equal((await getInvite(inviteId)).status, 'stale');
  });

  test('substituto que se inscreveu na categoria depois do convite é barrado', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await call(callables.registerSolo, c, {tournamentId, categoryId: 'masc'});
    const msg = await callExpectingError(callables.acceptInvite, c, {inviteId});
    assert.match(msg, /já possui inscrição/i);
  });

  test('equipe: capitão troca membro; uniformByUid e memberUids acompanham', async () => {
    const cap = await seedMan({uid: 'cap'});
    const m1 = await seedMan({uid: 'm1'});
    const m2 = await seedMan({uid: 'm2'});
    const sub = await seedMan({uid: 'sub'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'trio', categoryName: 'Trio Livre', teamSize: 3, genderMode: 'free', uniformType: 'top_only'})],
    });
    const {registrationId, teamId} = await formTeam({
      tournamentId, categoryId: 'trio', captainUid: cap, memberUids: [m1, m2],
    });
    await call(callables.setUniform, m1, {registrationId, uniform: {sizeTop: 'M'}});

    const inviteId = await enviarConvite({registrationId, replacedUid: m1, inviteeUid: sub, inviterUid: cap});
    await call(callables.acceptInvite, sub, {inviteId, inviteeUniform: {sizeTop: 'G'}});

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.participantUids, [cap, sub, m2], 'posição preservada');
    assert.equal(reg.uniformByUid?.[m1], undefined, 'uniforme de quem saiu é removido');
    assert.equal(reg.uniformByUid?.[sub]?.sizeTop, 'G');
    assert.equal(reg.partnerPending, false, 'troca não reabre o elenco');

    const team = await getTeam(teamId);
    assert.deepEqual(team.memberUids, [cap, sub, m2]);
  });

  test('aceite mata o convite concorrente da mesma vaga e os convites do substituto na categoria', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    // Convite de dupla pendente PARA o substituto na mesma categoria.
    const d = await seedMan({uid: 'davi-d'});
    const {inviteId: conviteDeD} = await call(callables.sendInvite, d, {
      tournamentId, categoryId: 'masc', inviteeUid: c, inviteeName: 'Atleta C', inviterName: 'Davi',
    });

    await call(callables.acceptInvite, c, {inviteId});
    assert.equal((await getInvite(conviteDeD)).status, 'stale');
  });
});

describe('substituição — motivo', () => {
  test('motivo viaja do envio à história e ao organizador', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    await db.doc(`tournaments/${tournamentId}`).set({managerId: 'org-1'}, {merge: true});

    const {inviteId} = await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
      reason: 'lesao', reasonNote: 'Torceu o tornozelo',
    }));

    const invite = await getInvite(inviteId);
    assert.equal(invite.reason, 'lesao');
    assert.equal(invite.reasonNote, 'Torceu o tornozelo');

    await call(callables.acceptInvite, c, {inviteId});

    const reg = await getRegistration(registrationId);
    assert.equal(reg.substitutionHistory[0].reason, 'lesao');
    assert.equal(reg.substitutionHistory[0].reasonNote, 'Torceu o tornozelo');

    const notifications = await db.collection('users/org-1/notifications').get();
    const completed = notifications.docs.find((d) => d.data().type === 'tournament_substitution_completed');
    assert.ok(completed, 'organizador foi notificado');
    assert.match(completed.data().body, /Lesão/);
  });

  test('motivo inválido e nota longa são recusados', async () => {
    const {a, b, c, registrationId} = await duplaFormada();

    const reasonMsg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c, reason: 'xpto',
    }));
    assert.match(reasonMsg, /motivo/i);

    const noteMsg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c, reasonNote: 'x'.repeat(301),
    }));
    assert.match(noteMsg, /300|caracteres/i);
  });
});

describe('substituição — recusa e publicação da chave', () => {
  test('recusa notifica quem iniciou', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    await call(callables.cancelInvite, c, {inviteId, asDecline: true});

    assert.equal((await getInvite(inviteId)).status, 'declined');
    const notifications = await db.collection(`users/${a}/notifications`).get();
    const types = notifications.docs.map((d) => d.data().type);
    assert.ok(types.includes('tournament_substitution_declined'));
  });

  test('publicar a chave marca stale os convites de substituição pendentes da categoria', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const count = await markStaleSubstitutionInvitesForCategory(db, tournamentId, 'masc');

    assert.equal(count, 1);
    const invite = await getInvite(inviteId);
    assert.equal(invite.status, 'stale');
    assert.equal(invite.staleReason, 'bracket_published');
  });
});

describe('substituição — visualização', () => {
  test('convidado marca como visto; segunda chamada é no-op', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const first = await call(callables.markViewed, c, {inviteId});
    assert.equal(first.ok, true);
    assert.equal(first.alreadyViewed, false);
    const viewedAt = (await getInvite(inviteId)).viewedAt;
    assert.ok(viewedAt, 'viewedAt gravado na primeira chamada');

    const second = await call(callables.markViewed, c, {inviteId});
    assert.equal(second.ok, true);
    assert.equal(second.alreadyViewed, true);
    const viewedAtAfter = (await getInvite(inviteId)).viewedAt;
    assert.equal(viewedAtAfter.toMillis(), viewedAt.toMillis(), 'segunda chamada não reescreve o timestamp');
  });

  test('quem convidou não marca como visto', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const msg = await callExpectingError(callables.markViewed, a, {inviteId});
    assert.match(msg, /não é para você/i);
  });

  test('convite já aceito não pode mais ser marcado como visto', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await call(callables.acceptInvite, c, {inviteId});

    const msg = await callExpectingError(callables.markViewed, c, {inviteId});
    assert.match(msg, /não está mais pendente/i);
  });
});

describe('substituição — lembrete', () => {
  test('quem convidou reenvia: notificação nova no inbox e lastReminderAt gravado', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const result = await call(callables.resendSubstitution, a, {inviteId});
    assert.equal(result.ok, true);

    const invite = await getInvite(inviteId);
    assert.ok(invite.lastReminderAt, 'lastReminderAt gravado');

    const notifications = await db.collection(`users/${c}/notifications`).get();
    const reminder = notifications.docs.find((d) => /Lembrete/.test(d.data().title ?? ''));
    assert.ok(reminder, 'convidado recebeu a notificação de lembrete');
    assert.equal(reminder.data().type, 'tournament_substitution_invite');
  });

  test('segunda chamada imediata é bloqueada pelo rate-limit', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    await call(callables.resendSubstitution, a, {inviteId});
    const msg = await callExpectingError(callables.resendSubstitution, a, {inviteId});
    assert.match(msg, /aguarde/i);
  });

  test('cooldown vencido libera novo lembrete', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    await call(callables.resendSubstitution, a, {inviteId});
    await db.doc(`${INVITES}/${inviteId}`).set(
      {lastReminderAt: Timestamp.fromMillis(Date.now() - 7 * 3600 * 1000)}, {merge: true},
    );

    const result = await call(callables.resendSubstitution, a, {inviteId});
    assert.equal(result.ok, true);
  });

  test('convidado não pode pedir lembrete', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});

    const msg = await callExpectingError(callables.resendSubstitution, c, {inviteId});
    assert.match(msg, /não é seu/i);
  });

  test('convite já aceito não recebe mais lembrete', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const inviteId = await enviarConvite({registrationId, replacedUid: b, inviteeUid: c, inviterUid: a});
    await call(callables.acceptInvite, c, {inviteId});

    const msg = await callExpectingError(callables.resendSubstitution, a, {inviteId});
    assert.match(msg, /não está mais pendente/i);
  });
});
