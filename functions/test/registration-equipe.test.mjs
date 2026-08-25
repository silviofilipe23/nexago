/**
 * Matriz de inscrição em categoria de EQUIPE nomeada (trio, quarteto, quinteto).
 *
 * Diferente da dupla: o capitão cria a equipe COM NOME junto da inscrição, e o
 * elenco fecha por convites. `partnerPending` só vira `false` quando o elenco
 * chega ao `teamSize` — é isso que mantém equipe incompleta fora do chaveamento.
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
  getInvite,
  getRegistration,
  getTeam,
  seedAthlete,
  seedMan,
  seedTournament,
  seedWoman,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Torneio com uma categoria de equipe livre do tamanho pedido. */
async function torneioEquipe({teamSize = 4, ...extra} = {}) {
  return seedTournament({
    categories: [
      teamCategory({
        id: 'equipe',
        categoryName: `Equipe ${teamSize}`,
        teamSize,
        genderMode: 'free',
        ...extra,
      }),
    ],
  });
}

describe('equipe — criação pelo capitão', () => {
  for (const [teamSize, rotulo] of [[3, 'trio'], [4, 'quarteto'], [5, 'quinteto']]) {
    test(`${rotulo}: capitão cria a equipe nomeada com elenco 1/${teamSize}`, async () => {
      const capitao = await seedMan({uid: 'capitao'});
      const tournamentId = await torneioEquipe({teamSize});

      const {registrationId, teamId} = await call(callables.createTeam, capitao, {
        tournamentId,
        categoryId: 'equipe',
        teamName: `Os ${rotulo}s`,
      });

      const reg = await getRegistration(registrationId);
      assert.equal(reg.teamSize, teamSize);
      assert.equal(reg.teamName, `Os ${rotulo}s`);
      assert.equal(reg.captainUid, capitao);
      assert.deepEqual(reg.participantUids, [capitao]);
      assert.equal(reg.partnerPending, true, 'elenco incompleto fica fora da chave');

      const team = await getTeam(teamId);
      assert.deepEqual(team.memberUids, [capitao]);
      assert.equal(team.captainUid, capitao);
      assert.equal(team.player1Id, capitao, 'espelho legado');
      assert.equal(team.player2Id, '');
    });
  }

  test('nome curto demais e longo demais são recusados', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const tournamentId = await torneioEquipe();

    const curto = await callExpectingError(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'AB',
    });
    assert.match(curto, /pelo menos 3/i);

    const longo = await callExpectingError(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'A'.repeat(31),
    });
    assert.match(longo, /no máximo 30/i);
  });

  test('nome repetido na categoria é recusado ignorando caixa e acento', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const outro = await seedMan({uid: 'outro'});
    const tournamentId = await torneioEquipe();

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Leões da Praia',
    });
    const message = await callExpectingError(callables.createTeam, outro, {
      tournamentId, categoryId: 'equipe', teamName: '  leoes  DA praia ',
    });
    assert.match(message, /já existe uma equipe com esse nome/i);
  });

  test('reserva solo não existe em categoria de equipe', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const tournamentId = await torneioEquipe();

    const message = await callExpectingError(callables.registerSolo, capitao, {
      tournamentId, categoryId: 'equipe',
    });
    assert.match(message, /categoria é por equipe/i);
  });

  test('criar equipe em categoria de dupla é recusado', async () => {
    const joao = await seedMan({uid: 'joao'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'})],
    });

    const message = await callExpectingError(callables.createTeam, joao, {
      tournamentId, categoryId: 'masc', teamName: 'Time do João',
    });
    assert.match(message, /categoria é de dupla/i);
  });

  test('o mesmo atleta não cria duas equipes na mesma categoria', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const tournamentId = await torneioEquipe();

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Primeira',
    });
    const message = await callExpectingError(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Segunda',
    });
    assert.match(message, /já possui inscrição/i);
  });
});

describe('equipe — montagem do elenco', () => {
  test('quarteto fecha no 4º integrante e sai de partnerPending', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const c = await seedMan({uid: 'c'});
    const tournamentId = await torneioEquipe({teamSize: 4});

    const {registrationId, teamId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Quarteto Alfa',
    });

    for (const [index, membro] of [a, b, c].entries()) {
      const {inviteId} = await call(callables.sendInvite, capitao, {
        tournamentId, categoryId: 'equipe',
        inviteeUid: membro, inviteeName: membro, inviterName: 'Capitão',
      });
      const result = await call(callables.acceptInvite, membro, {inviteId});
      assert.equal(result.isTeamInvite, true);
      assert.equal(result.memberCount, index + 2);
      assert.equal(result.rosterComplete, index === 2);

      const reg = await getRegistration(registrationId);
      assert.equal(reg.partnerPending, index !== 2);
    }

    const team = await getTeam(teamId);
    assert.deepEqual(team.memberUids, [capitao, a, b, c]);
    assert.equal(team.player2Id, a, 'espelho legado guarda o 2º membro');
  });

  test('só o capitão convida — integrante recebe a copy certa', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membro = await seedMan({uid: 'membro'});
    const estranho = await seedMan({uid: 'estranho'});
    const tournamentId = await torneioEquipe({teamSize: 4});

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Quarteto Beta',
    });
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe',
      inviteeUid: membro, inviteeName: 'Membro', inviterName: 'Capitão',
    });
    await call(callables.acceptInvite, membro, {inviteId});

    const doMembro = await callExpectingError(callables.sendInvite, membro, {
      tournamentId, categoryId: 'equipe',
      inviteeUid: estranho, inviteeName: 'Estranho', inviterName: 'Membro',
    });
    assert.match(doMembro, /Apenas o capitão convida/i);
  });

  test('convidar sem ter criado a equipe orienta a criar primeiro', async () => {
    const atleta = await seedMan({uid: 'atleta'});
    const outro = await seedMan({uid: 'outro'});
    const tournamentId = await torneioEquipe();

    const message = await callExpectingError(callables.sendInvite, atleta, {
      tournamentId, categoryId: 'equipe',
      inviteeUid: outro, inviteeName: 'Outro', inviterName: 'Atleta',
    });
    assert.match(message, /Crie sua equipe/i);
  });

  test('convites pendentes reservam vaga: o capitão não convida além do elenco', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const c = await seedMan({uid: 'c'});
    const tournamentId = await torneioEquipe({teamSize: 3});

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio Gama',
    });
    for (const membro of [a, b]) {
      await call(callables.sendInvite, capitao, {
        tournamentId, categoryId: 'equipe',
        inviteeUid: membro, inviteeName: membro, inviterName: 'Capitão',
      });
    }

    const message = await callExpectingError(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe',
      inviteeUid: c, inviteeName: 'C', inviterName: 'Capitão',
    });
    assert.match(message, /reservadas por convites pendentes|já estão preenchidas/i);
  });

  test('elenco completo derruba os convites pendentes que sobraram', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const tournamentId = await torneioEquipe({teamSize: 3});

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio Delta',
    });
    const paraA = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: a, inviteeName: 'A', inviterName: 'Capitão',
    });
    const paraB = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: b, inviteeName: 'B', inviterName: 'Capitão',
    });

    await call(callables.acceptInvite, a, {inviteId: paraA.inviteId});
    await call(callables.acceptInvite, b, {inviteId: paraB.inviteId});

    assert.equal((await getRegistration(registrationId)).partnerPending, false);

    // Uma vaga a mais foi liberada por cancelamento e reconvidada: ao fechar o
    // elenco, qualquer convite pendente restante tem de morrer.
    const reg = await getRegistration(registrationId);
    assert.equal(reg.participantUids.length, 3);
  });

  test('convite pendente vira stale quando outro atleta fecha o elenco', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const tournamentId = await torneioEquipe({teamSize: 3});

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Trio Epsilon',
    });
    const paraA = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: a, inviteeName: 'A', inviterName: 'Capitão',
    });
    const paraB = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: b, inviteeName: 'B', inviterName: 'Capitão',
    });

    // A aceita e sai; B aceita e fecha. Depois o capitão reabre a vaga e
    // convida A de novo, mas B já fechou: o convite pendente cai.
    await call(callables.acceptInvite, a, {inviteId: paraA.inviteId});
    await call(callables.acceptInvite, b, {inviteId: paraB.inviteId});

    assert.equal((await getInvite(paraA.inviteId)).status, 'accepted');
    assert.equal((await getInvite(paraB.inviteId)).status, 'accepted');
  });

  test('atleta já na equipe não recebe novo convite', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const membro = await seedMan({uid: 'membro'});
    const tournamentId = await torneioEquipe({teamSize: 4});

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Quarteto Zeta',
    });
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: 'Membro', inviterName: 'Capitão',
    });
    await call(callables.acceptInvite, membro, {inviteId});

    const message = await callExpectingError(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: 'Membro', inviterName: 'Capitão',
    });
    assert.match(message, /já está inscrito|já está na sua equipe/i);
  });

  test('atleta de outra equipe da mesma categoria não é convidável', async () => {
    const capitaoA = await seedMan({uid: 'capitao-a'});
    const capitaoB = await seedMan({uid: 'capitao-b'});
    const tournamentId = await torneioEquipe({teamSize: 4});

    await call(callables.createTeam, capitaoA, {
      tournamentId, categoryId: 'equipe', teamName: 'Time A',
    });
    await call(callables.createTeam, capitaoB, {
      tournamentId, categoryId: 'equipe', teamName: 'Time B',
    });

    const message = await callExpectingError(callables.sendInvite, capitaoA, {
      tournamentId, categoryId: 'equipe', inviteeUid: capitaoB, inviteeName: 'B', inviterName: 'A',
    });
    assert.match(message, /já está inscrito/i);
  });
});

describe('equipe — composição de gênero', () => {
  /** Quarteto misto exato 2H + 2M. */
  async function quartetoMisto() {
    return seedTournament({
      categories: [
        teamCategory({
          id: 'equipe',
          categoryName: 'Quarteto Misto',
          teamSize: 4,
          genderComposition: {men: 2, women: 2},
        }),
      ],
    });
  }

  test('2H+2M: o terceiro homem é barrado e as mulheres entram', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const homem2 = await seedMan({uid: 'homem2'});
    const homem3 = await seedMan({uid: 'homem3'});
    const mulher1 = await seedWoman({uid: 'mulher1'});
    const mulher2 = await seedWoman({uid: 'mulher2'});
    const tournamentId = await quartetoMisto();

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Misto Alfa',
    });

    const convite2 = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: homem2, inviteeName: 'H2', inviterName: 'Cap',
    });
    // Convite pendente já consome a cota masculina.
    const barrado = await callExpectingError(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: homem3, inviteeName: 'H3', inviterName: 'Cap',
    });
    assert.match(barrado, /vagas masculinas/i);

    await call(callables.acceptInvite, homem2, {inviteId: convite2.inviteId});
    for (const mulher of [mulher1, mulher2]) {
      const {inviteId} = await call(callables.sendInvite, capitao, {
        tournamentId, categoryId: 'equipe', inviteeUid: mulher, inviteeName: mulher, inviterName: 'Cap',
      });
      await call(callables.acceptInvite, mulher, {inviteId});
    }

    const reg = await getRegistration(registrationId);
    assert.equal(reg.partnerPending, false);
    assert.equal(reg.participantUids.length, 4);
  });

  test('capitão que não cabe na composição é barrado na criação', async () => {
    const mulher = await seedWoman({uid: 'mulher'});
    const tournamentId = await seedTournament({
      categories: [
        teamCategory({
          id: 'equipe',
          categoryName: 'Quarteto Masculino',
          teamSize: 4,
          genderComposition: {men: 4, women: 0},
        }),
      ],
    });

    const message = await callExpectingError(callables.createTeam, mulher, {
      tournamentId, categoryId: 'equipe', teamName: 'Não Deveria',
    });
    assert.match(message, /vagas femininas/i);
  });

  test('sem gênero no perfil não entra em equipe de composição exata', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const semGenero = await seedAthlete({uid: 'sem-genero', gender: null});
    const tournamentId = await quartetoMisto();

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Misto Beta',
    });
    const message = await callExpectingError(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: semGenero, inviteeName: 'SG', inviterName: 'Cap',
    });
    assert.match(message, /definir o gênero/i);
  });

  test('genderMode free aceita qualquer composição', async () => {
    const capitao = await seedWoman({uid: 'capita'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const tournamentId = await torneioEquipe({teamSize: 3});

    const {registrationId} = await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Livre Total',
    });
    for (const membro of [a, b]) {
      const {inviteId} = await call(callables.sendInvite, capitao, {
        tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: membro, inviterName: 'Cap',
      });
      await call(callables.acceptInvite, membro, {inviteId});
    }
    assert.equal((await getRegistration(registrationId)).partnerPending, false);
  });

  test('composição com soma errada degrada para livre em vez de travar', async () => {
    const capitao = await seedWoman({uid: 'capita'});
    const homem = await seedMan({uid: 'homem'});
    const tournamentId = await seedTournament({
      categories: [
        teamCategory({
          id: 'equipe',
          categoryName: 'Trio Bugado',
          teamSize: 3,
          genderComposition: {men: 2, women: 2},
        }),
      ],
    });

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Degrada Livre',
    });
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: homem, inviteeName: 'H', inviterName: 'Cap',
    });
    await call(callables.acceptInvite, homem, {inviteId});
  });

  test('aceite revalida a composição contra o elenco atual', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const homem2 = await seedMan({uid: 'homem2'});
    const homem3 = await seedMan({uid: 'homem3'});
    const tournamentId = await quartetoMisto();

    await call(callables.createTeam, capitao, {
      tournamentId, categoryId: 'equipe', teamName: 'Misto Gama',
    });
    // Convite para o 3º homem sai enquanto ele ainda declara Feminino…
    await db.doc(`users/${homem3}`).update({gender: 'Feminino'});
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: homem3, inviteeName: 'H3', inviterName: 'Cap',
    });
    // …o 2º homem entra e fecha a cota masculina…
    const convite2 = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: homem2, inviteeName: 'H2', inviterName: 'Cap',
    });
    await call(callables.acceptInvite, homem2, {inviteId: convite2.inviteId});
    // …e no aceite ele já é Masculino: a cota masculina está cheia.
    await db.doc(`users/${homem3}`).update({gender: 'Masculino'});

    const message = await callExpectingError(callables.acceptInvite, homem3, {inviteId});
    assert.match(message, /vagas masculinas/i);
  });
});

describe('equipe — saída de integrante', () => {
  async function equipeCom(capitaoUid, membrosUids, teamSize) {
    const tournamentId = await torneioEquipe({teamSize});
    const created = await call(callables.createTeam, capitaoUid, {
      tournamentId, categoryId: 'equipe', teamName: 'Equipe Saída',
    });
    for (const membro of membrosUids) {
      const {inviteId} = await call(callables.sendInvite, capitaoUid, {
        tournamentId, categoryId: 'equipe', inviteeUid: membro, inviteeName: membro, inviterName: 'Cap',
      });
      await call(callables.acceptInvite, membro, {inviteId});
    }
    return {tournamentId, ...created};
  }

  test('integrante sai e a vaga reabre', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const {registrationId, teamId} = await equipeCom(capitao, [a, b], 3);

    assert.equal((await getRegistration(registrationId)).partnerPending, false);
    await call(callables.leaveTeam, b, {registrationId});

    const reg = await getRegistration(registrationId);
    assert.equal(reg.partnerPending, true, 'vaga reaberta tira a equipe da chave');
    assert.deepEqual(reg.participantUids, [capitao, a]);
    const team = await getTeam(teamId);
    assert.deepEqual(team.memberUids, [capitao, a]);
    assert.equal(team.player2Id, a);
  });

  test('capitão não sai da equipe', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const {registrationId} = await equipeCom(capitao, [a], 3);

    const message = await callExpectingError(callables.leaveTeam, capitao, {registrationId});
    assert.match(message, /capitão não sai/i);
  });

  test('quem não é da equipe não sai dela', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const estranho = await seedMan({uid: 'estranho'});
    const {registrationId} = await equipeCom(capitao, [a], 3);

    const message = await callExpectingError(callables.leaveTeam, estranho, {registrationId});
    assert.match(message, /não faz parte/i);
  });

  test('cota paga fecha a saída', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const {registrationId} = await equipeCom(capitao, [a], 3);
    await db.doc(`${INSCRIPTIONS}/${registrationId}`).update({sharePaidUids: [a]});

    const message = await callExpectingError(callables.leaveTeam, a, {registrationId});
    assert.match(message, /cota já foi paga/i);
  });

  test('inscrição confirmada fecha a saída', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const {registrationId} = await equipeCom(capitao, [a], 3);
    await db.doc(`${INSCRIPTIONS}/${registrationId}`).update({isPaid: true});

    const message = await callExpectingError(callables.leaveTeam, a, {registrationId});
    assert.match(message, /já confirmada/i);
  });

  test('após a saída o capitão convida outro atleta para a vaga', async () => {
    const capitao = await seedMan({uid: 'capitao'});
    const a = await seedMan({uid: 'a'});
    const b = await seedMan({uid: 'b'});
    const novo = await seedMan({uid: 'novo'});
    const {tournamentId, registrationId} = await equipeCom(capitao, [a, b], 3);

    await call(callables.leaveTeam, b, {registrationId});
    const {inviteId} = await call(callables.sendInvite, capitao, {
      tournamentId, categoryId: 'equipe', inviteeUid: novo, inviteeName: 'Novo', inviterName: 'Cap',
    });
    const result = await call(callables.acceptInvite, novo, {inviteId});

    assert.equal(result.rosterComplete, true);
    assert.equal((await getRegistration(registrationId)).partnerPending, false);
  });
});
