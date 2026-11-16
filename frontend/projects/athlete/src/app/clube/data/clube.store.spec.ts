import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import { partnerFromDoc, type BenefitsClubConfig, type Partner } from '../clube.logic';
import { CLUB_API, type ClubApi, type ClubAthleteProfile } from './clube-api';
import { ClubStore } from './clube.store';

const FAST = partnerFromDoc('fast-acai', {
  name: 'Fast Açaí', category: 'food', benefitTitle: '10% de desconto', ctaType: 'link', ctaLabel: 'Pedir',
  link: 'https://fast.example.com', couponMode: 'fixed', couponCode: 'NEXAGO10', brandColor: '#5E1E7A',
  cities: ['Goiânia'], priority: 50, active: true, audience: 'all',
})!;
const LINQ = partnerFromDoc('linq', {
  name: 'LinQ Telecom', category: 'services', benefitTitle: 'Instalação grátis', ctaType: 'lead_form',
  ctaLabel: 'Quero contratar', couponMode: 'none', brandColor: '#0F62FE', isMasterSponsor: true, priority: 100,
  active: true, audience: 'testers', leadSuccessMessage: 'Pronto! A LinQ vai falar com você pelo WhatsApp',
})!;

/**
 * O store da vitrine com o `ClubAccessService` REAL: num link direto para `/clube` o serviço nasce
 * junto com o store, e a vitrine não pode esperar por um `effect` que ainda não rodou.
 */
describe('ClubStore', () => {
  let config: BenefitsClubConfig;
  let partners: Partner[];
  let profile: ClubAthleteProfile | null;
  let api: jasmine.SpyObj<ClubApi>;

  function setup(): ClubStore {
    api = jasmine.createSpyObj<ClubApi>('ClubApi', ['fetchConfig', 'fetchPartners', 'fetchProfile', 'track', 'submitLead']);
    api.fetchConfig.and.callFake(async () => config);
    api.fetchPartners.and.callFake(async () => partners);
    api.fetchProfile.and.callFake(async () => profile);
    api.track.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ClubStore,
        { provide: CLUB_API, useValue: api },
        { provide: AuthService, useValue: { user: signal({ uid: 'u1', displayName: 'Ana', email: null }) } },
      ],
    });
    return TestBed.inject(ClubStore);
  }

  beforeEach(() => {
    config = { enabled: true, testerUids: [] };
    partners = [FAST, LINQ];
    profile = { name: 'Ana', whatsapp: '(62) 98240-6456', city: 'goiania' };
  });

  it('link direto: carrega a vitrine sem esperar o effect do acesso', async () => {
    const store = setup();
    await store.reload();
    expect(store.error()).toBeNull();
    expect(store.closed()).toBeFalse();
    // A LinQ é de teste: quem não testa não vê.
    expect(store.partners().map((p) => p.id)).toEqual(['fast-acai']);
    expect(store.sponsor()).toBeNull();
    expect(store.profile()?.name).toBe('Ana');
    expect(store.loading()).toBeFalse();
  });

  it('quem testa vê o parceiro de teste e o patrocinador', async () => {
    config = { enabled: false, testerUids: ['u1'] };
    const store = setup();
    await store.reload();
    expect(store.closed()).toBeFalse();
    expect(store.partners().map((p) => p.id)).toEqual(['linq', 'fast-acai']);
    expect(store.sponsor()?.id).toBe('linq');
  });

  it('parceiro vencido ou que ainda não começou fica fora da vitrine', async () => {
    const expired = { ...FAST, id: 'expired', validUntil: Date.now() - 60_000 };
    const future = { ...FAST, id: 'future', startsAt: Date.now() + 3_600_000 };
    partners = [FAST, expired, future];
    const store = setup();
    await store.reload();
    expect(store.partners().map((p) => p.id)).toEqual(['fast-acai']);
  });

  it('flag desligada para quem não testa: clube fechado', async () => {
    config = { enabled: false, testerUids: [] };
    const store = setup();
    await store.reload();
    expect(store.closed()).toBeTrue();
  });

  it('sem cidade no perfil, parceiro só de outras cidades some (e o perfil que falha não derruba)', async () => {
    const store = setup();
    api.fetchProfile.and.rejectWith(new Error('offline'));
    await store.reload();
    expect(store.error()).toBeNull();
    expect(store.partners()).toEqual([]);
  });

  it('falha na vitrine vira erro amigável', async () => {
    const store = setup();
    api.fetchPartners.and.rejectWith(new Error('permission-denied'));
    await store.reload();
    expect(store.error()).toBe('Não foi possível carregar o clube agora. Tente de novo.');
    expect(store.loading()).toBeFalse();
  });

  it('o funil dispara e esquece: erro da callable não sobe', async () => {
    const store = setup();
    api.track.and.rejectWith(new Error('NOT FOUND'));
    expect(() => store.track('code_copy', 'competir_web', 'fast-acai')).not.toThrow();
    await Promise.resolve();
    expect(api.track).toHaveBeenCalledWith({ type: 'code_copy', partnerId: 'fast-acai', source: 'competir_web' });
  });

  it('lead: mensagem do servidor, ou a do parceiro, ou erro em português', async () => {
    const store = setup();
    const lead = { partnerId: 'linq', name: 'Ana', whatsapp: '5562982406456', neighborhood: 'Bueno', cep: '74230010' };

    api.submitLead.and.resolveTo({ successMessage: 'Feito!' });
    expect(await store.submitLead(LINQ, lead, 'competir_web')).toBe('Feito!');
    expect(api.submitLead).toHaveBeenCalledWith(lead, 'competir_web');

    api.submitLead.and.resolveTo({ successMessage: null });
    expect(await store.submitLead(LINQ, lead, 'deeplink')).toBe('Pronto! A LinQ vai falar com você pelo WhatsApp');

    api.submitLead.and.rejectWith({ code: 'functions/invalid-argument', message: 'Informe seu bairro.' });
    await expectAsync(store.submitLead(LINQ, lead, 'deeplink')).toBeRejectedWithError('Informe seu bairro.');

    api.submitLead.and.rejectWith({ code: 'functions/not-found', message: 'NOT FOUND' });
    await expectAsync(store.submitLead(LINQ, lead, 'deeplink')).toBeRejectedWithError(
      'Não foi possível enviar agora. Tente de novo.',
    );
  });
});
