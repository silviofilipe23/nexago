import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

// Clube de Vantagens Nexa: vitrine lida por quem está logado, escrita só da equipe; funil e leads
// só pelo servidor (callables) e lidos só pela equipe no backoffice.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-benefits-club-test',
  firestore: { rules },
});

const ADMIN_UID = 'admin-uid';
const ATHLETE_UID = 'athlete-uid';

const adminCtx = () => testEnv.authenticatedContext(ADMIN_UID, { roles: ['admin'] });
const athleteCtx = () => testEnv.authenticatedContext(ATHLETE_UID, { roles: ['athlete'] });
const anonCtx = () => testEnv.unauthenticatedContext();

function partner(over = {}) {
  return {
    name: 'Fast Açaí',
    logoUrl: null,
    category: 'food',
    benefitHighlight: '10% OFF',
    benefitTitle: '10% de desconto em todo pedido',
    description: '',
    howToUse: ['Toque em Pedir com 10% off'],
    terms: '',
    ctaType: 'link',
    ctaLabel: 'Pedir com 10% off',
    link: 'https://fast.example/cardapio',
    couponMode: 'fixed',
    couponCode: 'NEXAGO10',
    brandColor: '#5E1E7A',
    cities: ['Goiânia'],
    isMasterSponsor: false,
    priority: 50,
    active: true,
    audience: 'all',
    leadConsentText: null,
    leadSuccessMessage: null,
    createdAt: serverTimestamp(),
    createdByName: 'Admin',
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_UID,
    updatedByName: 'Admin',
    ...over,
  };
}

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'partners', 'fast-acai'), { ...partner(), createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, 'benefitEvents', 'e1'), { type: 'club_view', uid: ATHLETE_UID });
    await setDoc(doc(db, 'partnerLeads', `linq_${ATHLETE_UID}`), { partnerId: 'linq', uid: ATHLETE_UID });
    await setDoc(doc(db, 'appConfig', 'benefitsClub'), { enabled: false, testerUids: [] });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('logado lê a vitrine; anônimo não', async () => {
  await assertSucceeds(getDoc(doc(athleteCtx().firestore(), 'partners', 'fast-acai')));
  await assertSucceeds(getDocs(collection(athleteCtx().firestore(), 'partners')));
  await assertFails(getDoc(doc(anonCtx().firestore(), 'partners', 'fast-acai')));
});

test('atleta não grava parceiro', async () => {
  const db = athleteCtx().firestore();
  await assertFails(setDoc(doc(db, 'partners', 'novo'), partner({ updatedBy: ATHLETE_UID })));
  await assertFails(updateDoc(doc(db, 'partners', 'fast-acai'), { active: false }));
  await assertFails(deleteDoc(doc(db, 'partners', 'fast-acai')));
});

test('admin cria e edita parceiro válido', async () => {
  const db = adminCtx().firestore();
  await assertSucceeds(setDoc(doc(db, 'partners', 'linq'), partner({
    name: 'LinQ Telecom',
    category: 'services',
    ctaType: 'lead_form',
    ctaLabel: 'Quero contratar',
    link: null,
    couponMode: 'none',
    couponCode: null,
    isMasterSponsor: true,
    audience: 'testers',
    leadSuccessMessage: 'Pronto! A LinQ vai falar com você pelo WhatsApp',
  })));
  const { createdAt, createdByName, ...rest } = partner({ benefitHighlight: '15% OFF' });
  await assertSucceeds(setDoc(doc(db, 'partners', 'fast-acai'), rest, { merge: true }));
});

test('admin não grava parceiro inválido', async () => {
  const db = adminCtx().firestore();
  // Controle: o mesmo parceiro, sem defeito, passa. Sem isto os casos abaixo podiam falhar por outro motivo.
  await assertSucceeds(setDoc(doc(db, 'partners', 'x0'), partner()));
  await assertFails(setDoc(doc(db, 'partners', 'x1'), partner({ brandColor: 'roxo' })));
  await assertFails(setDoc(doc(db, 'partners', 'x2'), partner({ link: 'http://inseguro.example' })));
  await assertFails(setDoc(doc(db, 'partners', 'x3'), partner({ ctaType: 'whatsapp' })));
  await assertFails(setDoc(doc(db, 'partners', 'x4'), partner({ audience: 'vip' })));
  await assertFails(setDoc(doc(db, 'partners', 'x5'), partner({ campoNovo: true })));
  await assertFails(setDoc(doc(db, 'partners', 'x6'), partner({ updatedBy: 'outra-pessoa' })));
  await assertFails(setDoc(doc(db, 'partners', 'x7'), partner({ howToUse: ['1', '2', '3', '4'] })));
});

test('funil e leads: ninguém grava pelo cliente; só a equipe lê', async () => {
  const athlete = athleteCtx().firestore();
  await assertFails(addDoc(collection(athlete, 'benefitEvents'), { type: 'club_view', uid: ATHLETE_UID }));
  await assertFails(getDoc(doc(athlete, 'benefitEvents', 'e1')));
  await assertFails(getDocs(collection(athlete, 'benefitEvents')));
  await assertFails(setDoc(doc(athlete, 'partnerLeads', `linq_${ATHLETE_UID}`), { partnerId: 'linq' }));
  await assertFails(getDoc(doc(athlete, 'partnerLeads', `linq_${ATHLETE_UID}`)));

  const admin = adminCtx().firestore();
  await assertSucceeds(getDocs(collection(admin, 'benefitEvents')));
  await assertSucceeds(getDocs(collection(admin, 'partnerLeads')));
  await assertFails(addDoc(collection(admin, 'benefitEvents'), { type: 'club_view' }));
  await assertFails(updateDoc(doc(admin, 'partnerLeads', `linq_${ATHLETE_UID}`), { status: 'x' }));
});

test('config do clube: logado lê, equipe grava com allowlist', async () => {
  await assertSucceeds(getDoc(doc(athleteCtx().firestore(), 'appConfig', 'benefitsClub')));
  await assertFails(setDoc(doc(athleteCtx().firestore(), 'appConfig', 'benefitsClub'), {
    enabled: true, testerUids: [], updatedAt: serverTimestamp(), updatedBy: ATHLETE_UID,
  }));
  const admin = adminCtx().firestore();
  await assertSucceeds(setDoc(doc(admin, 'appConfig', 'benefitsClub'), {
    enabled: true, testerUids: [ATHLETE_UID], updatedAt: serverTimestamp(), updatedBy: ADMIN_UID, updatedByName: 'Admin',
  }));
  await assertFails(setDoc(doc(admin, 'appConfig', 'benefitsClub'), {
    enabled: 'sim', testerUids: [], updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }));
  // O bloco do clube não abre outros docs de appConfig.
  await assertFails(setDoc(doc(admin, 'appConfig', 'friendlyMatch'), { enabled: true }));
});
