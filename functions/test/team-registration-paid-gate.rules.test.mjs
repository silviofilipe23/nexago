// `registrationPaid` é o portão das listagens públicas de equipe, e `gender`
// sai dele. Quem carimba é só `markTeamRegistrationPaid` (Cloud Function), no
// instante em que a inscrição fecha. As rules deixavam o jogador da equipe
// editar o doc livremente (só travavam player1Id/player2Id), então ele podia
// marcar a própria equipe como paga e entrar no Descobrir sem pagar nada.
// Rodar:
// firebase emulators:exec --only firestore "node --test functions/test/team-registration-paid-gate.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, before, after} from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {deleteField, doc, setDoc, updateDoc} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-rules-test-team-gate';
const APP_ID = PROJECT_ID;
const UID = 'player1-uid';
const OUTSIDER = 'outsider-uid';
const TEAM = `artifacts/${APP_ID}/public/data/teams/team-1`;
const PAID_TEAM = `artifacts/${APP_ID}/public/data/teams/team-paga`;

let testEnv;
before(async () => {
  testEnv = await initializeTestEnvironment({projectId: PROJECT_ID, firestore: {rules}});
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Equipe criada no aceite do convite e nunca paga: sem `registrationPaid`.
    await setDoc(doc(db, TEAM), {player1Id: UID, player2Id: 'player2-uid'});
    // Equipe já carimbada pela Cloud Function.
    await setDoc(doc(db, PAID_TEAM), {
      player1Id: UID,
      player2Id: 'player2-uid',
      registrationPaid: true,
      gender: 'Masculino',
    });
  });
});
after(async () => testEnv.cleanup());

function athleteDb() {
  return testEnv.authenticatedContext(UID).firestore();
}

// Controle positivo: sem ele, uma regra quebrada (ou estourada no orçamento de
// expressões) reprovaria TUDO e as negações abaixo passariam por engano.
test('jogador da equipe ainda edita campo comum do doc', async () => {
  await assertSucceeds(updateDoc(doc(athleteDb(), TEAM), {teamName: 'Os Cascudos'}));
});

test('jogador não carimba a própria equipe como paga', async () => {
  await assertFails(updateDoc(doc(athleteDb(), TEAM), {registrationPaid: true}));
});

test('jogador não inventa o gênero da equipe', async () => {
  await assertFails(updateDoc(doc(athleteDb(), TEAM), {gender: 'Misto'}));
});

test('jogador não troca o gênero já carimbado', async () => {
  await assertFails(updateDoc(doc(athleteDb(), PAID_TEAM), {gender: 'Feminino'}));
});

// `pairKey` entrou na mesma família do portão: é a chave que a inscrição
// seguinte usa para reencontrar a equipe da dupla, e um cliente que a
// forjasse apontaria a próxima inscrição de OUTRO par para o doc dele.
test('jogador não forja o pairKey de outra dupla', async () => {
  await assertFails(updateDoc(doc(athleteDb(), TEAM), {pairKey: 'outro:par'}));
});

// Controle positivo do caso acima: prova que a trava nova barra só `pairKey`,
// não qualquer campo livre — sem isto, um `hasAny` escrito errado que
// bloqueasse TODO update passaria despercebido.
test('jogador ainda edita campo livre como número da camisa', async () => {
  await assertSucceeds(updateDoc(doc(athleteDb(), TEAM), {jerseyNumber: 7}));
});

// Apagar o portão é tão grave quanto forjá-lo: sumiria da listagem sem motivo,
// e o `deleteField` não aparece como "mudança de valor", só como chave afetada.
test('jogador não apaga o carimbo de pagamento', async () => {
  await assertFails(updateDoc(doc(athleteDb(), PAID_TEAM), {registrationPaid: deleteField()}));
});

test('jogador não esconde o carimbo gravando false', async () => {
  await assertFails(updateDoc(doc(athleteDb(), PAID_TEAM), {registrationPaid: false}));
});

test('carimbo junto de um campo permitido também é barrado', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), TEAM), {teamName: 'Os Espertos', registrationPaid: true}),
  );
});

test('quem não é da equipe não escreve nada', async () => {
  const db = testEnv.authenticatedContext(OUTSIDER).firestore();
  await assertFails(updateDoc(doc(db, TEAM), {teamName: 'Invasores'}));
});
