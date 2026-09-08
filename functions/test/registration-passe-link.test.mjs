/**
 * Link de vaga ao portador: um link no grupo, N vagas, e o resgate vira PASSE NOMINAL.
 *
 * O que estes casos protegem é a diferença entre "abri 3 vagas" e "reabri a categoria": o
 * contador é a única coisa que segura o link, e ele precisa aguentar o mesmo atleta tocando
 * duas vezes, a vaga acabando no meio e o link sobrevivendo à revogação sem levar junto as
 * vagas que já viraram passe.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  SPOT_PASSES,
  SPOT_PASS_LINKS,
  Timestamp,
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

async function torneioLotado({maxTeams = 2, categoria} = {}) {
  const tournamentId = await seedTournament({
    waitlistEnabled: false,
    categories: [categoria ?? duplaCategory({id: CAT, categoryName: 'Dupla Masculina', maxTeams})],
  });
  await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
  await seedOccupiedRegistrations({tournamentId, categoryId: CAT, count: maxTeams});
  return tournamentId;
}

const criarLink = (tournamentId, spots = 2) =>
  call(callables.createSpotPassLink, ORGANIZADOR, {
    tournamentId, categoryId: CAT, spots, expiresInHours: 24,
  });

async function linkOf(linkId) {
  const snap = await db.doc(`${SPOT_PASS_LINKS}/${linkId}`).get();
  return snap.exists ? snap.data() : null;
}

async function capacityOf(tournamentId) {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  return snap.data().categories.find((c) => c.id === CAT).maxTeams;
}

describe('link de vaga — o contador é o que segura', () => {
  test('as vagas do link acabam, e a próxima pessoa é recusada', async () => {
    const [ana, bia, caio] = await Promise.all([
      seedMan({uid: 'ana'}), seedMan({uid: 'bia'}), seedMan({uid: 'caio'}),
    ]);
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 2);

    await call(callables.claimSpotPassLink, ana, {linkId});
    await call(callables.claimSpotPassLink, bia, {linkId});

    assert.equal((await linkOf(linkId)).remaining, 0);
    assert.equal((await linkOf(linkId)).status, 'exhausted');

    const message = await callExpectingError(callables.claimSpotPassLink, caio, {linkId});
    assert.match(message, /acabaram/i);
  });

  test('resgatar vira passe nominal, e a inscrição sobe o teto como qualquer passe', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 1);

    const claim = await call(callables.claimSpotPassLink, ana, {linkId});
    const pass = (await db.doc(`${SPOT_PASSES}/${claim.passId}`).get()).data();
    assert.equal(pass.athleteUid, ana);
    assert.equal(pass.status, 'active');
    assert.equal(pass.linkId, linkId);
    assert.equal(await capacityOf(tournamentId), 2);

    await call(callables.registerSolo, ana, {tournamentId, categoryId: CAT});
    assert.equal(await capacityOf(tournamentId), 3);
  });

  // Dois toques no link do WhatsApp não podem comer duas vagas.
  test('o mesmo atleta abrindo de novo recebe o passe que já tem', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 2);

    const first = await call(callables.claimSpotPassLink, ana, {linkId});
    const second = await call(callables.claimSpotPassLink, ana, {linkId});

    assert.equal(second.passId, first.passId);
    assert.equal(second.alreadyClaimed, true);
    assert.equal((await linkOf(linkId)).remaining, 1);
  });

  test('prazo vencido recusa', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 2);
    await db.doc(`${SPOT_PASS_LINKS}/${linkId}`).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });

    const message = await callExpectingError(callables.claimSpotPassLink, ana, {linkId});
    assert.match(message, /prazo/i);
  });

  test('link revogado recusa', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 2);

    await call(callables.revokeSpotPassLink, ORGANIZADOR, {linkId});

    const message = await callExpectingError(callables.claimSpotPassLink, ana, {linkId});
    assert.match(message, /cancelado/i);
  });

  // Revogar fecha a porta; não tira de quem já entrou.
  test('revogar não derruba a vaga já resgatada', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 2);
    const claim = await call(callables.claimSpotPassLink, ana, {linkId});

    await call(callables.revokeSpotPassLink, ORGANIZADOR, {linkId});

    const pass = (await db.doc(`${SPOT_PASSES}/${claim.passId}`).get()).data();
    assert.equal(pass.status, 'active');
    await call(callables.registerSolo, ana, {tournamentId, categoryId: CAT});
    assert.equal(await capacityOf(tournamentId), 3);
  });

  test('chave publicada mata o link mesmo com status active', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await torneioLotado();
    const {linkId} = await criarLink(tournamentId, 2);

    await publishBracket(tournamentId, CAT);

    const message = await callExpectingError(callables.claimSpotPassLink, ana, {linkId});
    assert.match(message, /chaves/i);
  });

  // O link é um atalho de LOTAÇÃO. Nível continua barrando — senão o caminho do grupo entraria
  // quem o caminho do nome recusa.
  test('o link não fura nível', async () => {
    const forte = await seedMan({uid: 'forte', level: 'open'});
    const tournamentId = await torneioLotado({
      categoria: duplaCategory({
        id: CAT, categoryName: 'Dupla Masculina', maxTeams: 2, level: 'Iniciante 1',
      }),
    });
    const {linkId} = await criarLink(tournamentId, 2);

    const message = await callExpectingError(callables.claimSpotPassLink, forte, {linkId});
    assert.match(message, /nível/i);
    assert.equal((await linkOf(linkId)).remaining, 2);
  });

  test('quem já está inscrito na categoria não gasta vaga do link', async () => {
    const ana = await seedMan({uid: 'ana'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: CAT, categoryName: 'Dupla Masculina', maxTeams: 4})],
    });
    await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
    await call(callables.registerSolo, ana, {tournamentId, categoryId: CAT});
    const {linkId} = await criarLink(tournamentId, 2);

    const message = await callExpectingError(callables.claimSpotPassLink, ana, {linkId});
    assert.match(message, /já tem inscrição/i);
    assert.equal((await linkOf(linkId)).remaining, 2);
  });

  test('um link não abre mais que o teto de vagas permitido', async () => {
    const tournamentId = await torneioLotado();
    const message = await callExpectingError(callables.createSpotPassLink, ORGANIZADOR, {
      tournamentId, categoryId: CAT, spots: 50,
    });
    assert.match(message, /no máximo/i);
  });

});
