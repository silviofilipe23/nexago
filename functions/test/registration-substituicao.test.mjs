/**
 * Matriz da SUBSTITUIÇÃO de atleta: convite → aceite, permitida até a
 * publicação das chaves da categoria (categoryOps[categoryId].bracketStatus).
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
  formDupla,
  formTeam,
  getInvite,
  getRegistration,
  getTeam,
  markSharePaid,
  publishBracket,
  seedMan,
  seedTournament,
  teamCategory,
} from './registration-harness.mjs';

beforeEach(clearFirestore);

/** Dupla A+B formada numa categoria masculina livre de nível. */
async function duplaFormada() {
  const a = await seedMan({uid: 'ana-a', name: 'Atleta A'});
  const b = await seedMan({uid: 'beto-b', name: 'Atleta B'});
  const c = await seedMan({uid: 'caio-c', name: 'Atleta C'});
  const tournamentId = await seedTournament({
    categories: [duplaCategory({id: 'masc', categoryName: 'Dupla Masculina'})],
  });
  const {registrationId, teamId} = await formDupla({
    tournamentId, categoryId: 'masc', inviterUid: a, inviteeUid: b,
  });
  return {a, b, c, tournamentId, registrationId, teamId};
}

function sendPayload(over = {}) {
  return {
    replacedName: 'Atleta B',
    inviteeName: 'Atleta C',
    inviterName: 'Atleta A',
    ...over,
  };
}

describe('substituição — envio do convite', () => {
  test('membro da dupla convida substituto para a vaga do parceiro', async () => {
    const {a, b, c, registrationId, teamId, tournamentId} = await duplaFormada();

    const {inviteId} = await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));

    const invite = await getInvite(inviteId);
    assert.equal(invite.isSubstitutionInvite, true);
    assert.equal(invite.replacedUid, b);
    assert.equal(invite.replacedName, 'Atleta B');
    assert.equal(invite.attachRegistrationId, registrationId);
    assert.equal(invite.attachTeamId, teamId);
    assert.equal(invite.tournamentId, tournamentId);
    assert.equal(invite.status, 'pending');
  });

  test('membro também indica substituto para a PRÓPRIA vaga', async () => {
    const {b, c, registrationId} = await duplaFormada();
    const {inviteId} = await call(callables.sendSubstitution, b, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c, inviterName: 'Atleta B',
    }));
    assert.ok(inviteId);
  });

  test('quem não é da inscrição não inicia', async () => {
    const {b, c, registrationId} = await duplaFormada();
    const intruso = await seedMan({uid: 'intruso'});
    const msg = await callExpectingError(callables.sendSubstitution, intruso, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    assert.match(msg, /não é um dos atletas/i);
  });

  test('chave publicada bloqueia o envio', async () => {
    const {a, b, c, registrationId, tournamentId} = await duplaFormada();
    await publishBracket(tournamentId, 'masc');
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    assert.match(msg, /chaves.*publicadas/i);
  });

  test('substituto já inscrito na categoria é recusado', async () => {
    const {a, b, registrationId, tournamentId} = await duplaFormada();
    const d = await seedMan({uid: 'davi-d'});
    const e = await seedMan({uid: 'edu-e'});
    await formDupla({tournamentId, categoryId: 'masc', inviterUid: d, inviteeUid: e});
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: d,
    }));
    assert.match(msg, /já está inscrito/i);
  });

  test('um convite pendente por vaga', async () => {
    const {a, b, c, registrationId} = await duplaFormada();
    const d = await seedMan({uid: 'davi-d'});
    await call(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: c,
    }));
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: d,
    }));
    assert.match(msg, /convite de substituição pendente/i);
  });

  test('substituto fora da faixa de nível da categoria é barrado', async () => {
    // Códigos conferidos em category-level-eligibility.ts (LEVEL_RANK): o
    // atleta usa o CÓDIGO ('iniciante_1'/'avancado_1' — 'avancado' bare não
    // existe no mapa), a categoria usa o LABEL ('Iniciante 1'), mesmo padrão
    // de registration-gates.test.mjs ("gates — nível").
    const a = await seedMan({uid: 'ana-a', level: 'iniciante_1'});
    const b = await seedMan({uid: 'beto-b', level: 'iniciante_1'});
    const forte = await seedMan({uid: 'forte', level: 'avancado_1'});
    const tournamentId = await seedTournament({
      categories: [duplaCategory({id: 'inic', categoryName: 'Dupla Iniciante', level: 'Iniciante 1'})],
    });
    const {registrationId} = await formDupla({
      tournamentId, categoryId: 'inic', inviterUid: a, inviteeUid: b,
    });
    const msg = await callExpectingError(callables.sendSubstitution, a, sendPayload({
      registrationId, replacedUid: b, inviteeUid: forte,
    }));
    assert.match(msg, /não pode disputar a categoria/i);
  });

  test('equipe: só o capitão convida, e nunca para a própria vaga', async () => {
    const cap = await seedMan({uid: 'cap'});
    const m1 = await seedMan({uid: 'm1'});
    const m2 = await seedMan({uid: 'm2'});
    const sub = await seedMan({uid: 'sub'});
    const tournamentId = await seedTournament({
      categories: [teamCategory({id: 'trio', categoryName: 'Trio Livre', teamSize: 3, genderMode: 'free'})],
    });
    const {registrationId} = await formTeam({
      tournamentId, categoryId: 'trio', captainUid: cap, memberUids: [m1, m2],
    });

    const naoCapitao = await callExpectingError(callables.sendSubstitution, m1, sendPayload({
      registrationId, replacedUid: m2, inviteeUid: sub,
    }));
    assert.match(naoCapitao, /capitão/i);

    const capitaoSaindo = await callExpectingError(callables.sendSubstitution, cap, sendPayload({
      registrationId, replacedUid: cap, inviteeUid: sub,
    }));
    assert.match(capitaoSaindo, /capitão não pode ser substituído/i);

    const {inviteId} = await call(callables.sendSubstitution, cap, sendPayload({
      registrationId, replacedUid: m1, inviteeUid: sub,
    }));
    assert.ok(inviteId);
  });
});
