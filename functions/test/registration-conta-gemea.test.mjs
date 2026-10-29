/**
 * Conta gêmea (a mesma pessoa com duas contas), provada pelas callables reais
 * contra o emulador: o teste de unidade prova a regra, este prova a fiação.
 *
 * Rodar (na pasta functions/): npm run test:registrations
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  call,
  callExpectingError,
  callables,
  clearFirestore,
  db,
  duplaCategory,
  formDupla,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

const ORGANIZADOR = 'organizador-1';
const WHATSAPP = '(62) 98888-7777';

async function torneioDupla() {
  const tournamentId = await seedTournament({
    categories: [
      duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'}),
      duplaCategory({id: 'masc-b', categoryName: 'Dupla Masculina B'}),
    ],
  });
  await db.doc(`tournaments/${tournamentId}`).set({managerId: ORGANIZADOR}, {merge: true});
  return tournamentId;
}

/** A conta antiga e a nova da mesma pessoa: mesmo WhatsApp (com grafias diferentes). */
async function contasGemeas() {
  const antiga = await seedMan({uid: 'conta-antiga', phoneNumber: WHATSAPP, birthDate: '1990-05-17'});
  const nova = await seedMan({uid: 'conta-nova', phoneNumber: '+5562988887777', birthDate: '17/05/1990'});
  return {antiga, nova};
}

describe('conta gêmea', () => {
  test('reserva solo da conta nova é barrada quando a antiga já está na categoria', async () => {
    const tournamentId = await torneioDupla();
    const {antiga, nova} = await contasGemeas();
    const parceiro = await seedMan({uid: 'parceiro'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: antiga, inviteeUid: parceiro});

    const message = await callExpectingError(callables.registerSolo, nova, {
      tournamentId, categoryId: 'masc',
    });

    assert.match(message, /Outra conta com o seu WhatsApp/);
  });

  test('o convite para a conta gêmea de quem já está inscrito é barrado com o nome dela', async () => {
    const tournamentId = await torneioDupla();
    const {antiga, nova} = await contasGemeas();
    const parceiro = await seedMan({uid: 'parceiro'});
    const outro = await seedMan({uid: 'outro'});
    await db.doc(`users/${nova}`).set({fullName: 'Pedro Novo'}, {merge: true});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: antiga, inviteeUid: parceiro});

    const message = await callExpectingError(callables.sendInvite, outro, {
      tournamentId, categoryId: 'masc', inviteeUid: nova, inviteeName: 'Pedro', inviterName: 'Outro',
    });

    assert.match(message, /^Pedro Novo já está nesta categoria por outra conta/);
  });

  test('a mesma pessoa não forma dupla consigo mesma', async () => {
    const tournamentId = await torneioDupla();
    const {antiga, nova} = await contasGemeas();

    const message = await callExpectingError(callables.sendInvite, antiga, {
      tournamentId, categoryId: 'masc', inviteeUid: nova, inviteeName: 'Eu', inviterName: 'Eu',
    });

    assert.match(message, /mesma pessoa/);
  });

  test('o aceite revalida: a outra conta entrou depois do convite', async () => {
    const tournamentId = await torneioDupla();
    const {antiga, nova} = await contasGemeas();
    const parceiro = await seedMan({uid: 'parceiro'});
    const outro = await seedMan({uid: 'outro'});
    const {inviteId} = await call(callables.sendInvite, outro, {
      tournamentId, categoryId: 'masc', inviteeUid: nova, inviteeName: 'Pedro', inviterName: 'Outro',
    });
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: antiga, inviteeUid: parceiro});

    const message = await callExpectingError(callables.acceptInvite, nova, {inviteId});

    assert.match(message, /Outra conta com o seu WhatsApp/);
  });

  test('outra categoria do mesmo torneio continua liberada', async () => {
    const tournamentId = await torneioDupla();
    const {antiga, nova} = await contasGemeas();
    const parceiro = await seedMan({uid: 'parceiro'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: antiga, inviteeUid: parceiro});

    const result = await call(callables.registerSolo, nova, {tournamentId, categoryId: 'masc-b'});

    assert.ok(result.registrationId);
  });

  test('pai e filho com o mesmo WhatsApp e nascimentos diferentes formam dupla', async () => {
    const tournamentId = await torneioDupla();
    const pai = await seedMan({uid: 'pai', phoneNumber: WHATSAPP, birthDate: '1975-02-10'});
    const filho = await seedMan({uid: 'filho', phoneNumber: WHATSAPP, birthDate: '2008-09-01'});

    const result = await formDupla({tournamentId, categoryId: 'masc', inviterUid: pai, inviteeUid: filho});

    assert.ok(result.registrationId);
  });

  test('equipe: o capitão que já está na categoria por outra conta é barrado', async () => {
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'trio', teamSize: 3})],
    });
    const {antiga, nova} = await contasGemeas();
    await call(callables.createTeam, antiga, {tournamentId, categoryId: 'trio', teamName: 'Antiga'});

    const message = await callExpectingError(callables.createTeam, nova, {
      tournamentId, categoryId: 'trio', teamName: 'Nova',
    });

    assert.match(message, /Outra conta com o seu WhatsApp/);
  });

  test('o organizador continua podendo inscrever (é a saída do falso positivo)', async () => {
    const tournamentId = await torneioDupla();
    const {antiga, nova} = await contasGemeas();
    const parceiro = await seedMan({uid: 'parceiro'});
    const outro = await seedMan({uid: 'outro'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: antiga, inviteeUid: parceiro});

    const result = await call(callables.organizerCreateRegistration, ORGANIZADOR, {
      tournamentId, categoryId: 'masc', athleteUids: [nova, outro], markAsPaid: true,
    });

    assert.ok(result.registrationId);
  });
});
