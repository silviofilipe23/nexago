/**
 * Uniforme e termo LGPD ao longo da inscrição.
 *
 * O uniforme é opcional na criação da vaga (coletado depois) e viaja junto do
 * convite quando informado; o aceite LGPD do convidante fica guardado no
 * convite e é copiado para a inscrição no aceite do convidado.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {
  call,
  callExpectingError,
  callables,
  clearFirestore,
  duplaCategory,
  getRegistration,
  getInvite,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

const UNIFORME_COMPLETO = {
  id: 'masc',
  categoryName: 'Dupla Masculina',
  uniformType: 'full',
  uniformNameOnShirt: true,
  uniformNumberOnShirt: true,
};

describe('uniforme — validação', () => {
  test('categoria sem uniforme não exige nada', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', uniformType: 'none'})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.ok(registrationId);
  });

  test('vaga nasce sem uniforme mesmo em categoria que exige', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory(UNIFORME_COMPLETO)],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    const reg = await getRegistration(registrationId);
    assert.equal(reg.sizeTopPlayer1, undefined, 'uniforme é coletado depois');
  });

  test('uniforme informado na reserva é gravado no slot do player1', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory(UNIFORME_COMPLETO)],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId,
      categoryId: 'masc',
      uniform: {sizeTop: 'G', sizeShorts: 'M', jerseyName: 'JOÃO', jerseyNumber: 7},
    });

    const reg = await getRegistration(registrationId);
    assert.equal(reg.sizeTopPlayer1, 'G');
    assert.equal(reg.sizeShortsPlayer1, 'M');
    assert.equal(reg.jerseyNamePlayer1, 'JOÃO');
    assert.equal(reg.jerseyNumberPlayer1, 7);
  });

  test('tamanho fora das opções da categoria é recusado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({
          id: 'masc',
          uniformType: 'top_only',
          uniformSizeOptionsTop: ['P', 'M'],
        }),
      ],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'masc', uniform: {sizeTop: 'XGG'},
      }),
      /Tamanho da regata inválido/i,
    );
  });

  test('categoria full sem shorts é recusada', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', uniformType: 'full'})],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'masc', uniform: {sizeTop: 'M'},
      }),
      /tamanho do shorts/i,
    );
  });

  test('número fora de 1–99 é recusado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', uniformType: 'top_only', uniformNumberOnShirt: true}),
      ],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'masc', uniform: {sizeTop: 'M', jerseyNumber: 100},
      }),
      /entre 1 e 99/i,
    );
  });

  test('nome na camisa obrigatório é exigido', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [
        duplaCategory({id: 'masc', uniformType: 'top_only', uniformNameOnShirt: true}),
      ],
    });

    assert.match(
      await callExpectingError(callables.registerSolo, joao, {
        tournamentId, categoryId: 'masc', uniform: {sizeTop: 'M'},
      }),
      /nome para a camisa/i,
    );
  });
});

describe('uniforme — ao longo do fluxo', () => {
  test('uniforme do convidante viaja no convite e cai no player1 da inscrição', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', uniformType: 'top_only'})],
    });

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
      inviterUniform: {sizeTop: 'GG'},
    });
    assert.equal((await getInvite(inviteId)).inviterSizeTop, 'GG');

    const result = await call(callables.acceptInvite, pedro, {
      inviteId,
      inviteeUniform: {sizeTop: 'P'},
    });
    const reg = await getRegistration(result.registrationId);
    assert.equal(reg.sizeTopPlayer1, 'GG');
    assert.equal(reg.sizeTopPlayer2, 'P');
  });

  test('em modo attach, quem entra ocupa o slot do player2', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', uniformType: 'top_only'})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc', uniform: {sizeTop: 'M'},
    });
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await call(callables.acceptInvite, pedro, {inviteId, inviteeUniform: {sizeTop: 'GG'}});

    const reg = await getRegistration(registrationId);
    assert.equal(reg.sizeTopPlayer1, 'M');
    assert.equal(reg.sizeTopPlayer2, 'GG');
  });

  test('setRegistrationUniform grava o uniforme na reserva solo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', uniformType: 'top_only'})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    await call(callables.setUniform, joao, {
      registrationId, uniform: {sizeTop: 'GG'},
    });

    assert.equal((await getRegistration(registrationId)).sizeTopPlayer1, 'GG');
  });

  test('setRegistrationUniform é recusado para quem não é da inscrição', async () => {
    const joao = await seedMan({uid: 'joao'});
    const estranho = await seedMan({uid: 'estranho'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', uniformType: 'top_only'})],
    });

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.match(
      await callExpectingError(callables.setUniform, estranho, {
        registrationId, uniform: {sizeTop: 'M'},
      }),
      /não é um dos atletas/i,
    );
  });

  test('em equipe o uniforme vai para uniformByUid, por atleta', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membro = await seedMan({uid: 'membro'});
    const tournamentId = await seedTournament({
      categories: [
        teamCategory({
          id: 'equipe', teamSize: 3, genderMode: 'free', uniformType: 'top_only',
        }),
      ],
    });

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio Uniforme',
      uniform: {sizeTop: 'M'},
    });
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: 'M', inviterName: 'C',
    });
    await call(callables.acceptInvite, membro, {inviteId, inviteeUniform: {sizeTop: 'GG'}});

    const reg = await getRegistration(registrationId);
    assert.equal(reg.uniformByUid[capitao].sizeTop, 'M');
    assert.equal(reg.uniformByUid[membro].sizeTop, 'GG');
  });
});

describe('LGPD', () => {
  test('aceite na reserva solo é gravado com a versão do termo', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc', lgpdAccepted: true,
    });

    const reg = await getRegistration(registrationId);
    assert.deepEqual(reg.lgpdAcceptedUids, [joao]);
    assert.ok(reg.lgpdTermVersion);
    assert.ok(reg.lgpdAcceptedAt[joao]);
  });

  test('sem aceite nada é gravado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc',
    });
    assert.equal((await getRegistration(registrationId)).lgpdAcceptedUids, undefined);
  });

  test('aceite dos dois atletas chega junto na inscrição criada pelo aceite', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
      lgpdAccepted: true,
    });
    assert.equal((await getInvite(inviteId)).inviterLgpdAccepted, true);

    const result = await call(callables.acceptInvite, pedro, {inviteId, lgpdAccepted: true});
    const reg = await getRegistration(result.registrationId);
    assert.deepEqual([...reg.lgpdAcceptedUids].sort(), [joao, pedro].sort());
  });

  test('em modo attach o aceite do convidado soma ao que a reserva já tinha', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    const {registrationId} = await call(callables.registerSolo, joao, {
      tournamentId, categoryId: 'masc', lgpdAccepted: true,
    });
    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await call(callables.acceptInvite, pedro, {inviteId, lgpdAccepted: true});

    const reg = await getRegistration(registrationId);
    assert.deepEqual([...reg.lgpdAcceptedUids].sort(), [joao, pedro].sort());
  });

  test('o aceite guardado na reserva LIBERADA não se perde na fusão', async () => {
    const joao = await seedMan({uid: 'joao'});
    const pedro = await seedMan({uid: 'pedro'});
    const tournamentId = await seedTournament({categories: [duplaCategory({id: 'masc'})]});

    // João reserva primeiro (sobrevive) SEM aceitar; Pedro reserva depois COM aceite.
    const doJoao = await call(callables.registerSolo, joao, {tournamentId, categoryId: 'masc'});
    await call(callables.registerSolo, pedro, {
      tournamentId, categoryId: 'masc', lgpdAccepted: true,
    });

    const {inviteId} = await call(callables.sendInvite, joao, {
      tournamentId, categoryId: 'masc', inviteeUid: pedro, inviteeName: 'P', inviterName: 'J',
    });
    await call(callables.acceptInvite, pedro, {inviteId});

    const reg = await getRegistration(doJoao.registrationId);
    assert.ok(
      reg.lgpdAcceptedUids?.includes(pedro),
      'o aceite que morava na reserva liberada foi carregado para a inscrição que sobreviveu',
    );
  });

  test('capitão de equipe registra o aceite na criação', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'equipe', teamSize: 3, genderMode: 'free'})],
    });

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio LGPD', lgpdAccepted: true,
    });
    assert.deepEqual((await getRegistration(registrationId)).lgpdAcceptedUids, [capitao]);
  });

  test('integrante de equipe soma o próprio aceite ao aceitar o convite', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membro = await seedMan({uid: 'membro'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'equipe', teamSize: 3, genderMode: 'free'})],
    });

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio LGPD 2', lgpdAccepted: true,
    });
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: 'M', inviterName: 'C',
    });
    await call(callables.acceptInvite, membro, {inviteId, lgpdAccepted: true});

    const reg = await getRegistration(registrationId);
    assert.deepEqual([...reg.lgpdAcceptedUids].sort(), [capitao, membro].sort());
  });
});
