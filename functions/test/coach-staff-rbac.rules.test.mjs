import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const COACH = 'coach-uid';
const OUTRO_COACH = 'outro-coach-uid';
const AUX = 'aux-uid';
const PREP = 'prep-uid';
const FISIO = 'fisio-uid';
const PSICO = 'psico-uid';
const ESTRANHO = 'estranho-uid';
const ATLETA = 'atleta-uid';
const CARGOS = [[AUX, 'auxiliar'], [PREP, 'preparador_fisico'], [FISIO, 'fisioterapeuta'], [PSICO, 'psicologo']];

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-coach-staff-rbac-test',
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const c of [COACH, OUTRO_COACH]) {
      await setDoc(doc(db, 'coaches', c), { displayName: 'Treinador ' + c });
      for (const sub of ['squads', 'athletes', 'trainings', 'evaluations']) {
        await setDoc(doc(db, 'coaches', c, sub, 'x1'), { marker: sub });
      }
      await setDoc(doc(db, 'coaches', c, 'callUps', 'cu1'), { recipients: [ATLETA], title: 't' });
    }
    for (const [uid, role] of CARGOS) {
      await setDoc(doc(db, 'coaches', COACH, 'staff', uid), { role });
    }
    // membro do OUTRO treinador: nao pode tocar no COACH
    await setDoc(doc(db, 'coaches', OUTRO_COACH, 'staff', ESTRANHO), { role: 'auxiliar' });
    // cargo corrompido (editado a mao)
    await setDoc(doc(db, 'coaches', COACH, 'staff', 'cargo-ruim'), { role: 'dono' });
    await setDoc(doc(db, 'coaches', COACH, 'staff', 'sem-cargo'), {});
    await setDoc(doc(db, 'coachStaffInvites', 'conv1'), {
      coachUid: COACH, emailLower: 'novo@x.com', role: 'auxiliar', status: 'pending',
    });
    await setDoc(doc(db, 'coachStaffInvites', 'conv-sem-email'), { coachUid: COACH, status: 'pending' });
    await setDoc(doc(db, 'users', AUX, 'coachStaff', COACH), { role: 'auxiliar' });
  });
});
after(async () => { await testEnv.cleanup(); });

const as = (uid, extra = {}) => testEnv.authenticatedContext(uid, { roles: ['coach'], ...extra }).firestore();
const read = (uid, sub, c = COACH) => getDoc(doc(as(uid), 'coaches', c, sub, 'x1'));
const write = (uid, sub, c = COACH) => setDoc(doc(as(uid), 'coaches', c, sub, 'x1'), { marker: 'novo' });

// area -> subcolecao (areas sem dado ainda nao tem bloco)
const AREAS = { atletas: ['squads', 'athletes'], treinos: ['trainings'], avaliacoes: ['evaluations'] };
// cargo -> { le: [areas], escreve: [areas] } (espelha a matriz da Task 1)
const MATRIZ = {
  [AUX]: { le: ['atletas', 'treinos', 'avaliacoes'], escreve: ['treinos'] },
  [PREP]: { le: ['atletas', 'treinos', 'avaliacoes'], escreve: [] },
  [FISIO]: { le: ['atletas', 'treinos'], escreve: [] },
  [PSICO]: { le: ['atletas'], escreve: [] },
};

test('dono le e escreve tudo', async () => {
  for (const subs of Object.values(AREAS)) for (const s of subs) {
    await assertSucceeds(read(COACH, s));
    await assertSucceeds(write(COACH, s));
  }
  await assertSucceeds(getDoc(doc(as(COACH), 'coaches', COACH)));
});

for (const [uid] of CARGOS) {
  test(`cargo ${uid}: matriz exata de leitura e escrita nas subcolecoes`, async () => {
    for (const [area, subs] of Object.entries(AREAS)) for (const s of subs) {
      const r = MATRIZ[uid].le.includes(area) ? assertSucceeds : assertFails;
      const w = MATRIZ[uid].escreve.includes(area) ? assertSucceeds : assertFails;
      await r(read(uid, s));
      await w(write(uid, s));
    }
  });
}

test('auxiliar apaga e cria treino (escrita inclui delete e create)', async () => {
  await assertSucceeds(setDoc(doc(as(AUX), 'coaches', COACH, 'trainings', 'novo'), { title: 'T' }));
  await assertSucceeds(deleteDoc(doc(as(AUX), 'coaches', COACH, 'trainings', 'novo')));
});

test('ninguem da comissao le o doc raiz do treinador', async () => {
  for (const [uid] of CARGOS) await assertFails(getDoc(doc(as(uid), 'coaches', COACH)));
});

test('ninguem da comissao escreve o doc raiz do treinador', async () => {
  for (const [uid] of CARGOS) await assertFails(updateDoc(doc(as(uid), 'coaches', COACH), { displayName: 'hack' }));
});

test('convocacao: auxiliar le, mas ninguem escreve direto (so function)', async () => {
  await assertSucceeds(getDoc(doc(as(AUX), 'coaches', COACH, 'callUps', 'cu1')));
  await assertFails(getDoc(doc(as(PSICO), 'coaches', COACH, 'callUps', 'cu1')));
  await assertFails(setDoc(doc(as(AUX), 'coaches', COACH, 'callUps', 'cu1'), { title: 'x' }));
  await assertFails(setDoc(doc(as(COACH), 'coaches', COACH, 'callUps', 'cu1'), { title: 'x' }));
});

test('atleta convocado continua lendo a propria convocacao', async () => {
  await assertSucceeds(getDoc(doc(as(ATLETA), 'coaches', COACH, 'callUps', 'cu1')));
});

test('estranho nao le nada; membro de OUTRO treinador tambem nao', async () => {
  for (const uid of [ESTRANHO]) for (const subs of Object.values(AREAS)) for (const s of subs) {
    await assertFails(read(uid, s));
    await assertFails(write(uid, s));
  }
});

test('cargo corrompido ou ausente no doc staff nega tudo, sem erro silencioso que libere', async () => {
  for (const uid of ['cargo-ruim', 'sem-cargo']) {
    await assertFails(read(uid, 'squads'));
    await assertFails(write(uid, 'trainings'));
  }
});

test('ninguem escreve na subcolecao staff, nem o dono; membro nao se promove', async () => {
  await assertFails(setDoc(doc(as(COACH), 'coaches', COACH, 'staff', ESTRANHO), { role: 'auxiliar' }));
  await assertFails(setDoc(doc(as(AUX), 'coaches', COACH, 'staff', AUX), { role: 'auxiliar' }));
  await assertFails(deleteDoc(doc(as(AUX), 'coaches', COACH, 'staff', AUX)));
});

test('staff: dono e o proprio membro leem; outro membro nao', async () => {
  await assertSucceeds(getDoc(doc(as(COACH), 'coaches', COACH, 'staff', AUX)));
  await assertSucceeds(getDoc(doc(as(AUX), 'coaches', COACH, 'staff', AUX)));
  await assertFails(getDoc(doc(as(PSICO), 'coaches', COACH, 'staff', AUX)));
  await assertFails(getDocs(collection(as(PSICO), 'coaches', COACH, 'staff')));
});

test('convite: dono le; convidado le pelo e-mail; terceiro e sessao sem e-mail nao', async () => {
  await assertSucceeds(getDoc(doc(as(COACH), 'coachStaffInvites', 'conv1')));
  await assertSucceeds(getDoc(doc(as('novo', { email: 'novo@x.com' }), 'coachStaffInvites', 'conv1')));
  await assertFails(getDoc(doc(as('outro', { email: 'outro@x.com' }), 'coachStaffInvites', 'conv1')));
  await assertFails(getDoc(doc(as('anon'), 'coachStaffInvites', 'conv-sem-email')));
  await assertFails(setDoc(doc(as(COACH), 'coachStaffInvites', 'novo'), { coachUid: COACH }));
});

test('espelho: so o proprio usuario le, ninguem escreve', async () => {
  await assertSucceeds(getDoc(doc(as(AUX), 'users', AUX, 'coachStaff', COACH)));
  await assertFails(getDoc(doc(as(PSICO), 'users', AUX, 'coachStaff', COACH)));
  await assertFails(setDoc(doc(as(AUX), 'users', AUX, 'coachStaff', OUTRO_COACH), { role: 'auxiliar' }));
});

test('campos congelados: trainings do auxiliar nao tem campo de identidade/dinheiro (revisitar se surgir)', async () => {
  // Documenta a analise do plano: o unico escritor de staff via rules e o auxiliar em
  // `trainings`. Se um campo sensivel (ex.: ownerUid, valor) entrar no doc, este teste
  // deve ser trocado por um assertFails por campo, como em staffKeepsTournamentMoneyFields.
  await assertSucceeds(setDoc(doc(as(AUX), 'coaches', COACH, 'trainings', 'x1'), { attendance: { a: 'presente' }, status: 'done' }));
});

test('lista: dono consulta os próprios convites pendentes (coachUid + status)', async () => {
  const q = query(
    collection(as(COACH), 'coachStaffInvites'),
    where('coachUid', '==', COACH),
    where('status', '==', 'pending'),
  );
  await assertSucceeds(getDocs(q));
});

test('lista: dono NÃO consulta convites de outro treinador', async () => {
  const q = query(
    collection(as(COACH), 'coachStaffInvites'),
    where('coachUid', '==', OUTRO_COACH),
    where('status', '==', 'pending'),
  );
  await assertFails(getDocs(q));
});

test('lista: sem filtro nenhum, nem o dono lista a coleção inteira de convites', async () => {
  await assertFails(getDocs(collection(as(COACH), 'coachStaffInvites')));
});

test('lista: convidado consulta pelo próprio e-mail', async () => {
  const db = as('novo-uid', { email: 'novo@x.com' });
  await assertSucceeds(getDocs(query(collection(db, 'coachStaffInvites'), where('emailLower', '==', 'novo@x.com'))));
});

test('lista: convidado NÃO consulta por e-mail alheio', async () => {
  const db = as('novo-uid', { email: 'novo@x.com' });
  await assertFails(getDocs(query(collection(db, 'coachStaffInvites'), where('emailLower', '==', 'outro@x.com'))));
});

test('lista: dono lista a própria comissão; membro não lista a de outro', async () => {
  await assertSucceeds(getDocs(collection(as(COACH), 'coaches', COACH, 'staff')));
  await assertFails(getDocs(collection(as(AUX), 'coaches', COACH, 'staff')));
});

test('lista: o usuário lista os próprios vínculos em users/{uid}/coachStaff, não os de outro', async () => {
  await assertSucceeds(getDocs(collection(as(AUX), 'users', AUX, 'coachStaff')));
  await assertFails(getDocs(collection(as(PSICO), 'users', AUX, 'coachStaff')));
});
