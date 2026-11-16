import {
  emptyPartnerForm,
  formFromPartner,
  partnerFromDoc,
  partnerPayload,
  partnerPrivateFromDoc,
  payloadWith,
  privateCouponCode,
  validatePartnerForm,
  type PartnerForm,
} from './partner';
import {
  aspectDrift,
  coverFileError,
  coverStoragePath,
  dateInputValue,
  defaultRequirementLabel,
  endOfLocalDay,
  endingLabel,
  locationErrors,
  locationsFromDoc,
  outsideWindow,
  parseCoordinate,
  parseIds,
  partnerBadges,
  requirementFromDoc,
  requirementSummary,
  startOfLocalDay,
  subsetOf,
  validityError,
  PLACEMENTS,
  TERMS_TAGS,
} from './partner-premium';

function form(over: Partial<PartnerForm> = {}): PartnerForm {
  return {
    ...emptyPartnerForm(),
    name: 'Fast Açaí',
    benefitTitle: '10% de desconto',
    ctaLabel: 'Pedir',
    link: 'https://fast.example',
    couponMode: 'fixed',
    couponCode: 'NEXAGO10',
    active: true,
    ...over,
  };
}

const place = { name: 'Loja Centro', address: 'Rua 1, 100', lat: '-16,6869', lng: '-49.2648', hours: 'Seg a sáb, 10h às 22h' };

describe('clube v2: datas e selos', () => {
  it('input date ↔ dia local; o fim vale o dia inteiro', () => {
    expect(startOfLocalDay('2026-11-30')).toEqual(new Date(2026, 10, 30));
    expect(endOfLocalDay('2026-11-30')).toEqual(new Date(2026, 10, 30, 23, 59, 59, 999));
    expect(startOfLocalDay('2026-02-30')).toBeNull();
    expect(startOfLocalDay('30/11/2026')).toBeNull();
    expect(dateInputValue(new Date(2026, 0, 5, 18))).toBe('2026-01-05');
    expect(dateInputValue(null)).toBe('');
  });

  it('validade: opcional, fim ≥ início (o mesmo dia vale)', () => {
    expect(validityError('', '')).toBeNull();
    expect(validityError('2026-11-20', '2026-11-20')).toBeNull();
    expect(validityError('2026-11-21', '2026-11-20')?.message).toContain('depois');
    expect(validityError('x', '')).toEqual({ field: 'startsAt', message: 'Data de início inválida.' });
    expect(validatePartnerForm(form({ startsAt: '2026-12-01', validUntil: '2026-11-01' })).validUntil).toContain('depois');
  });

  it('"Termina em": só nos 7 dias antes do fim; hoje e amanhã têm texto próprio', () => {
    const now = new Date(2026, 10, 16, 15);
    expect(endingLabel(new Date(2026, 10, 16, 23, 59), now)).toBe('Termina hoje');
    expect(endingLabel(new Date(2026, 10, 17, 23, 59), now)).toBe('Termina amanhã');
    expect(endingLabel(new Date(2026, 10, 23, 23, 59), now)).toBe('Termina em 7 dias');
    expect(endingLabel(new Date(2026, 10, 24, 23, 59), now)).toBeNull();
    expect(endingLabel(new Date(2026, 10, 15), now)).toBeNull();
    expect(endingLabel(null, now)).toBeNull();
  });

  it('selos: Destaque, Novo (14 dias ou ainda não salvo) e Termina em', () => {
    const now = new Date(2026, 10, 16);
    const old = new Date(2026, 9, 1);
    expect(partnerBadges({ createdAt: old, validUntil: null, featured: false }, now)).toEqual([]);
    expect(partnerBadges({ createdAt: new Date(2026, 10, 10), validUntil: null, featured: true }, now)).toEqual([
      'Destaque da semana',
      'Novo',
    ]);
    expect(partnerBadges({ createdAt: null, validUntil: new Date(2026, 10, 16, 23), featured: false }, now, true)).toEqual([
      'Novo',
      'Termina hoje',
    ]);
  });

  it('fora da janela: antes do início ou depois do fim', () => {
    const now = new Date(2026, 10, 16);
    expect(outsideWindow(new Date(2026, 10, 17), null, now)).toBe('before');
    expect(outsideWindow(null, new Date(2026, 10, 15), now)).toBe('after');
    expect(outsideWindow(new Date(2026, 10, 1), new Date(2026, 10, 30), now)).toBeNull();
  });
});

describe('clube v2: lugares', () => {
  it('coordenada aceita vírgula e confere o intervalo', () => {
    expect(parseCoordinate('-16,6869', -90, 90)).toBe(-16.6869);
    expect(parseCoordinate(' 91 ', -90, 90)).toBeNull();
    expect(parseCoordinate('abc', -90, 90)).toBeNull();
    expect(parseCoordinate('', -90, 90)).toBeNull();
  });

  it('erro por lugar, na ordem; 0,0 é recusado', () => {
    const errors = locationErrors([
      place,
      { ...place, name: ' ' },
      { ...place, lat: '-95' },
      { ...place, lng: 'x' },
      { ...place, lat: '0', lng: '0' },
    ]);
    expect(errors[0]).toBeNull();
    expect(errors[1]).toContain('nome');
    expect(errors[2]).toContain('Latitude');
    expect(errors[3]).toContain('Longitude');
    expect(errors[4]).toContain('0,0');
    expect(validatePartnerForm(form({ locations: [place, { ...place, lat: '' }] })).locations).toContain('Lugar 2');
    expect(validatePartnerForm(form({ locations: Array.from({ length: 21 }, () => place) })).locations).toContain('20');
  });

  it('payload grava números e horário vazio vira null; leitura descarta lugar quebrado', () => {
    const payload = partnerPayload(form({ locations: [{ ...place, hours: ' ' }] }));
    expect(payload.locations).toEqual([{ name: 'Loja Centro', address: 'Rua 1, 100', lat: -16.6869, lng: -49.2648, hours: null }]);
    expect(locationsFromDoc([{ name: 'A', lat: 1, lng: 2 }, { name: '', lat: 1, lng: 2 }, { name: 'B', lat: '1', lng: 2 }, 'x'])).toEqual([
      { name: 'A', address: '', lat: 1, lng: 2, hours: null },
    ]);
  });
});

describe('clube v2: requisito e cupom privado', () => {
  it('leitura tolerante: ausente ou desconhecido = Todos', () => {
    expect(requirementFromDoc(undefined)).toEqual({ type: 'none' });
    expect(requirementFromDoc({ type: 'vip' })).toEqual({ type: 'none' });
    expect(requirementFromDoc({ type: 'tournament', tournamentIds: ['t1', 't1', 3, 'com espaço'] })).toEqual({
      type: 'tournament',
      tournamentIds: ['t1'],
    });
    expect(requirementFromDoc({ type: 'min_level', minLevel: 'avancado_1' })).toEqual({ type: 'min_level', minLevel: 'avancado_1' });
  });

  it('valida torneios (1–10) e nível da escada', () => {
    expect(validatePartnerForm(form({ requirementType: 'tournament' })).tournamentIds).toContain('ao menos um');
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(validatePartnerForm(form({ requirementType: 'tournament', tournamentIds: eleven })).tournamentIds).toContain('10');
    expect(validatePartnerForm(form({ requirementType: 'min_level', minLevel: 'pro' })).minLevel).toContain('nível');
    expect(validatePartnerForm(form({ requirementType: 'min_level', minLevel: 'open' }))).toEqual({});
    expect(validatePartnerForm(form({ requirementType: 'squad', requirementLabel: 'x'.repeat(81) })).requirementLabel).toContain('80');
  });

  it('com requisito o cupom fixo sai do doc público e vai para o privado', () => {
    const f = form({ requirementType: 'squad', requirementLabel: ' Só Squad ' });
    const payload = partnerPayload(f);
    expect(payload.couponCode).toBeNull();
    expect(payload.requirement).toEqual({ type: 'squad' });
    expect(payload.requirementLabel).toBe('Só Squad');
    expect(privateCouponCode(f)).toBe('NEXAGO10');
    expect(privateCouponCode(form())).toBeNull();
    expect(privateCouponCode(form({ requirementType: 'squad', couponMode: 'athlete' }))).toBeNull();
    expect(partnerPayload(form()).couponCode).toBe('NEXAGO10');
    expect(partnerPayload(form({ requirementLabel: 'sobra' })).requirementLabel).toBeNull();
  });

  it('volta ao mesmo form com o cupom privado; o toggle da tabela não exige o código', () => {
    const f = form({ requirementType: 'tournament', tournamentIds: ['t1', 't2'] });
    const read = partnerFromDoc('fast-acai', partnerPayload(f) as unknown as Record<string, unknown>);
    expect(read.couponCode).toBeNull();
    const back = formFromPartner(read, 'NEXAGO10');
    expect(partnerPayload(back)).toEqual(partnerPayload(f));
    expect(privateCouponCode(back)).toBe('NEXAGO10');
    const toggled = payloadWith(read, { active: false });
    expect('error' in toggled).toBeFalse();
  });

  it('textos do bloqueio e resumo', () => {
    expect(defaultRequirementLabel({ type: 'min_level', minLevel: 'avancado_1' })).toBe('Exclusivo para nível Avançado 1 ou acima');
    expect(defaultRequirementLabel({ type: 'none' })).toBeNull();
    expect(requirementSummary({ type: 'tournament', tournamentIds: ['a'] })).toBe('Inscritos em 1 torneio');
    expect(requirementSummary({ type: 'min_level', minLevel: 'open' })).toBe('Nível Open+');
    expect(parseIds(' a, b\nc  a ')).toEqual(['a', 'b', 'c']);
  });

  it('partnerPrivate ausente = sem cupom e sem aviso', () => {
    expect(partnerPrivateFromDoc(undefined)).toEqual({ couponCode: null, notifiedNewAt: null, notifiedEndingAt: null });
    const at = new Date(2026, 10, 16);
    expect(partnerPrivateFromDoc({ couponCode: 'X', notifiedNewAt: { toDate: () => at } }).notifiedNewAt).toEqual(at);
  });
});

describe('clube v2: vitrine, termos e capa', () => {
  it('cupom na URL só num link com cupom; listas só com valores do enum', () => {
    expect(partnerPayload(form({ couponUrlParam: 'coupon' })).couponUrlParam).toBe('coupon');
    expect(partnerPayload(form({ couponUrlParam: 'coupon', couponMode: 'none' })).couponUrlParam).toBeNull();
    expect(partnerPayload(form({ couponUrlParam: 'coupon', ctaType: 'lead_form' })).couponUrlParam).toBeNull();
    expect(validatePartnerForm(form({ couponUrlParam: 'cupom-nexa' })).couponUrlParam).toBeDefined();
    expect(subsetOf(['in_store', 'x', 'online', 'online'], TERMS_TAGS)).toEqual(['online', 'in_store']);
    expect(subsetOf('post_game', PLACEMENTS)).toEqual([]);
  });

  it('lê doc antigo (sem campos v2) com os padrões', () => {
    const p = partnerFromDoc('x', { name: 'Antigo', coverUrl: 'http://inseguro', featured: 'sim' });
    expect(p.coverUrl).toBeNull();
    expect(p.featured).toBeFalse();
    expect(p.startsAt).toBeNull();
    expect(p.requirement).toEqual({ type: 'none' });
    expect(p.locations).toEqual([]);
  });

  it('capa: tipos e tamanho do Storage, caminho com -cover- e 16:9', () => {
    expect(coverFileError({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(coverFileError({ type: 'image/gif', size: 1000 })).toContain('JPG');
    expect(coverFileError({ type: 'image/webp', size: 2 * 1024 * 1024 })).toContain('2 MB');
    const now = new Date(1_763_300_000_000);
    expect(coverStoragePath('fast-acai', 'image/webp', now)).toBe('app/partners/fast-acai-cover-1763300000000.webp');
    expect(coverStoragePath('', 'image/png', now)).toBe('app/partners/parceiro-cover-1763300000000.png');
    expect(aspectDrift(1600, 900)).toBeCloseTo(0);
    expect(aspectDrift(1000, 1000)).toBeGreaterThan(0.05);
  });
});

describe('clube v2: avisar atletas', () => {
  const now = new Date(2026, 10, 16);
  const ok = { saved: true, dirty: false, active: true, validUntil: new Date(2026, 10, 20) };

  it('só parceiro salvo, sem alteração pendente e ativo; "acabando" exige fim no futuro', async () => {
    const { notifyBlocker } = await import('./partner-premium');
    expect(notifyBlocker('new', ok, now)).toBeNull();
    expect(notifyBlocker('ending', ok, now)).toBeNull();
    expect(notifyBlocker('new', { ...ok, saved: false }, now)).toContain('Salve o parceiro');
    expect(notifyBlocker('new', { ...ok, dirty: true }, now)).toContain('alterações');
    expect(notifyBlocker('new', { ...ok, active: false }, now)).toContain('Ative');
    expect(notifyBlocker('ending', { ...ok, validUntil: null }, now)).toContain('data de fim');
    expect(notifyBlocker('ending', { ...ok, validUntil: new Date(2026, 10, 1) }, now)).toContain('terminou');
  });

  it('resultado da callable e o texto do confirm', async () => {
    const { notifyResultOf, recipientsLabel } = await import('./partner-premium');
    expect(notifyResultOf({ recipients: 12, sent: 10 })).toEqual({ recipients: 12, sent: 10 });
    expect(notifyResultOf(undefined)).toEqual({ recipients: 0, sent: 0 });
    expect(recipientsLabel(1)).toBe('Vai para 1 pessoa');
    expect(recipientsLabel(1234)).toBe('Vai para 1.234 pessoas');
  });
});
