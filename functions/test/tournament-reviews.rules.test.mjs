import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-tournament-reviews-test';
const OWNER = 'owner-uid';
const OTHER_ORG = 'other-org-uid';
const EVENT_ADMIN = 'event-admin-uid';
const ATHLETE = 'athlete-uid';
const OTHER_ATHLETE = 'other-athlete-uid';
const ADMIN = 'admin-uid';

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });

const as = (uid, claims) => testEnv.authenticatedContext(uid, claims).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

/** Toda escrita nestas coleções é da Cloud Function. A leitura de comentários anônimos pelo
 *  organizador só abre com 3+ avaliações (t-few tem 2, t-many tem 3). */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 't-few'), { managerId: OWNER, name: 'Poucas' });
    await setDoc(doc(db, 'tournaments', 't-many'), { managerId: OWNER, name: 'Muitas' });
    await setDoc(doc(db, 'tournaments', 't-many', 'staff', EVENT_ADMIN), { role: 'eventAdmin', status: 'active' });
    await setDoc(doc(db, 'tournamentReviewSummaries', 't-few'), { tournamentId: 't-few', organizerId: OWNER, status: 'open', count: 2 });
    await setDoc(doc(db, 'tournamentReviewSummaries', 't-many'), { tournamentId: 't-many', organizerId: OWNER, status: 'open', count: 3 });
    await setDoc(doc(db, 'tournaments', 't-few', 'anonymousReviews', 'a1'), { overall: 2, aspects: {}, comment: 'Atrasou', shuffleKey: 0.1 });
    await setDoc(doc(db, 'tournaments', 't-many', 'anonymousReviews', 'a2'), { overall: 5, aspects: {}, comment: 'Ótimo', shuffleKey: 0.2 });
    await setDoc(doc(db, 'tournamentReviews', `t-many_${ATHLETE}`), { tournamentId: 't-many', organizerId: OWNER, uid: ATHLETE, overall: 5, anonId: 'a2' });
    await setDoc(doc(db, 'tournamentReviews', `t-many_${OTHER_ATHLETE}`), { tournamentId: 't-many', organizerId: OWNER, uid: OTHER_ATHLETE, overall: 4, anonId: 'a3' });
    await setDoc(doc(db, 'users', ATHLETE, 'tournamentReviewInvites', 't-many'), { tournamentId: 't-many', status: 'submitted' });
    await setDoc(doc(db, 'organizerReputation', OWNER), { organizerId: OWNER, reviewsCount: 5 });
  });
}

before(async () => {
  await testEnv.clearFirestore();
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

test('atleta lê o próprio convite (e lista os pendentes), mas não o de outra pessoa', async () => {
  const db = as(ATHLETE);
  await assertSucceeds(getDoc(doc(db, 'users', ATHLETE, 'tournamentReviewInvites', 't-many')));
  await assertSucceeds(getDocs(query(
    collection(db, 'users', ATHLETE, 'tournamentReviewInvites'),
    where('status', '==', 'pending'),
  )));
  await assertFails(getDoc(doc(as(OTHER_ATHLETE), 'users', ATHLETE, 'tournamentReviewInvites', 't-many')));
});

test('o cliente não grava em nenhuma das coleções da avaliação', async () => {
  const db = as(ATHLETE);
  await assertFails(setDoc(doc(db, 'users', ATHLETE, 'tournamentReviewInvites', 't-forjado'), { tournamentId: 't-forjado', status: 'pending' }));
  await assertFails(setDoc(doc(db, 'tournamentReviews', `t-many_${ATHLETE}`), { tournamentId: 't-many', uid: ATHLETE, overall: 1 }));
  await assertFails(setDoc(doc(db, 'tournamentReviewSummaries', 't-many'), { count: 99 }));
  await assertFails(setDoc(doc(db, 'organizerReputation', OWNER), { reviewsCount: 0 }));
  await assertFails(setDoc(doc(as(OWNER), 'tournaments', 't-many', 'anonymousReviews', 'fake'), { overall: 5 }));
  await assertFails(setDoc(doc(as(OWNER), 'tournamentReviewSummaries', 't-many'), { average: 5 }));
});

test('avaliação privada: o autor e o admin leem; o organizador e outro atleta não', async () => {
  await assertSucceeds(getDoc(doc(as(ATHLETE), 'tournamentReviews', `t-many_${ATHLETE}`)));
  await assertFails(getDoc(doc(as(ATHLETE), 'tournamentReviews', `t-many_${OTHER_ATHLETE}`)));
  await assertFails(getDoc(doc(as(OWNER), 'tournamentReviews', `t-many_${ATHLETE}`)));
  const admin = as(ADMIN, { roles: ['admin'] });
  await assertSucceeds(getDoc(doc(admin, 'tournamentReviews', `t-many_${ATHLETE}`)));
  await assertSucceeds(getDocs(query(collection(admin, 'tournamentReviews'), where('tournamentId', '==', 't-many'))));
});

test('comentários anônimos: quem gerencia lê só com 3+ avaliações', async () => {
  await assertSucceeds(getDocs(collection(as(OWNER), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(as(OWNER), 'tournaments', 't-few', 'anonymousReviews')));
  await assertSucceeds(getDocs(collection(as(EVENT_ADMIN), 'tournaments', 't-many', 'anonymousReviews')));
});

test('comentários anônimos: organizador de outro torneio, atleta e anônimo não leem', async () => {
  await assertSucceeds(getDocs(collection(as(OWNER), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(as(OTHER_ORG), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(as(ATHLETE), 'tournaments', 't-many', 'anonymousReviews')));
  await assertFails(getDocs(collection(anon(), 'tournaments', 't-many', 'anonymousReviews')));
});

test('admin lê comentários anônimos mesmo abaixo de 3', async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN, { roles: ['admin'] }), 'tournaments', 't-few', 'anonymousReviews')));
});

test('resumo e reputação são públicos, até sem login', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'tournamentReviewSummaries', 't-many')));
  await assertSucceeds(getDoc(doc(anon(), 'organizerReputation', OWNER)));
});

test('category_feedbacks (esqueleto órfão) não é mais acessível', async () => {
  const db = as(ATHLETE);
  await assertSucceeds(getDoc(doc(db, 'tournamentReviewSummaries', 't-many')));
  await assertFails(setDoc(
    doc(db, 'artifacts', 'app', 'public', 'data', 'category_feedbacks', 'f1'),
    { userId: ATHLETE, tournamentId: 't-many', categoryId: 'c1', isPrivate: false },
  ));
});
