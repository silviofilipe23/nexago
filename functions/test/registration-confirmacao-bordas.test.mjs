/**
 * Fechamento da inscrição (categoria gratuita e pagamento direto com o
 * organizador) e bordas: categoria legada referenciada por nome, várias
 * categorias, corrida entre dois aceites.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  INSCRIPTIONS,
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  getRegistration,
  listRegistrations,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Dupla formada pelo caminho convite → aceite. */
async function duplaFormada({tournamentId, categoryId, a, b}) {
  const {inviteId} = await call(callables.sendInvite, a, {
    tournamentId, categoryId, inviteeUid: b, inviteeName: 'B', inviterName: 'A',
  });
  return call(callables.acceptInvite, b, {inviteId});
}

describe('categoria gratuita — confirmação sem pagamento', () => {
  test('a dupla só fica confirmada quando os DOIS confirmam', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 0})],
    });

    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    const primeiro = await call(callables.confirmFree, joao, {registrationId});
    assert.equal(primeiro.isPaid, false, 'um só não confirma a dupla');
    assert.equal((await getRegistration(registrationId)).isPaid, false);

    const segundo = await call(callables.confirmFree, pedro, {registrationId});
    assert.equal(segundo.isPaid, true);

    const reg = await getRegistration(registrationId);
    assert.equal(reg.isPaid, true);
    assert.deepEqual([...reg.sharePaidUids].sort(), [joao, pedro].sort());
  });

  test('confirmar duas vezes é recusado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 0})],
    });
    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    await call(callables.confirmFree, joao, {registrationId});
    assert.match(
      await callExpectingError(callables.confirmFree, joao, {registrationId}),
      /já confirmou/i,
    );
  });

  test('reserva solo gratuita não confirma sozinha', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 0})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    const result = await call(callables.confirmFree, joao, {registrationId});
    assert.equal(result.isPaid, false, 'elenco incompleto nunca conclui sozinho');
  });

  test('categoria com taxa recusa a confirmação gratuita', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 120})],
    });
    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    assert.match(
      await callExpectingError(callables.confirmFree, joao, {registrationId}),
      /taxa de inscrição/i,
    );
  });

  test('quarteto gratuito exige os quatro', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membros = [];
    for (const uid of ['m1', 'm2', 'm3']) membros.push(await seedMan({uid}));
    const tournamentId = await seedTournament({
      categories: [
        teamCategory({id: 'equipe', teamSize: 4, genderMode: 'free', entryFee: 0}),
      ],
    });

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Quarteto Free',
    });
    for (const membro of membros) {
      const {inviteId} = await call(callables.sendInvite, capitao, {
        tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: membro, inviterName: 'C',
      });
      await call(callables.acceptInvite, membro, {inviteId});
    }

    for (const uid of [capitao, ...membros.slice(0, 2)]) {
      const parcial = await call(callables.confirmFree, uid, {registrationId});
      assert.equal(parcial.isPaid, false);
    }
    const final = await call(callables.confirmFree, membros[2], {registrationId});
    assert.equal(final.isPaid, true);
  });
});

describe('pagamento direto com o organizador', () => {
  async function torneioDireto() {
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 150})],
    });
    await db.doc(`tournaments/${tournamentId}`).update({
      paymentMode: 'directWithOrganizer',
    });
    return tournamentId;
  }

  test('cada atleta reserva a sua vaga e a dupla fecha no segundo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await torneioDireto();
    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    await call(callables.reserveDirect, joao, {registrationId});
    assert.equal((await getRegistration(registrationId)).isPaid, false);

    await call(callables.reserveDirect, pedro, {registrationId});
    const reg = await getRegistration(registrationId);
    assert.equal(reg.isPaid, true);
    assert.equal(reg.paymentChannel, 'directOrganizer');
    assert.ok(reg.declaredPaidAt, 'entra na fila de conferência do organizador');
  });

  test('torneio que não usa pagamento direto recusa a reserva', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 150})],
    });
    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    assert.match(
      await callExpectingError(callables.reserveDirect, joao, {registrationId}),
      /não usa pagamento direto/i,
    );
  });

  test('categoria gratuita recusa a reserva direta', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', entryFee: 0})],
    });
    await db.doc(`tournaments/${tournamentId}`).update({
      paymentMode: 'directWithOrganizer',
    });
    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    assert.match(
      await callExpectingError(callables.reserveDirect, joao, {registrationId}),
      /gratuita/i,
    );
  });

  test('reservar duas vezes é recusado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await torneioDireto();
    const {registrationId} = await duplaFormada({
      tournamentId, categoryId: 'masc', a: joao, b: pedro,
    });

    await call(callables.reserveDirect, joao, {registrationId});
    assert.match(
      await callExpectingError(callables.reserveDirect, joao, {registrationId}),
      /já reservou/i,
    );
  });
});

describe('bordas', () => {
  test('o mesmo atleta se inscreve em DUAS categorias do mesmo torneio', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc-a', categoryName: 'Masculina A'}),
        duplaCategory({id: 'masc-b', categoryName: 'Masculina B'}),
      ],
    });

    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc-a'});
    await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc-b'});

    assert.equal((await listRegistrations(tournamentId)).length, 2);
  });

  test('a mesma dupla joga em dois torneios diferentes', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const primeiro = await seedTournament({categories: [duplaCategory({id: 'masc'})]});
    const segundo = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    await duplaFormada({tournamentId: primeiro, categoryId: 'masc', a: joao, b: pedro});
    await duplaFormada({tournamentId: segundo, categoryId: 'masc', a: joao, b: pedro});

    assert.equal((await listRegistrations(primeiro)).length, 1);
    assert.equal((await listRegistrations(segundo)).length, 1);
  });

  test('inscrição legada gravada pelo NOME da categoria conta como já inscrito', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'})],
    });
    // Doc antigo: `categoryId` guarda o NOME, não o id.
    await db.collection(INSCRIPTIONS).add({
      tournamentId,
      categoryId: 'Dupla Masculina',
      player1Id: joao,
      participantUids: [joao],
      partnerPending: true,
      isPaid: false,
      paidAmount: 0,
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'masc',
      }),
      /já possui inscrição/i,
    );
  });

  test('dois aceites simultâneos do mesmo convidante geram UMA inscrição só', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const lucas = await seedMan({uid: 'lucas'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    const paraPedro = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    const paraLucas = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: lucas, inviteeName: 'L', inviterName: 'J',
    });

    const resultados = await Promise.allSettled([
      call(callables.acceptInvite, pedro, {inviteId: paraPedro.inviteId}),
      call(callables.acceptInvite, lucas, {inviteId: paraLucas.inviteId}),
    ]);

    const aceitos = resultados.filter((r) => r.status === 'fulfilled');
    assert.equal(aceitos.length, 1, 'só um aceite pode fechar a dupla');
    assert.equal((await listRegistrations(tournamentId)).length, 1);
  });

  test('duas reservas solo simultâneas do MESMO atleta geram uma vaga só', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    const resultados = await Promise.allSettled([
      call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
      call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'}),
    ]);

    const criadas = resultados.filter((r) => r.status === 'fulfilled');
    assert.equal(
      (await listRegistrations(tournamentId)).length,
      criadas.length,
      'nenhuma inscrição fantasma',
    );
    assert.equal(criadas.length, 1, 'duplo toque no botão não pode virar duas vagas');
  });

  test('duas criações de equipe simultâneas do MESMO capitão geram uma equipe só', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'equipe', teamSize: 4, genderMode: 'free'})],
    });

    const resultados = await Promise.allSettled([
      call(callables.createTeam, capitao, {
        tournamentId, categoryId: 'equipe', teamName: 'Quarteto Um',
      }),
      call(callables.createTeam, capitao, {
        tournamentId, categoryId: 'equipe', teamName: 'Quarteto Dois',
      }),
    ]);

    const criadas = resultados.filter((r) => r.status === 'fulfilled');
    assert.equal(criadas.length, 1, 'duplo toque em "Criar equipe" não pode virar duas equipes');
    assert.equal((await listRegistrations(tournamentId)).length, 1);
  });
});
