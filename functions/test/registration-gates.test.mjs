/**
 * Gates da inscrição: estado do torneio, estado da categoria, perfil do
 * atleta, nível (anti-sandbagging), idade e capacidade/fila.
 *
 * Todos os caminhos de criação passam pelos mesmos guards, então cada regra é
 * verificada onde ela decide (`registerSolo`, `sendInvite`, `createTeam`) e,
 * quando muda de fase, também no aceite. Nível vale só na entrada: quem já
 * tem vaga e sobe depois não é barrado (pagar, fechar a dupla, trocar parceiro).
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  Timestamp,
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  formDupla,
  getRegistration,
  listRegistrations,
  seedAthlete,
  seedMan,
  seedOccupiedRegistrations,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

const CAT = () => duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'});

describe('gates — estado do torneio', () => {
  for (const status of ['draft', 'programado', 'cancelado', 'cancelled']) {
    test(`torneio "${status}" não aceita inscrição`, async () => {
      const joao = await seedMan({uid: 'joao'});
      const tournamentId = await seedTournament({
        listingStatus: status,
        categories: [CAT()],
      });

      const message = await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'masc',
      });
      assert.match(message, /não aceita novas inscrições/i);
    });
  }

  test('inscrições encerradas (listingStatus) bloqueiam reserva e convite', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      listingStatus: 'closed',
      categories: [CAT()],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /Inscrições encerradas/i,
    );
    assert.match(
      await callExpectingError(callables.sendInvite, joao, {
        tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
      }),
      /Inscrições encerradas/i,
    );
  });

  test('rótulo em português "Inscrições encerradas" também fecha', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      listingStatus: 'Inscrições encerradas',
      categories: [CAT()],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /Inscrições encerradas/i,
    );
  });

  test('prazo vencido bloqueia', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [CAT()],
      registrationClosesAt: Timestamp.fromMillis(Date.now() - 60_000),
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /Prazo de inscrição encerrado/i,
    );
  });

  test('prazo ainda não aberto bloqueia', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [CAT()],
      registrationOpensAt: Timestamp.fromMillis(Date.now() + 3_600_000),
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /ainda não iniciado/i,
    );
  });

  test('prazo que vence entre o convite e o aceite bloqueia o aceite', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await db.doc(`tournaments/${tournamentId}`).update({
      registrationClosesAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    assert.match(
      await callExpectingError(callables.acceptInvite, pedro, {inviteId}),
      /Prazo de inscrição encerrado/i,
    );
    assert.equal((await listRegistrations(tournamentId)).length, 0);
  });

  test('torneio inexistente devolve não encontrado', async () => {
    const joao = await seedMan({uid: 'joao'});
    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId: 'nao-existe', categoryId: 'masc',
      }),
      /não encontrado/i,
    );
  });
});

describe('gates — estado da categoria', () => {
  test('categoria com inscrições encerradas bloqueia', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', registrationClosed: true})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /encerradas nesta categoria/i,
    );
  });

  test('categoria concluída bloqueia', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', isCompleted: true})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /já concluída/i,
    );
  });

  test('categoria inexistente devolve não encontrada', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'nao-existe',
      }),
      /não encontrada/i,
    );
  });

  test('categoria lotada pela CONTAGEM REAL manda para a fila', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', maxTeams: 2})],
    });
    await seedOccupiedRegistrations({
      tournamentId, categoryId: 'masc', count: 2,
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.equal((await getRegistration(registrationId)).waitlist, true);
  });

  test('categoria lotada sem fila bloqueia a inscrição', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      waitlistEnabled: false,
      categories: [duplaCategory({id: 'masc', maxTeams: 2})],
    });
    await seedOccupiedRegistrations({
      tournamentId, categoryId: 'masc', count: 2,
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /lotada/i,
    );
    assert.equal((await listRegistrations(tournamentId)).length, 2);
  });

  test('a capacidade da categoria é respeitada de verdade', async () => {
    // Era o furo: `spotsLeft` nasce igual à capacidade e ninguém o decrementa,
    // então uma categoria de 1 dupla aceitava quantas quisesse. Agora a conta
    // vem dos documentos de inscrição.
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tiago = await seedMan({uid: 'tiago'});
    const tournamentId = await seedTournament({
      waitlistEnabled: false,
      categories: [duplaCategory({id: 'masc', maxTeams: 1})],
    });

    const primeiro = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await call(callables.acceptInvite, pedro, {inviteId: primeiro.inviteId});

    const message = await callExpectingError(callables.sendInvite, lucas, {
      tournamentId, categoryId: 'masc', inviteeUid: tiago, inviteeName: 'T', inviterName: 'L',
    });
    assert.match(message, /lotada/i);
    assert.equal((await listRegistrations(tournamentId)).length, 1);
  });

  test('reserva solo NÃO paga também ocupa vaga', async () => {
    const joao = await seedMan({uid: 'joao'});
    const maria = await seedMan({uid: 'maria'});
    const tournamentId = await seedTournament({
      waitlistEnabled: false,
      categories: [duplaCategory({id: 'masc', maxTeams: 1})],
    });

    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    assert.match(
      await callExpectingError(callables.registerSolo, maria, {tournamentId, categoryId: 'masc'}),
      /lotada/i,
    );
  });

  test('inscrição na FILA não ocupa vaga', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', maxTeams: 2})],
    });
    await seedOccupiedRegistrations({
      tournamentId, categoryId: 'masc', count: 3, waitlist: true,
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.notEqual(
      (await getRegistration(registrationId)).waitlist,
      true,
      'três na fila não podem lotar uma categoria de 2',
    );
  });

  test('cancelar uma inscrição devolve a vaga para a categoria', async () => {
    const joao = await seedMan({uid: 'joao'});
    const maria = await seedMan({uid: 'maria'});
    const tournamentId = await seedTournament({
      waitlistEnabled: false,
      categories: [duplaCategory({id: 'masc', maxTeams: 1})],
    });

    const primeira = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.match(
      await callExpectingError(callables.registerSolo, maria, {tournamentId, categoryId: 'masc'}),
      /lotada/i,
    );

    await call(callables.cancelRegistration, joao, {
      registrationId: primeira.registrationId,
    });
    const {registrationId} = await call(callables.registerSolo, maria, {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });

  test('categoria sem teto declarado não lota nem manda para a fila', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', maxTeams: 0})],
    });
    await seedOccupiedRegistrations({
      tournamentId, categoryId: 'masc', count: 5,
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.notEqual(
      (await getRegistration(registrationId)).waitlist,
      true,
      'sem teto não existe lotação',
    );
  });

  test('lotar uma categoria não fecha a outra', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      waitlistEnabled: false,
      categories: [
        duplaCategory({id: 'masc-a', categoryName: 'Masculina A', maxTeams: 1}),
        duplaCategory({id: 'masc-b', categoryName: 'Masculina B', maxTeams: 4}),
      ],
    });
    await seedOccupiedRegistrations({
      tournamentId, categoryId: 'masc-a', count: 1,
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc-b',
    });
    assert.ok(registrationId);
  });

  test('confirmar inscrição EXISTENTE em categoria cheia não a joga na fila', async () => {
    // A inscrição que está confirmando é uma das que enchem a categoria:
    // contá-la contra si mesma mandaria para a fila quem já tem a vaga.
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', maxTeams: 1, entryFee: 0})],
    });

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    const {registrationId} = await call(callables.acceptInvite, pedro, {inviteId});

    await call(callables.confirmFree, joao, {registrationId});
    await call(callables.confirmFree, pedro, {registrationId});

    const reg = await getRegistration(registrationId);
    assert.equal(reg.isPaid, true);
    assert.notEqual(reg.waitlist, true, 'quem já ocupa a vaga não entra na fila');
  });

});

describe('gates — perfil do atleta', () => {
  test('sem doc de usuário o cadastro inicial é exigido', async () => {
    const tournamentId = await seedTournament({categories: [CAT()]});
    assert.match(
      await callExpectingError(callables.registerSolo, 'fantasma', {
        tournamentId, categoryId: 'masc',
      }),
      /cadastro inicial/i,
    );
  });

  test('sem WhatsApp verificado o gate informa o que falta', async () => {
    const tournamentId = await seedTournament({categories: [CAT()]});
    await db.doc('users/joao').set({
      name: 'João',
      gender: 'Masculino',
      city: 'Goiânia',
      onboardingCompleted: true,
    });

    assert.match(
      await callExpectingError(callables.registerSolo, 'joao', {tournamentId, categoryId: 'masc'}),
      /WhatsApp/i,
    );
  });

  test('sem cidade o gate informa o que falta', async () => {
    const tournamentId = await seedTournament({categories: [CAT()]});
    await db.doc('users/joao').set({
      name: 'João',
      gender: 'Masculino',
      onboardingCompleted: true,
      phoneVerified: true,
    });

    assert.match(
      await callExpectingError(callables.registerSolo, 'joao', {tournamentId, categoryId: 'masc'}),
      /cidade/i,
    );
  });

  test('isProfileComplete legado libera o gate', async () => {
    const tournamentId = await seedTournament({categories: [CAT()]});
    await db.doc('users/joao').set({
      name: 'João',
      gender: 'Masculino',
      isProfileComplete: true,
    });

    const {registrationId} = await call(callables.registerSolo, 'joao', {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });

  test('perfil incompleto do CONVIDADO não impede o envio, mas trava o aceite', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});
    await db.doc('users/pedro').set({name: 'Pedro', gender: 'Masculino', city: 'Goiânia'});

    const result = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: 'pedro', inviteeName: 'P', inviterName: 'J',
    });
    assert.equal(result.inviteeProfileReady, false);
    assert.ok(result.inviteeMissingSteps.length > 0);

    assert.match(
      await callExpectingError(callables.acceptInvite, 'pedro', {inviteId: result.inviteId}),
      /cadastro inicial|Falta completar/i,
    );
  });
});

describe('gates — nível (anti-sandbagging)', () => {
  test('atleta forte não desce para categoria fraca', async () => {
    const joao = await seedMan({uid: 'joao', level: 'open'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', level: 'Iniciante 1'})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /abaixo do nível do atleta/i,
    );
  });

  test('atleta fraco não sobe acima do piso da categoria', async () => {
    const joao = await seedMan({uid: 'joao', level: 'iniciante_1'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', level: 'Avançado 1', minLevel: 'Intermediário 1'}),
      ],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /não atinge/i,
    );
  });

  test('categoria Open sem piso aceita qualquer nível', async () => {
    const joao = await seedMan({uid: 'joao', level: 'iniciante_1'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', level: 'Open'})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });

  test('na dupla, o parceiro forte barra a inscrição inteira', async () => {
    const fraco = await seedMan({uid: 'fraco', level: 'iniciante_1'});
    const forte = await seedMan({uid: 'forte', level: 'open'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', level: 'Iniciante 2'})],
    });

    assert.match(
      await callExpectingError(callables.sendInvite, fraco, {
        tournamentId, categoryId: 'masc', inviteeUid: forte, inviteeName: 'F', inviterName: 'Fr',
      }),
      /abaixo do nível do atleta/i,
    );
  });

  test('nível também vale para categoria de equipe', async () => {
    const capitao = await seedMan({uid: 'capitao', level: 'open'});
    const tournamentId = await seedTournament({
      categories: [
        teamCategory({id: 'equipe', teamSize: 4, genderMode: 'free', level: 'Iniciante 1'}),
      ],
    });

    assert.match(
      await callExpectingError(callables.createTeam, capitao, {
        tournamentId, categoryId: 'equipe', teamName: 'Fortes Demais',
      }),
      /abaixo do nível do atleta/i,
    );
  });
});

describe('gates — nível vale na entrada, não depois', () => {
  // Promoção automática da escada (ou do organizador) depois de o atleta já ter vaga.
  const subirNivel = (uid, level) =>
    db.doc(`users/${uid}`).set(
      {sportOnboarding: {levelsBySport: {BEACH_TENNIS: level}}},
      {merge: true},
    );
  const teto = (over = {}) =>
    duplaCategory({id: 'masc', level: 'Intermediário 1', ...over});

  test('quem subiu de nível depois de reservar ainda fecha a dupla', async () => {
    const joao = await seedMan({uid: 'joao', name: 'João', level: 'intermediario_1'});
    const pedro = await seedMan({uid: 'pedro', name: 'Pedro', level: 'intermediario_1'});
    const tournamentId = await seedTournament({categories: [teto()]});
    const solo = await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});

    await subirNivel(joao, 'intermediario_2');
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: joao, inviteeUid: pedro,
    });

    assert.equal(registrationId, solo.registrationId);
    const reg = await getRegistration(registrationId);
    assert.deepEqual([...reg.participantUids].sort(), [joao, pedro].sort());
    assert.notEqual(reg.partnerPending, true);
  });

  test('o parceiro novo continua passando pela régua', async () => {
    const joao = await seedMan({uid: 'joao', name: 'João', level: 'intermediario_1'});
    const forte = await seedMan({uid: 'forte', name: 'Forte', level: 'open'});
    const tournamentId = await seedTournament({categories: [teto()]});
    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    await subirNivel(joao, 'intermediario_2');

    const message = await callExpectingError(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: forte, inviteeName: 'F', inviterName: 'J',
    });
    assert.match(message, /Forte \(Open\) não pode/);
    assert.doesNotMatch(message, /João/);
  });

  test('dupla que nasce no aceite: os dois estão entrando', async () => {
    const joao = await seedMan({uid: 'joao', name: 'João', level: 'intermediario_1'});
    const pedro = await seedMan({uid: 'pedro', name: 'Pedro', level: 'intermediario_1'});
    const tournamentId = await seedTournament({categories: [teto()]});
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });

    await subirNivel(joao, 'intermediario_2');
    assert.match(
      await callExpectingError(callables.acceptInvite, pedro, {inviteId}),
      /João \(Intermediário 2\) não pode/,
    );
  });

  test('confirmar a inscrição gratuita depois de subir de nível', async () => {
    const joao = await seedMan({uid: 'joao', level: 'intermediario_1'});
    const pedro = await seedMan({uid: 'pedro', level: 'intermediario_1'});
    const tournamentId = await seedTournament({categories: [teto({entryFee: 0})]});
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: joao, inviteeUid: pedro,
    });

    await subirNivel(joao, 'open');
    await call(callables.confirmFree, joao, {registrationId});
    const result = await call(callables.confirmFree, pedro, {registrationId});
    assert.equal(result.isPaid, true);
  });

  test('declarar pagamento direto depois de subir de nível', async () => {
    const joao = await seedMan({uid: 'joao', level: 'intermediario_1'});
    const pedro = await seedMan({uid: 'pedro', level: 'intermediario_1'});
    const tournamentId = await seedTournament({categories: [teto()]});
    await db.doc(`tournaments/${tournamentId}`).update({paymentMode: 'directWithOrganizer'});
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: joao, inviteeUid: pedro,
    });

    await subirNivel(pedro, 'open');
    await call(callables.reserveDirect, joao, {registrationId});
    await call(callables.reserveDirect, pedro, {registrationId});
    assert.equal((await getRegistration(registrationId)).isPaid, true);
  });

  test('substituição: quem fica e subiu de nível não trava a troca', async () => {
    const a = await seedMan({uid: 'ana-a', name: 'Atleta A', level: 'intermediario_1'});
    const b = await seedMan({uid: 'beto-b', name: 'Atleta B', level: 'intermediario_1'});
    const c = await seedMan({uid: 'caio-c', name: 'Atleta C', level: 'intermediario_1'});
    const tournamentId = await seedTournament({categories: [teto()]});
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });

    await subirNivel(a, 'open');
    const {inviteId} = await call(callables.sendSubstitution, a, {
      registrationId, replacedUid: b, inviteeUid: c,
      replacedName: 'Atleta B', inviteeName: 'Atleta C', inviterName: 'Atleta A',
    });
    await call(callables.acceptInvite, c, {inviteId});

    const reg = await getRegistration(registrationId);
    assert.deepEqual([...reg.participantUids].sort(), [a, c].sort());
  });

  test('substituição: o substituto acima do teto continua barrado', async () => {
    const a = await seedMan({uid: 'ana-a', name: 'Atleta A', level: 'intermediario_1'});
    const b = await seedMan({uid: 'beto-b', name: 'Atleta B', level: 'intermediario_1'});
    const c = await seedMan({uid: 'caio-c', name: 'Atleta C', level: 'open'});
    const tournamentId = await seedTournament({categories: [teto()]});
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });

    assert.match(
      await callExpectingError(callables.sendSubstitution, a, {
        registrationId, replacedUid: b, inviteeUid: c,
        replacedName: 'Atleta B', inviteeName: 'Atleta C', inviterName: 'Atleta A',
      }),
      /Atleta C \(Open\) não pode/,
    );
  });

  test('capitão que subiu de nível ainda chama integrante', async () => {
    const capitao = await seedMan({uid: 'capitao', level: 'intermediario_1'});
    const membro = await seedMan({uid: 'membro', level: 'intermediario_1'});
    const tournamentId = await seedTournament({
      categories: [
        teamCategory({id: 'equipe', teamSize: 4, genderMode: 'free', level: 'Intermediário 1'}),
      ],
    });
    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Subiram Juntos',
    });

    await subirNivel(capitao, 'avancado_1');
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: 'M', inviterName: 'C',
    });
    await call(callables.acceptInvite, membro, {inviteId});

    const reg = await getRegistration(registrationId);
    assert.ok(reg.participantUids.includes(membro));
  });

  test('organizador fecha a dupla sobre a reserva de quem subiu de nível', async () => {
    const joao = await seedMan({uid: 'joao', level: 'intermediario_1'});
    const pedro = await seedMan({uid: 'pedro', level: 'intermediario_1'});
    const tournamentId = await seedTournament({categories: [teto()]});
    await db.doc(`tournaments/${tournamentId}`).set({managerId: 'organizador-1'}, {merge: true});
    const solo = await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});

    await subirNivel(joao, 'intermediario_2');
    const result = await call(callables.organizerCreateRegistration, 'organizador-1', {
      tournamentId, categoryId: 'masc', athleteUids: [joao, pedro], markAsPaid: true,
    });

    assert.equal(result.registrationId, solo.registrationId);
  });
});

describe('gates — idade', () => {
  const nascimento = (idade) => {
    const hoje = new Date();
    return `${hoje.getFullYear() - idade}-01-15`;
  };

  test('Sub-18 barra atleta de 30', async () => {
    const joao = await seedMan({uid: 'joao', birthDate: nascimento(30)});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', ageBand: 'sub18'})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /até 18 anos|não pode/i,
    );
  });

  test('+40 barra atleta de 30', async () => {
    const joao = await seedMan({uid: 'joao', birthDate: nascimento(30)});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', ageBand: 'plus40'})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /40\+|não pode/i,
    );
  });

  test('faixa 25–35 aceita atleta de 30', async () => {
    const joao = await seedMan({uid: 'joao', birthDate: nascimento(30)});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({
          id: 'masc',
          ageRestriction: {mode: 'range', minAge: 25, maxAge: 35, reference: 'tournamentStart'},
        }),
      ],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });

  test('sem data de nascimento a categoria com restrição bloqueia', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', ageBand: 'sub18'})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      /nascimento/i,
    );
  });

  test('categoria livre não exige data de nascimento', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', ageBand: 'open'})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });

  test('idade do parceiro também é validada no convite', async () => {
    const joao = await seedMan({uid: 'joao', birthDate: nascimento(16)});
    const velho = await seedMan({uid: 'velho', birthDate: nascimento(30)});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', ageBand: 'sub18'})],
    });

    assert.match(
      await callExpectingError(callables.sendInvite, joao, {
        tournamentId, categoryId: 'masc', inviteeUid: velho, inviteeName: 'V', inviterName: 'J',
      }),
      /até 18 anos|não pode/i,
    );
  });
});


describe('gates — dupla já formada (requireFormedPair)', () => {
  test('torneio que exige dupla formada recusa a reserva solo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      requireFormedPair: true,
      categories: [CAT()],
    });

    const message = await callExpectingError(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.match(message, /dupla já formada/i);
    assert.deepEqual(await listRegistrations(tournamentId), []);
  });

  test('o convite aceito continua criando a inscrição da dupla', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      requireFormedPair: true,
      categories: [CAT()],
    });

    await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: joao, inviteeUid: pedro,
    });

    const regs = await listRegistrations(tournamentId);
    assert.equal(regs.length, 1);
    // Inscrição nasce fechada: o par vem do aceite, sem passar por reserva solo.
    assert.notEqual(regs[0].partnerPending, true);
    assert.ok(regs[0].teamId);
    assert.deepEqual([...regs[0].participantUids].sort(), [joao, pedro].sort());
  });

  test('sem o flag, a reserva solo segue permitida', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [CAT()]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });
});
