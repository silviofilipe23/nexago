/**
 * Convite por LINK (parceiro sem conta) e cancelamento da própria inscrição.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTERNAL_INVITES,
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
  seedMan,
  seedTournament,
  seedWoman,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

const CAT = () => duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'});

describe('convite por link', () => {
  test('token vira convite de verdade no resgate', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {externalInviteId} = await call(callables.createExternalInvite, joao, {
      tournamentId, categoryId: 'masc',
    });
    const claim = await call(callables.claimExternalInvite, pedro, {externalInviteId});

    assert.ok(claim.inviteId);
    const invite = await getInvite(claim.inviteId);
    assert.equal(invite.inviterUid, joao, 'o convite nasce em nome de quem compartilhou');
    assert.equal(invite.inviteeUid, pedro);
    assert.equal(invite.status, 'pending');

    const result = await call(callables.acceptInvite, pedro, {inviteId: claim.inviteId});
    const reg = await getRegistration(result.registrationId);
    assert.deepEqual([...reg.participantUids].sort(), [joao, pedro].sort());
  });

  test('quem criou o link não resgata o próprio link', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {externalInviteId} = await call(callables.createExternalInvite, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.match(
      await callExpectingError(callables.claimExternalInvite, joao, {externalInviteId}),
      /seu próprio link/i,
    );
  });

  test('resgate é de uso único — o segundo atleta recebe recusa', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {externalInviteId} = await call(callables.createExternalInvite, joao, {
      tournamentId, categoryId: 'masc',
    });
    await call(callables.claimExternalInvite, pedro, {externalInviteId});

    assert.match(
      await callExpectingError(callables.claimExternalInvite, lucas, {externalInviteId}),
      /já foi usado por outro atleta/i,
    );
  });

  test('reentrada do mesmo atleta devolve o convite já criado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {externalInviteId} = await call(callables.createExternalInvite, joao, {
      tournamentId, categoryId: 'masc',
    });
    const primeiro = await call(callables.claimExternalInvite, pedro, {externalInviteId});
    const segundo = await call(callables.claimExternalInvite, pedro, {externalInviteId});

    assert.equal(segundo.inviteId, primeiro.inviteId);
  });

  test('recusa do convidado devolve o token para o dono reaproveitar', async () => {
    const joao = await seedMan({uid: 'joao'});
    const maria = await seedWoman({uid: 'maria'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {externalInviteId} = await call(callables.createExternalInvite, joao, {
      tournamentId, categoryId: 'masc',
    });
    // Maria não cabe na categoria masculina: a recusa é dela, não do link.
    assert.match(
      await callExpectingError(callables.claimExternalInvite, maria, {externalInviteId}),
      /não corresponde/i,
    );

    const externo = (await db.doc(`${EXTERNAL_INVITES}/${externalInviteId}`).get()).data();
    assert.equal(externo.status, 'pending', 'o token volta a valer');
    assert.equal(externo.claimedByUid, undefined);

    const claim = await call(callables.claimExternalInvite, pedro, {externalInviteId});
    assert.ok(claim.inviteId);
  });

  test('token expirado não é resgatado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {externalInviteId} = await call(callables.createExternalInvite, joao, {
      tournamentId, categoryId: 'masc',
    });
    await db.doc(`${EXTERNAL_INVITES}/${externalInviteId}`).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    assert.match(
      await callExpectingError(callables.claimExternalInvite, pedro, {externalInviteId}),
      /expirou/i,
    );
  });

  test('link de categoria fechada não é criado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', registrationClosed: true})],
    });

    assert.match(
      await callExpectingError(callables.createExternalInvite, joao, {
        tournamentId, categoryId: 'masc',
      }),
      /encerradas nesta categoria/i,
    );
  });

  test('link de categoria de EQUIPE anexa o convite à equipe do capitão', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membro = await seedMan({uid: 'membro'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'equipe', teamSize: 3, genderMode: 'free'})],
    });

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio do Link',
    });
    const {externalInviteId} = await call(callables.createExternalInvite, capitao, {
      tournamentId, categoryId: 'equipe',
    });
    const claim = await call(callables.claimExternalInvite, membro, {externalInviteId});

    const invite = await getInvite(claim.inviteId);
    assert.equal(invite.isTeamInvite, true);
    assert.equal(invite.attachRegistrationId, registrationId);
  });
});

describe('cancelamento da própria inscrição', () => {
  test('reserva solo sem pagamento é cancelada e o doc some', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    await call(callables.cancelRegistration, joao, {registrationId});

    assert.equal(await getRegistration(registrationId), null);
    assert.equal((await listRegistrations(tournamentId)).length, 0);
  });

  test('cancelar a reserva derruba os convites pendentes dela', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });

    await call(callables.cancelRegistration, joao, {registrationId});
    assert.equal((await getInvite(inviteId)).status, 'cancelled');
  });

  test('dupla formada: qualquer um dos dois cancela enquanto não há pagamento', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    const result = await call(callables.acceptInvite, pedro, {inviteId});

    await call(callables.cancelRegistration, pedro, {registrationId: result.registrationId});
    assert.equal(await getRegistration(result.registrationId), null);
    assert.equal(await getTeam(result.teamId), null, 'a equipe morre junto');
  });

  test('inscrição paga não é cancelada pelo atleta', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    await db.doc(`artifacts/${process.env.GCLOUD_PROJECT}/public/data/inscriptions/${registrationId}`)
      .update({isPaid: true, paidAmount: 100});

    const message = await callExpectingError(callables.cancelRegistration, joao, {registrationId});
    assert.match(message, /organizador|paga|confirmada/i);
    assert.ok(await getRegistration(registrationId), 'a inscrição continua de pé');
  });

  test('parcela paga de um dos atletas também fecha o cancelamento', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    await db.doc(`artifacts/${process.env.GCLOUD_PROJECT}/public/data/inscriptions/${registrationId}`)
      .update({sharePaidUids: [joao], paidAmount: 50});

    assert.ok(await callExpectingError(callables.cancelRegistration, joao, {registrationId}));
    assert.ok(await getRegistration(registrationId));
  });

  test('quem não é da inscrição não cancela', async () => {
    const joao = await seedMan({uid: 'joao'});
    const estranho = await seedMan({uid: 'estranho'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.match(
      await callExpectingError(callables.cancelRegistration, estranho, {registrationId}),
      /não é um dos atletas/i,
    );
  });

  test('em equipe, só o capitão cancela; integrante recebe o caminho certo', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membro = await seedMan({uid: 'membro'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'equipe', teamSize: 3, genderMode: 'free'})],
    });

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio Cancelável',
    });
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: 'M', inviterName: 'C',
    });
    await call(callables.acceptInvite, membro, {inviteId});

    assert.match(
      await callExpectingError(callables.cancelRegistration, membro, {registrationId}),
      /Sair da equipe/i,
    );

    await call(callables.cancelRegistration, capitao, {registrationId});
    assert.equal(await getRegistration(registrationId), null);
  });

  test('cancelar libera a categoria para uma nova inscrição do mesmo atleta', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const primeira = await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    await call(callables.cancelRegistration, joao, {registrationId: primeira.registrationId});
    const segunda = await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});

    assert.notEqual(segunda.registrationId, primeira.registrationId);
  });

  test('trilha de auditoria é gravada antes do delete', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    await call(callables.cancelRegistration, joao, {registrationId});

    const audit = await db.collection('tournamentRegistrationCancellations').get();
    assert.equal(audit.size, 1);
    assert.equal(audit.docs[0].data().registrationId, registrationId);
  });
});

describe('convites órfãos', () => {
  test('reservar solo depois de convidar derruba o convite pendente', async () => {
    // Comportamento atual (markStaleCreateInvitesAfterSolo): o convite "create"
    // do convidante morre quando ele reserva a vaga. Documentado aqui porque a
    // fusão attach daria conta do caso — se a regra mudar, este teste avisa.
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});

    assert.equal((await getInvite(inviteId)).status, 'stale');
    assert.equal((await getInvite(inviteId)).staleReason, 'solo_registered');
  });

  test('convite anexado à reserva sobrevive a uma nova reserva do convidado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await call(callables.registerSolo, pedro, {tournamentId, categoryId: 'masc'});

    assert.equal((await getInvite(inviteId)).status, 'pending');
    const result = await call(callables.acceptInvite, pedro, {inviteId});
    assert.ok(result.registrationId);
    assert.equal((await listRegistrations(tournamentId)).length, 1);
  });

  test('convite pendente não sobrevive a um doc de convite sem torneio', async () => {
    const pedro = await seedMan({uid: 'pedro'});
    await db.doc(`${INVITES}/orfao`).set({
      tournamentId: 'sumiu',
      categoryId: 'masc',
      inviterUid: 'joao',
      inviteeUid: pedro,
      status: 'pending',
      expiresAt: Timestamp.fromMillis(Date.now() + 3600_000),
    });

    assert.match(
      await callExpectingError(callables.acceptInvite, pedro, {inviteId: 'orfao'}),
      /Torneio não encontrado/i,
    );
  });
});
