/**
 * Passe de vaga: o organizador libera uma vaga NOMINAL numa categoria lotada e o atleta
 * convidado se inscreve sozinho, pelo fluxo normal.
 *
 * O que estes casos protegem, e que nenhum teste puro alcança: o teto da categoria sobe e desce
 * de verdade, na mesma transação da inscrição, e sobe UMA VEZ POR PASSE mesmo com dois
 * convidados entrando em sequência apertada.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  SPOT_PASSES,
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  publishBracket,
  seedMan,
  seedOccupiedRegistrations,
  seedTournament,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

const ORGANIZADOR = 'organizador-1';
const CAT = 'masc';

/** Torneio com a categoria LOTADA e sem fila: sem passe, ninguém mais entra. */
async function torneioLotado({maxTeams = 2, waitlistEnabled = false, requireFormedPair} = {}) {
  const tournamentId = await seedTournament({
    waitlistEnabled,
    requireFormedPair,
    categories: [duplaCategory({id: CAT, categoryName: 'Dupla Masculina', maxTeams})],
  });
  // `assertCanManageTournament` casa por `managerId`; o seed grava `organizerId`.
  await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
  await seedOccupiedRegistrations({tournamentId, categoryId: CAT, count: maxTeams});
  return tournamentId;
}

async function capacityOf(tournamentId) {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  return snap.data().categories.find((c) => c.id === CAT).maxTeams;
}

async function passOf(passId) {
  const snap = await db.doc(`${SPOT_PASSES}/${passId}`).get();
  return snap.exists ? snap.data() : null;
}

describe('passe de vaga — a vaga só existe quando o convidado usa', () => {
  test('sem passe, categoria lotada recusa', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();

    const message = await callExpectingError(callables.registerSolo, joao, {
      tournamentId, categoryId: CAT,
    });
    assert.match(message, /lotada/i);
  });

  test('com passe, o convidado entra e o teto sobe de 2 para 3', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();

    const {passId} = await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });
    // Enquanto o passe espera, a categoria continua lotada para todo mundo.
    assert.equal(await capacityOf(tournamentId), 2);

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: CAT,
    });

    assert.equal(await capacityOf(tournamentId), 3);
    const pass = await passOf(passId);
    assert.equal(pass.status, 'used');
    assert.equal(pass.usedRegistrationId, registrationId);
    assert.equal(pass.capacityExpanded, true);
  });

  test('o passe não vale em outra categoria', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      waitlistEnabled: false,
      categories: [
        duplaCategory({id: CAT, categoryName: 'Dupla Masculina', maxTeams: 2}),
        duplaCategory({id: 'outra', categoryName: 'Outra Dupla', maxTeams: 2}),
      ],
    });
    await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
    await seedOccupiedRegistrations({tournamentId, categoryId: CAT, count: 2});
    await seedOccupiedRegistrations({tournamentId, categoryId: 'outra', count: 2, prefix: 'o2'});

    await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: 'outra', athleteUid: joao,
    });

    const message = await callExpectingError(callables.registerSolo, joao, {
      tournamentId, categoryId: CAT,
    });
    assert.match(message, /lotada/i);
  });

  // A validade é CALCULADA: o passe morre com a chave mesmo constando `active` no documento.
  test('chave publicada mata o passe já ativo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();
    await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });

    await publishBracket(tournamentId, CAT);

    const message = await callExpectingError(callables.registerSolo, joao, {
      tournamentId, categoryId: CAT,
    });
    assert.match(message, /lotada/i);
  });

  test('revogar o passe fecha a porta de novo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();
    const {passId} = await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });

    await call(callables.revokeSpotPass, ORGANIZADOR, {passId});

    const message = await callExpectingError(callables.registerSolo, joao, {
      tournamentId, categoryId: CAT,
    });
    assert.match(message, /lotada/i);
    assert.equal((await passOf(passId)).status, 'revoked');
  });

  test('liberar duas vezes para o mesmo atleta devolve o mesmo passe', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();

    const first = await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });
    const second = await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });

    assert.equal(second.passId, first.passId);
    assert.equal(second.alreadyGranted, true);
  });

  // Um passe = uma vaga. Com o número velho do portão o segundo convidado acharia que ainda
  // cabia alguém e não subiria o teto — 4 inscrições num teto de 3.
  test('dois convidados sobem o teto duas vezes', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await torneioLotado();

    for (const uid of [joao, pedro]) {
      await call(callables.grantSpotPass, ORGANIZADOR, {
        tournamentId, categoryId: CAT, athleteUid: uid,
      });
      await call(callables.registerSolo, uid, {tournamentId, categoryId: CAT});
    }

    assert.equal(await capacityOf(tournamentId), 4);
  });

  test('cancelar devolve a vaga e revive o passe', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();
    const {passId} = await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });
    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: CAT,
    });
    assert.equal(await capacityOf(tournamentId), 3);

    await call(callables.cancelRegistration, joao, {registrationId});

    assert.equal(await capacityOf(tournamentId), 2);
    const pass = await passOf(passId);
    assert.equal(pass.status, 'active');
    assert.equal(pass.usedRegistrationId, undefined);
  });

  // O dono do passe é o CONVIDANTE, mas quem chama o aceite é o parceiro.
  test('dupla já formada: a inscrição nasce no aceite e usa o passe de quem convidou', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await torneioLotado({requireFormedPair: true});
    const {passId} = await call(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: CAT, inviteeUid: pedro, inviteeName: 'Pedro', inviterName: 'João',
    });
    await call(callables.acceptInvite, pedro, {inviteId});

    assert.equal(await capacityOf(tournamentId), 3);
    assert.equal((await passOf(passId)).status, 'used');
  });

  test('não libera vaga para quem já está inscrito na categoria', async () => {
    const joao = await seedMan({uid: 'joao'});
    // Categoria com folga: aqui o que se testa é a inscrição já existente, não a lotação.
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: CAT, categoryName: 'Dupla Masculina', maxTeams: 4})],
    });
    await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
    await call(callables.registerSolo, joao, {tournamentId, categoryId: CAT});

    const message = await callExpectingError(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });
    assert.match(message, /já tem inscrição/i);
  });

  test('não libera vaga depois da chave publicada', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await torneioLotado();
    await publishBracket(tournamentId, CAT);

    const message = await callExpectingError(callables.grantSpotPass, ORGANIZADOR, {
      tournamentId, categoryId: CAT, athleteUid: joao,
    });
    assert.match(message, /chaves/i);
  });
});
