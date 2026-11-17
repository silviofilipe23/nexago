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
  Timestamp,
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
const OTHER_UID = 'other-uid';

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
    await setDoc(doc(db, 'partnerPrivate', 'squad'), { couponCode: 'SQUAD20', notifiedNewAt: new Date(), updatedAt: new Date(), updatedBy: ADMIN_UID });
    await setDoc(doc(db, 'benefitCodes', 'NEXA-ATHL'), { uids: [ATHLETE_UID], firstAt: new Date() });
    await setDoc(doc(db, 'benefitRedemptions', 'fast-acai_P1'), { partnerId: 'fast-acai', uid: ATHLETE_UID, status: 'matched' });
    await setDoc(doc(db, 'users', ATHLETE_UID, 'benefits', 'used'), {
      saved: false, savedAt: null, useCount: 2, lastAnswer: null, lastUsedAt: new Date(),
    });
    await setDoc(doc(db, 'users', OTHER_UID, 'benefits', 'fast-acai'), { saved: true, savedAt: new Date() });
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

// ── versão premium (v2) ─────────────────────────────────────────────────────

const location = (over = {}) => ({ name: 'Loja Bueno', address: 'Av. T-10, 100', lat: -16.7, lng: -49.27, ...over });

function premium(over = {}) {
  return partner({
    coverUrl: 'https://cdn.example/capa.jpg',
    startsAt: Timestamp.fromDate(new Date('2026-11-01T03:00:00Z')),
    validUntil: null,
    featured: true,
    placements: ['post_game', 'tournament_day'],
    couponUrlParam: 'cupom',
    termsTags: ['online', 'one_per_person'],
    locations: Array.from({ length: 20 }, (_, i) => location({ name: `Loja ${i}`, hours: i % 2 ? 'Seg a sex, 10h às 22h' : null })),
    requirement: { type: 'none' },
    requirementLabel: null,
    ...over,
  });
}

test('v2: admin grava parceiro com os campos novos (e o v1 continua válido)', async () => {
  const db = adminCtx().firestore();
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-v1'), partner()));
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-v2'), premium()));
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-null'), premium({
    coverUrl: null, startsAt: null, placements: [], termsTags: [], locations: [], couponUrlParam: null,
  })));
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-squad'), premium({
    couponCode: null, requirement: { type: 'squad' }, requirementLabel: 'Exclusivo para embaixadores do Squad',
  })));
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-tour'), premium({
    couponCode: null, requirement: { type: 'tournament', tournamentIds: ['t1', 't-2'] },
  })));
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-level'), premium({
    couponCode: null, requirement: { type: 'min_level', minLevel: 'intermediario_1' },
  })));
  // Pior caso para o teto de 1000 expressões das rules: todos os campos preenchidos, 20 lojas e
  // 10 torneios. Se este quebrar, a validação ficou cara demais.
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-max'), premium({
    description: 'd'.repeat(600),
    howToUse: ['1', '2', '3'],
    terms: 't'.repeat(2000),
    cities: Array.from({ length: 50 }, (_, i) => `Cidade ${i}`),
    leadConsentText: 'Autorizo',
    leadSuccessMessage: 'Pronto',
    logoUrl: 'https://cdn.example/logo.png',
    validUntil: Timestamp.fromDate(new Date('2026-12-31T03:00:00Z')),
    couponCode: null,
    requirement: { type: 'tournament', tournamentIds: Array.from({ length: 10 }, (_, i) => `t${i}`) },
    requirementLabel: 'Exclusivo para inscritos',
  })));
  // Edição do pior caso (merge) também cabe.
  await assertSucceeds(setDoc(doc(db, 'partners', 'p-max'), { priority: 99, updatedAt: serverTimestamp(), updatedBy: ADMIN_UID }, { merge: true }));
});

test('v2: admin não grava campos novos inválidos', async () => {
  const db = adminCtx().firestore();
  const cases = {
    cover: { coverUrl: 'http://inseguro.example/capa.jpg' },
    starts: { startsAt: '2026-11-01' },
    until: { validUntil: 123 },
    featured: { featured: 'sim' },
    placement: { placements: ['home'] },
    param: { couponUrlParam: 'cupom=x' },
    paramLong: { couponUrlParam: 'a'.repeat(31) },
    tag: { termsTags: ['vip'] },
    locMany: { locations: Array.from({ length: 21 }, () => location()) },
    locNotList: { locations: location() },
    reqType: { couponCode: null, requirement: { type: 'vip' } },
    reqNoIds: { couponCode: null, requirement: { type: 'tournament', tournamentIds: [] } },
    reqManyIds: { couponCode: null, requirement: { type: 'tournament', tournamentIds: Array.from({ length: 11 }, (_, i) => `t${i}`) } },
    reqIdsNotList: { couponCode: null, requirement: { type: 'tournament', tournamentIds: 't1' } },
    reqLevel: { couponCode: null, requirement: { type: 'min_level', minLevel: 'Intermediário 1' } },
    reqExtra: { couponCode: null, requirement: { type: 'squad', minLevel: 'open' } },
    reqPublicCoupon: { couponCode: 'NEXAGO10', requirement: { type: 'squad' } },
    label: { requirementLabel: 'x'.repeat(81) },
  };
  for (const [id, over] of Object.entries(cases)) {
    await assertFails(setDoc(doc(db, 'partners', `bad-${id}`), premium(over)));
  }
});

test('v2: partnerPrivate é só da equipe; marcas do push são do servidor', async () => {
  const athlete = athleteCtx().firestore();
  await assertFails(getDoc(doc(athlete, 'partnerPrivate', 'squad')));
  await assertFails(setDoc(doc(athlete, 'partnerPrivate', 'x'), {
    couponCode: 'X', updatedAt: serverTimestamp(), updatedBy: ATHLETE_UID,
  }));

  const admin = adminCtx().firestore();
  await assertSucceeds(getDoc(doc(admin, 'partnerPrivate', 'squad')));
  await assertSucceeds(setDoc(doc(admin, 'partnerPrivate', 'novo'), {
    couponCode: 'SQUAD20', updatedAt: serverTimestamp(), updatedBy: ADMIN_UID, updatedByName: 'Admin',
  }));
  // Editar o cupom preserva a marca (merge).
  await assertSucceeds(setDoc(doc(admin, 'partnerPrivate', 'squad'), {
    couponCode: 'SQUAD30', updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }, { merge: true }));
  await assertFails(setDoc(doc(admin, 'partnerPrivate', 'squad'), {
    couponCode: 'SQUAD30', notifiedNewAt: null, updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }, { merge: true }));
  await assertFails(setDoc(doc(admin, 'partnerPrivate', 'marca'), {
    couponCode: null, notifiedEndingAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }));
  await assertFails(setDoc(doc(admin, 'partnerPrivate', 'x2'), {
    couponCode: 'X', updatedAt: serverTimestamp(), updatedBy: ADMIN_UID, segredo: true,
  }));
  await assertFails(setDoc(doc(admin, 'partnerPrivate', 'x3'), {
    couponCode: 'X'.repeat(25), updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }));
});

test('desconto por elo: faixas no parceiro (só com cupom fixo) e cupons das faixas no privado', async () => {
  const admin = adminCtx().firestore();
  const tiers = [
    { minRank: 'COMPETIDOR', benefitHighlight: '15% OFF', benefitTitle: '15% para Competidor' },
    { minRank: 'ELITE', benefitHighlight: '20% OFF', benefitTitle: '20% para Elite' },
  ];
  await assertSucceeds(setDoc(doc(admin, 'partners', 'tiers-ok'), partner({ levelTiers: tiers })));
  await assertSucceeds(setDoc(doc(admin, 'partners', 'tiers-vazio'), partner({ levelTiers: [], couponMode: 'none', couponCode: null })));
  await assertFails(setDoc(doc(admin, 'partners', 'tiers-sem-fixo'), partner({ levelTiers: tiers, couponMode: 'athlete', couponCode: null })));
  await assertFails(setDoc(doc(admin, 'partners', 'tiers-6'), partner({ levelTiers: [...tiers, ...tiers, ...tiers] })));
  await assertFails(setDoc(doc(admin, 'partners', 'tiers-mapa'), partner({ levelTiers: { COMPETIDOR: tiers[0] } })));

  await assertSucceeds(setDoc(doc(admin, 'partnerPrivate', 'tiers-ok'), {
    couponCode: null, tierCoupons: { COMPETIDOR: 'NEXA15', ELITE: 'NEXA20' },
    updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }));
  await assertFails(setDoc(doc(admin, 'partnerPrivate', 'tiers-iniciante'), {
    tierCoupons: { INICIANTE: 'X' }, updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }));
  await assertFails(setDoc(doc(admin, 'partnerPrivate', 'tiers-lista'), {
    tierCoupons: ['X'], updatedAt: serverTimestamp(), updatedBy: ADMIN_UID,
  }));
  const athlete = athleteCtx().firestore();
  await assertFails(getDoc(doc(athlete, 'partnerPrivate', 'tiers-ok')));
});

test('tela do app: caminho interno opcional no botão; URL, barra dupla e espaço não passam', async () => {
  const admin = adminCtx().firestore();
  await assertSucceeds(setDoc(doc(admin, 'partners', 'rota-ok'), partner({ appRoute: '/arena/TtYSz7IaOHB7Hf7CXdIr' })));
  await assertSucceeds(setDoc(doc(admin, 'partners', 'rota-nula'), partner({ appRoute: null })));
  for (const [id, appRoute] of [
    ['rota-url', 'https://atleta.nexago.com.br/reservar/x'],
    ['rota-dupla', '//evil.example/x'],
    ['rota-sem-barra', 'arena/x'],
    ['rota-espaco', '/arena x'],
    ['rota-longa', '/' + 'a'.repeat(200)],
    ['rota-numero', 42],
  ]) {
    await assertFails(setDoc(doc(admin, 'partners', id), partner({ appRoute })));
  }
});

test('v2: users/{uid}/benefits — dono lê e só mexe em saved/savedAt', async () => {
  const athlete = athleteCtx().firestore();
  await assertSucceeds(getDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'used')));
  await assertSucceeds(getDocs(collection(athlete, 'users', ATHLETE_UID, 'benefits')));
  await assertFails(getDoc(doc(athlete, 'users', OTHER_UID, 'benefits', 'fast-acai')));

  // Controle: salvar e tirar dos salvos.
  await assertSucceeds(setDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'fast-acai'), {
    saved: true, savedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'used'), {
    saved: true, savedAt: serverTimestamp(),
  }, { merge: true }));
  await assertSucceeds(updateDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'fast-acai'), {
    saved: false, savedAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'n1'), {
    saved: true, savedAt: serverTimestamp(), useCount: 1,
  }));
  await assertFails(setDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'n2'), {
    saved: true, savedAt: new Date('2026-01-01'),
  }));
  await assertFails(setDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'n3'), { saved: 'sim', savedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'n4'), { saved: true }));
  await assertFails(updateDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'used'), {
    saved: true, savedAt: serverTimestamp(), useCount: 99,
  }));
  await assertFails(updateDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'used'), { lastAnswer: 'used' }));
  await assertFails(deleteDoc(doc(athlete, 'users', ATHLETE_UID, 'benefits', 'used')));
  await assertFails(setDoc(doc(athlete, 'users', OTHER_UID, 'benefits', 'x'), { saved: true, savedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(anonCtx().firestore(), 'users', ATHLETE_UID, 'benefits', 'used')));
});

test('v2: benefitCodes e benefitRedemptions só pelo servidor; equipe lê os resgates', async () => {
  const athlete = athleteCtx().firestore();
  await assertFails(getDoc(doc(athlete, 'benefitCodes', 'NEXA-ATHL')));
  await assertFails(setDoc(doc(athlete, 'benefitCodes', 'NEXA-ATHL'), { uids: [ATHLETE_UID] }));
  await assertFails(getDoc(doc(athlete, 'benefitRedemptions', 'fast-acai_P1')));
  await assertFails(getDocs(collection(athlete, 'benefitRedemptions')));
  await assertFails(setDoc(doc(athlete, 'benefitRedemptions', 'fast-acai_P2'), { uid: ATHLETE_UID, status: 'matched' }));

  const admin = adminCtx().firestore();
  await assertSucceeds(getDocs(collection(admin, 'benefitRedemptions')));
  await assertFails(setDoc(doc(admin, 'benefitRedemptions', 'fast-acai_P3'), { status: 'matched' }));
  await assertFails(getDoc(doc(admin, 'benefitCodes', 'NEXA-ATHL')));
  await assertFails(setDoc(doc(admin, 'benefitCodes', 'NEXA-ATHL'), { uids: [] }));
});

test('v2: config aceita hubSponsorPartnerId', async () => {
  const admin = adminCtx().firestore();
  const base = { enabled: true, testerUids: [], updatedAt: serverTimestamp(), updatedBy: ADMIN_UID };
  await assertSucceeds(setDoc(doc(admin, 'appConfig', 'benefitsClub'), { ...base, hubSponsorPartnerId: 'linq' }));
  await assertSucceeds(setDoc(doc(admin, 'appConfig', 'benefitsClub'), { ...base, hubSponsorPartnerId: null }));
  await assertFails(setDoc(doc(admin, 'appConfig', 'benefitsClub'), { ...base, hubSponsorPartnerId: 'x'.repeat(101) }));
  await assertFails(setDoc(doc(admin, 'appConfig', 'benefitsClub'), { ...base, hubSponsorPartnerId: 5 }));
  await assertFails(setDoc(doc(athleteCtx().firestore(), 'appConfig', 'benefitsClub'), {
    ...base, updatedBy: ATHLETE_UID, hubSponsorPartnerId: 'linq',
  }));
});
