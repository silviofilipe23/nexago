import {
  DEFAULT_ORGANIZER_EVENT_DEFAULTS,
  applyOrganizerCategoryDefaults,
  applyOrganizerDefaults,
  applyOrganizerPaymentDefaults,
  clampOrganizerDefault,
  parseOrganizerSettings,
  type OrganizerEventDefaults,
} from './organizer-settings.model';
import { emptyCategoryDraft, emptyTournamentDraft } from './tournament-create.model';

function defaultsWith(patch: Partial<OrganizerEventDefaults>): OrganizerEventDefaults {
  return { ...DEFAULT_ORGANIZER_EVENT_DEFAULTS, ...patch };
}

describe('organizer-settings', () => {
  describe('parseOrganizerSettings', () => {
    it('doc inexistente cai inteiro nos defaults', () => {
      const s = parseOrganizerSettings(undefined);
      expect(s.profile.orgName).toBe('');
      expect(s.profile.logoUrl).toBeNull();
      expect(s.payments.pixKey).toBe('');
      expect(s.defaults).toEqual(DEFAULT_ORGANIZER_EVENT_DEFAULTS);
    });

    it('os defaults de fábrica são os mesmos que o wizard já usa hoje', () => {
      const draft = emptyTournamentDraft();
      const cat = emptyCategoryDraft('x');
      expect(DEFAULT_ORGANIZER_EVENT_DEFAULTS.sport).toBe(draft.sport);
      expect(DEFAULT_ORGANIZER_EVENT_DEFAULTS.courtsCount).toBe(draft.courtsCount);
      expect(DEFAULT_ORGANIZER_EVENT_DEFAULTS.defaultPriceCents).toBe(draft.defaultPriceCents);
      expect(DEFAULT_ORGANIZER_EVENT_DEFAULTS.bracketSystem).toBe(cat.bracketSystem);
      expect(DEFAULT_ORGANIZER_EVENT_DEFAULTS.spots).toBe(cat.spots);
    });

    it('mapa parcial faz merge campo a campo, sem zerar o resto', () => {
      const s = parseOrganizerSettings({ organizerDefaults: { courtsCount: 8, bestOf: 'bestOf5' } });
      expect(s.defaults.courtsCount).toBe(8);
      expect(s.defaults.bestOf).toBe('bestOf5');
      expect(s.defaults.sport).toBe(DEFAULT_ORGANIZER_EVENT_DEFAULTS.sport);
      expect(s.defaults.spots).toBe(DEFAULT_ORGANIZER_EVENT_DEFAULTS.spots);
    });

    it('ignora valor fora do enum e cai no default', () => {
      const s = parseOrganizerSettings({
        organizerDefaults: { sport: 'padel', bracketSystem: 'inventado', visibility: 'secreto' },
      });
      expect(s.defaults.sport).toBe(DEFAULT_ORGANIZER_EVENT_DEFAULTS.sport);
      expect(s.defaults.bracketSystem).toBe(DEFAULT_ORGANIZER_EVENT_DEFAULTS.bracketSystem);
      expect(s.defaults.visibility).toBe(DEFAULT_ORGANIZER_EVENT_DEFAULTS.visibility);
    });

    it('prende número gravado fora de faixa dentro dos limites do wizard', () => {
      const s = parseOrganizerSettings({
        organizerDefaults: { courtsCount: 999, spots: 0, qualifiersPerGroup: 50, maxRegistrationsPerAthlete: -3 },
      });
      expect(s.defaults.courtsCount).toBe(20);
      expect(s.defaults.spots).toBe(2);
      expect(s.defaults.qualifiersPerGroup).toBe(4);
      expect(s.defaults.maxRegistrationsPerAthlete).toBe(1);
    });

    it('nunca deixa preço negativo', () => {
      expect(parseOrganizerSettings({ organizerDefaults: { defaultPriceCents: -100 } }).defaults.defaultPriceCents).toBe(0);
    });

    it('normaliza UF em maiúsculas e trata logo vazia como null', () => {
      const s = parseOrganizerSettings({ organizerProfile: { state: 'go', logoUrl: '   ' } });
      expect(s.profile.state).toBe('GO');
      expect(s.profile.logoUrl).toBeNull();
    });

    it('descarta pixKeyType desconhecido — inclusive o legado "random"', () => {
      expect(parseOrganizerSettings({ organizerPayments: { pixKeyType: 'random' } }).payments.pixKeyType).toBe('');
      expect(parseOrganizerSettings({ organizerPayments: { pixKeyType: 'cpf' } }).payments.pixKeyType).toBe('CPF');
    });

    it('preserva regulamento com espaços e quebras de linha', () => {
      const notes = '  Regra 1\n\nRegra 2  ';
      expect(parseOrganizerSettings({ organizerDefaults: { regulationNotes: notes } }).defaults.regulationNotes).toBe(notes);
    });
  });

  describe('clampOrganizerDefault', () => {
    it('prende nas bordas e arredonda', () => {
      expect(clampOrganizerDefault('teamsPerGroup', 1)).toBe(2);
      expect(clampOrganizerDefault('teamsPerGroup', 9)).toBe(8);
      expect(clampOrganizerDefault('teamsPerGroup', 4.4)).toBe(4);
      expect(clampOrganizerDefault('courtsCount', Number.NaN)).toBe(1);
    });
  });

  describe('applyOrganizerDefaults', () => {
    it('aplica os campos configuráveis', () => {
      const out = applyOrganizerDefaults(
        emptyTournamentDraft(),
        defaultsWith({ courtsCount: 6, defaultPriceCents: 15000, visibility: 'linkOnly', waitlistEnabled: false }),
      );
      expect(out.courtsCount).toBe(6);
      expect(out.defaultPriceCents).toBe(15000);
      expect(out.visibility).toBe('linkOnly');
      expect(out.waitlistEnabled).toBeFalse();
    });

    it('não encosta em identidade, datas, local nem categorias', () => {
      const draft = {
        ...emptyTournamentDraft(),
        name: 'Copa Teste',
        city: 'Goiânia',
        arenaId: 'arena-1',
        startAt: new Date(2026, 7, 10),
        categories: [emptyCategoryDraft('c1')],
      };
      const out = applyOrganizerDefaults(draft, defaultsWith({ courtsCount: 9 }));
      expect(out.name).toBe('Copa Teste');
      expect(out.city).toBe('Goiânia');
      expect(out.arenaId).toBe('arena-1');
      expect(out.startAt).toBe(draft.startAt);
      expect(out.categories).toBe(draft.categories);
      expect(out.courtsCount).toBe(9);
    });
  });

  describe('applyOrganizerPaymentDefaults', () => {
    it('preenche os quatro campos de recebimento direto', () => {
      const out = applyOrganizerPaymentDefaults(emptyTournamentDraft(), {
        pixKey: '62999853983',
        pixKeyType: 'PHONE',
        recipientName: 'Liga Amadora',
        city: 'GOIANIA',
      });
      expect(out.organizerPixKey).toBe('62999853983');
      expect(out.organizerPixKeyType).toBe('PHONE');
      expect(out.organizerPixRecipientName).toBe('Liga Amadora');
      expect(out.organizerPixCity).toBe('GOIANIA');
    });

    it('sem chave cadastrada devolve o rascunho intacto', () => {
      const draft = emptyTournamentDraft();
      const out = applyOrganizerPaymentDefaults(draft, { pixKey: '  ', pixKeyType: '', recipientName: 'X', city: 'Y' });
      expect(out).toBe(draft);
    });
  });

  describe('applyOrganizerCategoryDefaults', () => {
    it('aplica formato/vagas e preserva a identidade da categoria', () => {
      const cat = { ...emptyCategoryDraft('c1'), name: 'Masculino B', priceCents: 12345 };
      const out = applyOrganizerCategoryDefaults(
        cat,
        defaultsWith({ bracketSystem: 'singleElimination', bestOf: 'singleSet', spots: 32, teamsPerGroup: 5 }),
      );
      expect(out.id).toBe('c1');
      expect(out.name).toBe('Masculino B');
      expect(out.priceCents).toBe(12345);
      expect(out.bracketSystem).toBe('singleElimination');
      expect(out.bestOf).toBe('singleSet');
      expect(out.spots).toBe(32);
      expect(out.teamsPerGroup).toBe(5);
    });
  });
});
