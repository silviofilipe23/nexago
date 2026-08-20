/**
 * Matriz de inscrição em categoria de DUPLA.
 *
 * Cobre os quatro caminhos de entrada (reserva solo, convite direto, fusão de
 * duas reservas, convite do lado do convidado), a validação de gênero
 * (masculina/feminina/mista, declarado × ausente) e os conflitos de
 * duplicidade.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  INVITES,
  Timestamp,
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  getInvite,
  getRegistration,
  getTeam,
  listRegistrations,
  seedAthlete,
  seedMan,
  seedTournament,
  seedWoman,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Torneio com uma categoria de dupla masculina, o cenário mais comum. */
async function masculina(extra = {}) {
  return seedTournament({
    categories: [
      duplaCategory({
        id: 'masc',
        categoryName: 'Dupla Masculina',
        genderType: 'male',
        ...extra,
      }),
    ],
  });
}

describe('dupla — caminhos de entrada', () => {
  test('reserva solo guarda a vaga sem criar equipe', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await masculina();

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId,
      categoryId: 'masc',
    });

    const reg = await getRegistration(registrationId);
    assert.equal(reg.player1Id, joao);
    assert.deepEqual(reg.participantUids, [joao]);
    assert.equal(reg.partnerPending, true);
    assert.equal(reg.isPaid, false);
    assert.equal(reg.paidAmount, 0);
    // Dupla de um atleta só não deve existir em `teams`.
    assert.equal(reg.teamId, undefined);
  });

  test('convite direto sem reserva prévia cria a inscrição no aceite', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });

    // Nada foi criado ainda: convite não é inscrição.
    assert.equal((await listRegistrations(tournamentId)).length, 0);

    const result = await call(callables.acceptInvite, pedro, {inviteId});

    const reg = await getRegistration(result.registrationId);
    assert.deepEqual(reg.participantUids, [joao, pedro]);
    assert.equal(reg.partnerPending, undefined);
    const team = await getTeam(result.teamId);
    assert.equal(team.player1Id, joao);
    assert.equal(team.player2Id, pedro);
    assert.equal((await getInvite(inviteId)).status, 'accepted');
  });

  test('reserva solo do convidante recebe a dupla no aceite (attach)', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId,
      categoryId: 'masc',
    });
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    const result = await call(callables.acceptInvite, pedro, {inviteId});

    assert.equal(result.registrationId, registrationId);
    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.participantUids.sort(), [joao, pedro].sort());
    assert.equal(reg.partnerPending, false);
    const team = await getTeam(reg.teamId);
    assert.equal(team.player1Id, joao);
    assert.equal(team.player2Id, pedro);
    // Uma vaga só: nenhuma inscrição extra sobrou.
    assert.equal((await listRegistrations(tournamentId)).length, 1);
  });

  test('reserva solo do CONVIDADO recebe a dupla quando só ele reservou', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const {registrationId} = await call(callables.registerSolo, pedro, {
      tournamentId,
      categoryId: 'masc',
    });
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    const result = await call(callables.acceptInvite, pedro, {inviteId});

    assert.equal(result.registrationId, registrationId);
    const reg = await getRegistration(registrationId);
    assert.equal(reg.partnerPending, false);
    assert.deepEqual(reg.participantUids.sort(), [joao, pedro].sort());
    const team = await getTeam(reg.teamId);
    assert.equal(team.player1Id, pedro, 'o dono da reserva continua sendo o player1');
    assert.equal(team.player2Id, joao);
    assert.equal((await listRegistrations(tournamentId)).length, 1);
  });

  test('duas reservas solo se fundem em uma e a outra é liberada', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const primeira = await call(callables.registerSolo, joao, {
      tournamentId,
      categoryId: 'masc',
    });
    const segunda = await call(callables.registerSolo, pedro, {
      tournamentId,
      categoryId: 'masc',
    });
    assert.equal((await listRegistrations(tournamentId)).length, 2);

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    const result = await call(callables.acceptInvite, pedro, {inviteId});

    assert.equal(result.registrationId, primeira.registrationId, 'a mais antiga sobrevive');
    assert.equal(result.releasedRegistrationId, segunda.registrationId);
    assert.equal(await getRegistration(segunda.registrationId), null);
    const regs = await listRegistrations(tournamentId);
    assert.equal(regs.length, 1, 'a dupla ocupa uma vaga só');
    assert.equal(regs[0].partnerPending, false);
  });

  test('reserva PAGA sobrevive à fusão e o parceiro entra sem taxa', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const doJoao = await call(callables.registerSolo, joao, {
      tournamentId,
      categoryId: 'masc',
    });
    const doPedro = await call(callables.registerSolo, pedro, {
      tournamentId,
      categoryId: 'masc',
    });
    // Pedro pagou o valor integral da dupla na reserva dele.
    await db.doc(`artifacts/${process.env.GCLOUD_PROJECT}/public/data/inscriptions/${doPedro.registrationId}`)
      .update({isPaid: true, paidAmount: 100, sharePaidUids: [pedro]});

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    const result = await call(callables.acceptInvite, pedro, {inviteId});

    assert.equal(result.registrationId, doPedro.registrationId, 'dinheiro nunca é descartado');
    assert.equal(await getRegistration(doJoao.registrationId), null);
    const reg = await getRegistration(result.registrationId);
    assert.equal(reg.isPaid, true);
    assert.ok(reg.sharePaidUids.includes(joao), 'quem entra numa reserva paga não deve nada');
  });

  test('duas reservas PAGAS não se fundem — exigiria estorno', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const base = `artifacts/${process.env.GCLOUD_PROJECT}/public/data/inscriptions`;
    const doJoao = await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    const doPedro = await call(callables.registerSolo, pedro, {tournamentId, categoryId: 'masc'});
    await db.doc(`${base}/${doJoao.registrationId}`).update({isPaid: true, paidAmount: 100});
    await db.doc(`${base}/${doPedro.registrationId}`).update({isPaid: true, paidAmount: 100});

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    assert.match(message, /pagaram/i);
  });
});

describe('dupla — gênero', () => {
  test('categoria masculina recusa reserva solo de atleta feminina', async () => {
    const maria = await seedWoman({uid: 'maria'});
    const tournamentId = await masculina();

    const message = await callExpectingError(callables.registerSolo, maria, {
      tournamentId,
      categoryId: 'masc',
    });
    assert.match(message, /não corresponde/i);
    assert.equal((await listRegistrations(tournamentId)).length, 0);
  });

  test('categoria masculina recusa convite para atleta feminina', async () => {
    const joao = await seedMan({uid: 'joao'});
    const maria = await seedWoman({uid: 'maria'});
    const tournamentId = await masculina();

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: maria,
      inviteeName: 'Maria',
      inviterName: 'João',
    });
    assert.match(message, /não corresponde/i);
  });

  test('categoria feminina aceita dupla de duas atletas', async () => {
    const maria = await seedWoman({uid: 'maria'});
    const ana = await seedWoman({uid: 'ana'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'fem', categoryName: 'Dupla Feminina', genderType: 'female'}),
      ],
    });

    const {inviteId} = await call(callables.sendInvite, maria, {
      tournamentId,
      categoryId: 'fem',
      inviteeUid: ana,
      inviteeName: 'Ana',
      inviterName: 'Maria',
    });
    const result = await call(callables.acceptInvite, ana, {inviteId});
    const reg = await getRegistration(result.registrationId);
    assert.deepEqual(reg.participantUids, [maria, ana]);
  });

  test('dupla MISTA exige um homem e uma mulher', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const maria = await seedWoman({uid: 'maria'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'mista', categoryName: 'Dupla Mista', genderType: 'mixed'}),
      ],
    });

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'mista',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    assert.match(message, /mesmo gênero/i);

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'mista',
      inviteeUid: maria,
      inviteeName: 'Maria',
      inviterName: 'João',
    });
    const result = await call(callables.acceptInvite, maria, {inviteId});
    assert.ok(result.registrationId);
  });

  test('dupla mista reconhecida pelo NOME da categoria, sem genderType', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'mx', categoryName: 'Mista Iniciante', genderType: ''}),
      ],
    });

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'mx',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    });
    assert.match(message, /mesmo gênero/i);
  });

  test('gênero AUSENTE não bloqueia o convite, mas bloqueia o aceite', async () => {
    const joao = await seedMan({uid: 'joao'});
    const semGenero = await seedAthlete({uid: 'sem-genero', gender: null});
    const tournamentId = await masculina();

    const result = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: semGenero,
      inviteeName: 'Sem Gênero',
      inviterName: 'João',
    });
    assert.equal(result.inviteeProfileReady, false, 'a resposta avisa o convidante');

    const message = await callExpectingError(callables.acceptInvite, semGenero, {
      inviteId: result.inviteId,
    });
    assert.match(message, /Informe o gênero/i);
  });

  test('reserva solo exige gênero declarado em categoria de gênero fixo', async () => {
    const semGenero = await seedAthlete({uid: 'sem-genero', gender: null});
    const tournamentId = await masculina();

    const message = await callExpectingError(callables.registerSolo, semGenero, {
      tournamentId,
      categoryId: 'masc',
    });
    assert.match(message, /Informe o gênero/i);
  });

  test('categoria sem gênero declarado aceita qualquer dupla', async () => {
    const joao = await seedMan({uid: 'joao'});
    const maria = await seedWoman({uid: 'maria'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'livre', categoryName: 'Categoria A', genderType: ''})],
    });

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'livre',
      inviteeUid: maria,
      inviteeName: 'Maria',
      inviterName: 'João',
    });
    const result = await call(callables.acceptInvite, maria, {inviteId});
    assert.ok(result.registrationId);
  });

  test('gênero "Outro" não fecha dupla mista', async () => {
    const outro = await seedAthlete({uid: 'outro', gender: 'Outro'});
    const maria = await seedWoman({uid: 'maria'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'mista', categoryName: 'Dupla Mista', genderType: 'mixed'}),
      ],
    });

    const {inviteId} = await call(callables.sendInvite, maria, {
      tournamentId,
      categoryId: 'mista',
      inviteeUid: outro,
      inviteeName: 'Outro',
      inviterName: 'Maria',
    });
    const message = await callExpectingError(callables.acceptInvite, outro, {inviteId});
    assert.match(message, /Informe o gênero/i);
  });
});

describe('dupla — conflitos e duplicidade', () => {
  test('não é possível convidar a si mesmo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await masculina();

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: joao,
      inviteeName: 'João',
      inviterName: 'João',
    });
    assert.match(message, /si mesmo/i);
  });

  test('convite duplicado pendente para o mesmo parceiro é recusado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const payload = {
      tournamentId,
      categoryId: 'masc',
      inviteeUid: pedro,
      inviteeName: 'Pedro',
      inviterName: 'João',
    };
    await call(callables.sendInvite, joao, payload);
    const message = await callExpectingError(callables.sendInvite, joao, payload);
    assert.match(message, /convite pendente/i);
  });

  test('convidar dois parceiros ao mesmo tempo é permitido; o 1º aceite mata o outro', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tournamentId = await masculina();

    const a = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    const b = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: lucas, inviteeName: 'Lucas', inviterName: 'João',
    });

    await call(callables.acceptInvite, pedro, {inviteId: a.inviteId});

    assert.equal((await getInvite(b.inviteId)).status, 'stale');
    const message = await callExpectingError(callables.acceptInvite, lucas, {inviteId: b.inviteId});
    assert.match(message, /não está mais pendente/i);
  });

  test('reserva solo duplicada na mesma categoria é recusada', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await masculina();

    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    const message = await callExpectingError(callables.registerSolo, joao, {
      tournamentId,
      categoryId: 'masc',
    });
    assert.match(message, /já possui inscrição/i);
  });

  test('atleta com dupla fechada não recebe novo convite na categoria', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    await call(callables.acceptInvite, pedro, {inviteId});

    const message = await callExpectingError(callables.sendInvite, lucas, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'Lucas',
    });
    assert.match(message, /já está inscrito|já possui inscrição/i);
  });

  test('a mesma dupla não se inscreve duas vezes na categoria', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    await call(callables.acceptInvite, pedro, {inviteId});

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    assert.match(message, /Já existe uma dupla|já está inscrito|já possui inscrição/i);
  });

  test('aceitar convite de outra pessoa é bloqueado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    const message = await callExpectingError(callables.acceptInvite, lucas, {inviteId});
    assert.match(message, /não é para você/i);
  });

  test('convite expirado não pode ser aceito e vira expired', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    await db.doc(`${INVITES}/${inviteId}`).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    const message = await callExpectingError(callables.acceptInvite, pedro, {inviteId});
    assert.match(message, /expirou/i);
    assert.equal((await getInvite(inviteId)).status, 'expired');
  });

  test('convite expirado não bloqueia um novo convite para o mesmo parceiro', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const payload = {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    };
    const first = await call(callables.sendInvite, joao, payload);
    await db.doc(`${INVITES}/${first.inviteId}`).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    const second = await call(callables.sendInvite, joao, payload);
    assert.notEqual(second.inviteId, first.inviteId);
  });

  test('convite recusado libera o convidante para chamar outro atleta', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    await call(callables.cancelInvite, pedro, {inviteId, asDecline: true});

    assert.equal((await getInvite(inviteId)).status, 'declined');
    const novo = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    assert.ok(novo.inviteId);
  });

  test('só o convidado recusa; o convidante cancela', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tournamentId = await masculina();

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });

    const alheio = await callExpectingError(callables.cancelInvite, lucas, {inviteId});
    assert.match(alheio, /não pode cancelar/i);

    const recusaDoConvidante = await callExpectingError(callables.cancelInvite, joao, {
      inviteId,
      asDecline: true,
    });
    assert.match(recusaDoConvidante, /Apenas o convidado pode recusar/i);

    await call(callables.cancelInvite, joao, {inviteId});
    assert.equal((await getInvite(inviteId)).status, 'cancelled');
  });
});
