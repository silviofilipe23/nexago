/**
 * Identidade única da dupla, provada pelo caminho REAL: callables de verdade
 * contra o emulador.
 *
 * Os testes de unidade provam o helper isolado; a suíte antiga prova que nada
 * regrediu. Só este arquivo prova a promessa da entrega — que a mesma dupla,
 * inscrita em dois torneios, é UMA equipe — e a exceção deliberada, que duas
 * categorias do mesmo torneio continuam sendo duas.
 *
 * Rodar (na pasta functions/): npm run test:registrations
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  call,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  formDupla,
  formTeam,
  getTeam,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

const ORGANIZADOR = 'organizador-1';

/**
 * Torneio com uma categoria de dupla masculina, com `managerId` gravado.
 *
 * `assertCanManageTournament` (usado pela callable do organizador) casa por
 * `managerId`, mas `seedTournament` grava `organizerId` — mesmo descompasso já
 * documentado em `registration-passe-vaga.test.mjs`. Sem este merge, as
 * chamadas como ORGANIZADOR falhariam com "permission-denied".
 */
async function torneioDupla(categoryId = 'masc') {
  const tournamentId = await seedTournament({
    categories: [duplaCategory({id: categoryId, categoryName: 'Dupla Masculina'})],
  });
  await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
  return tournamentId;
}

describe('identidade única da dupla', () => {
  test('a mesma dupla em DOIS torneios é uma equipe só', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await formDupla({
      tournamentId: t1, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });
    const r2 = await formDupla({
      tournamentId: t2, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });

    assert.equal(r2.teamId, r1.teamId);
  });

  test('papéis invertidos no 2º torneio: mesma equipe, e os player ids NÃO mudam', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await formDupla({
      tournamentId: t1, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });
    const antes = await getTeam(r1.teamId);

    // Agora quem convida é o outro.
    const r2 = await formDupla({
      tournamentId: t2, categoryId: 'masc', inviterUid: b, inviteeUid: a,
    });

    assert.equal(r2.teamId, r1.teamId);
    const depois = await getTeam(r1.teamId);
    assert.equal(depois.player1Id, antes.player1Id);
    assert.equal(depois.player2Id, antes.player2Id);
  });

  test('duas categorias do MESMO torneio continuam sendo duas equipes', async () => {
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'}),
        duplaCategory({id: 'masc-b', categoryName: 'Dupla Masculina B'}),
      ],
    });
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await formDupla({
      tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });
    const r2 = await formDupla({
      tournamentId, categoryId: 'masc-b', inviterUid: a, inviteeUid: b,
    });

    assert.notEqual(r2.teamId, r1.teamId);
  });

  test('pelo ORGANIZADOR: a mesma dupla em dois torneios é uma equipe só', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await call(callables.organizerCreateRegistration, ORGANIZADOR, {
      tournamentId: t1, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true,
    });
    const r2 = await call(callables.organizerCreateRegistration, ORGANIZADOR, {
      tournamentId: t2, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true,
    });

    assert.equal(r2.teamId, r1.teamId);
  });

  test('as DUAS portas chegam na mesma equipe: organizador e convite', async () => {
    const t1 = await torneioDupla();
    const t2 = await torneioDupla();
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const peloOrganizador = await call(
      callables.organizerCreateRegistration, ORGANIZADOR,
      {tournamentId: t1, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true},
    );
    const peloConvite = await formDupla({
      tournamentId: t2, categoryId: 'masc', inviterUid: a, inviteeUid: b,
    });

    assert.equal(peloConvite.teamId, peloOrganizador.teamId);
  });

  test('pelo ORGANIZADOR: duas categorias do mesmo torneio continuam sendo duas', async () => {
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'}),
        duplaCategory({id: 'masc-b', categoryName: 'Dupla Masculina B'}),
      ],
    });
    await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});

    const r1 = await call(callables.organizerCreateRegistration, ORGANIZADOR, {
      tournamentId, categoryId: 'masc', athleteUids: [a, b], markAsPaid: true,
    });
    const r2 = await call(callables.organizerCreateRegistration, ORGANIZADOR, {
      tournamentId, categoryId: 'masc-b', athleteUids: [a, b], markAsPaid: true,
    });

    assert.notEqual(r2.teamId, r1.teamId);
  });

  test('equipe NOMEADA nunca deduplica: dois torneios, duas equipes', async () => {
    const t1 = await seedTournament({
      categories: [teamCategory({id: 'trio', teamSize: 3})],
    });
    const t2 = await seedTournament({
      categories: [teamCategory({id: 'trio', teamSize: 3})],
    });
    const a = await seedMan({uid: 'atleta-a'});
    const b = await seedMan({uid: 'atleta-b'});
    const c = await seedMan({uid: 'atleta-c'});

    const e1 = await formTeam({
      tournamentId: t1, categoryId: 'trio', captainUid: a, memberUids: [b, c],
    });
    const e2 = await formTeam({
      tournamentId: t2, categoryId: 'trio', captainUid: a, memberUids: [b, c],
    });

    assert.notEqual(e2.teamId, e1.teamId);
  });
});
