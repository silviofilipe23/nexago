import {
  ctaSummary,
  defaultConsentText,
  defaultLeadSuccessMessage,
  emptyPartnerForm,
  formFromPartner,
  initialsOf,
  isValidPartnerId,
  logoFileError,
  logoStoragePath,
  normalizeColor,
  parseCities,
  parseSteps,
  partnerFromDoc,
  partnerPayload,
  payloadWith,
  slugify,
  sortPartners,
  textOnColor,
  uniquePartnerId,
  validatePartnerForm,
  type PartnerForm,
} from './partner';

/** Allowlist da rule `partnerValid` menos os campos de autoria, que o repositório acrescenta. */
const RULE_CONTENT_FIELDS = [
  'name',
  'logoUrl',
  'category',
  'benefitHighlight',
  'benefitTitle',
  'description',
  'howToUse',
  'terms',
  'ctaType',
  'ctaLabel',
  'link',
  'appRoute',
  'couponMode',
  'couponCode',
  'brandColor',
  'cities',
  'isMasterSponsor',
  'priority',
  'active',
  'audience',
  'leadConsentText',
  'leadSuccessMessage',
  // v2 (premium)
  'coverUrl',
  'startsAt',
  'validUntil',
  'featured',
  'placements',
  'couponUrlParam',
  'termsTags',
  'locations',
  'requirement',
  'requirementLabel',
  'levelTiers',
].sort();

function fastForm(over: Partial<PartnerForm> = {}): PartnerForm {
  return {
    ...emptyPartnerForm(),
    name: '  Fast Açaí ',
    category: 'food',
    brandColor: '#5e1e7a',
    cities: 'Goiânia, Anápolis , goiânia, ',
    benefitHighlight: '10% OFF',
    benefitTitle: '10% de desconto em todo pedido',
    howToUse: 'Toque em Pedir.\n\n  Monte o pedido. \nUse o cupom.',
    ctaType: 'link',
    ctaLabel: 'Pedir com 10% off',
    link: 'https://fast.example/cardapio',
    couponMode: 'fixed',
    couponCode: ' NEXAGO10 ',
    leadConsentText: 'sobra de quando era formulário',
    audience: 'all',
    priority: '50',
    active: true,
    ...over,
  };
}

describe('clube: parceiro', () => {
  it('payload tem exatamente os campos da allowlist da rule (sem autoria)', () => {
    const payload = partnerPayload(fastForm());
    expect(Object.keys(payload).sort()).toEqual(RULE_CONTENT_FIELDS);
  });

  it('payload normaliza texto, cidades, passos, cor e prioridade', () => {
    const payload = partnerPayload(fastForm());
    expect(payload).toEqual({
      name: 'Fast Açaí',
      logoUrl: null,
      category: 'food',
      benefitHighlight: '10% OFF',
      benefitTitle: '10% de desconto em todo pedido',
      description: '',
      howToUse: ['Toque em Pedir.', 'Monte o pedido.', 'Use o cupom.'],
      terms: '',
      ctaType: 'link',
      ctaLabel: 'Pedir com 10% off',
      link: 'https://fast.example/cardapio',
      appRoute: null,
      couponMode: 'fixed',
      couponCode: 'NEXAGO10',
      brandColor: '#5E1E7A',
      cities: ['Goiânia', 'Anápolis'],
      isMasterSponsor: false,
      priority: 50,
      active: true,
      audience: 'all',
      leadConsentText: null,
      leadSuccessMessage: null,
      coverUrl: null,
      startsAt: null,
      validUntil: null,
      featured: false,
      placements: [],
      couponUrlParam: null,
      termsTags: [],
      locations: [],
      requirement: { type: 'none' },
      requirementLabel: null,
      levelTiers: [],
    });
  });

  it('formulário de lead zera o link; cupom fora do fixo zera o código; vazio vira null', () => {
    const payload = partnerPayload(
      fastForm({ ctaType: 'lead_form', couponMode: 'athlete', leadConsentText: '  ', leadSuccessMessage: ' Pronto! ' }),
    );
    expect(payload.link).toBeNull();
    expect(payload.couponCode).toBeNull();
    expect(payload.leadConsentText).toBeNull();
    expect(payload.leadSuccessMessage).toBe('Pronto!');
  });

  it('form válido não tem erro', () => {
    expect(validatePartnerForm(fastForm())).toEqual({});
  });

  it('valida os limites da rule com mensagem em português', () => {
    const errors = validatePartnerForm(
      fastForm({
        name: ' ',
        benefitHighlight: 'x'.repeat(25),
        benefitTitle: 'x'.repeat(81),
        description: 'x'.repeat(601),
        howToUse: 'a\nb\nc\nd',
        terms: 'x'.repeat(2001),
        ctaLabel: 'x'.repeat(33),
        brandColor: 'roxo',
        couponCode: 'x'.repeat(25),
        priority: 'alta',
        cities: Array.from({ length: 51 }, (_, i) => `Cidade ${i}`).join(','),
      }),
    );
    expect(errors.name).toBe('Informe o nome do parceiro.');
    expect(errors.benefitHighlight).toContain('Até 24');
    expect(errors.benefitTitle).toContain('Até 80');
    expect(errors.description).toContain('Até 600');
    expect(errors.howToUse).toContain('3 passos');
    expect(errors.terms).toContain('Até 2000');
    expect(errors.ctaLabel).toContain('Até 32');
    expect(errors.brandColor).toContain('#RRGGBB');
    expect(errors.couponCode).toContain('Até 24');
    expect(errors.priority).toBeDefined();
    expect(errors.cities).toContain('50');
  });

  it('link: https obrigatório para ativar; desligado pode ficar sem; http é recusado', () => {
    expect(validatePartnerForm(fastForm({ link: '' })).link).toContain('para ativar');
    expect(validatePartnerForm(fastForm({ link: '', active: false })).link).toBeUndefined();
    expect(validatePartnerForm(fastForm({ link: 'http://fast.example' })).link).toContain('https://');
    expect(partnerPayload(fastForm({ link: '', active: false })).link).toBeNull();
  });

  it('tela do app: caminho interno opcional; ativa sem link; recusa URL e barra dupla; some no formulário', () => {
    const vegeton = fastForm({ appRoute: ' /arena/TtYSz7IaOHB7Hf7CXdIr ' });
    expect(validatePartnerForm(vegeton).appRoute).toBeUndefined();
    expect(partnerPayload(vegeton).appRoute).toBe('/arena/TtYSz7IaOHB7Hf7CXdIr');
    expect(validatePartnerForm(fastForm({ link: '', appRoute: '/arena/x' })).link).toBeUndefined();
    for (const bad of ['arena/x', 'https://atleta.nexago.com.br/reservar/x', '//evil.example/x', '/arena x']) {
      expect(validatePartnerForm(fastForm({ appRoute: bad })).appRoute).toContain('começando com /');
    }
    expect(partnerPayload(fastForm()).appRoute).toBeNull();
    expect(partnerPayload(fastForm({ ctaType: 'lead_form', appRoute: '/arena/x' })).appRoute).toBeNull();
    expect(partnerFromDoc('v', { appRoute: '//evil.example' }).appRoute).toBeNull();
    expect(formFromPartner(partnerFromDoc('v', { appRoute: '/arena/x' })).appRoute).toBe('/arena/x');
  });

  it('cupom fixo exige o código; formulário confere consentimento e mensagem', () => {
    expect(validatePartnerForm(fastForm({ couponCode: ' ' })).couponCode).toBe('Informe o código do cupom.');
    const errors = validatePartnerForm(
      fastForm({ ctaType: 'lead_form', link: '', leadConsentText: 'x'.repeat(601), leadSuccessMessage: 'x'.repeat(161) }),
    );
    expect(errors.link).toBeUndefined();
    expect(errors.leadConsentText).toContain('Até 600');
    expect(errors.leadSuccessMessage).toContain('Até 160');
  });

  it('lê doc incompleto sem quebrar e volta ao mesmo form', () => {
    const p = partnerFromDoc('x', { name: 'LinQ', category: 'bogus', brandColor: 'azul', priority: 'alta', howToUse: [1, ' ', 'a'] });
    expect(p.category).toBe('other');
    expect(p.brandColor).toBe('#FF6A1A');
    expect(p.priority).toBe(0);
    expect(p.howToUse).toEqual(['a']);
    expect(p.active).toBeFalse();
    const form = formFromPartner(partnerFromDoc('fast-acai', partnerPayload(fastForm()) as unknown as Record<string, unknown>));
    expect(partnerPayload(form)).toEqual(partnerPayload(fastForm()));
  });

  it('payloadWith (toggle da tabela) grava o doc inteiro ou explica o que falta', () => {
    const seed = partnerFromDoc('fast-acai', { ...partnerPayload(fastForm({ link: '', active: false })) });
    expect(payloadWith(seed, { active: true })).toEqual({ error: 'Informe o link (https://) para ativar o parceiro.' });
    const ok = payloadWith(partnerFromDoc('fast-acai', { ...partnerPayload(fastForm()) }), { active: false });
    expect('error' in ok).toBeFalse();
    expect((ok as { active: boolean }).active).toBeFalse();
    expect(Object.keys(ok).sort()).toEqual(RULE_CONTENT_FIELDS);
  });

  it('cidades e passos: separa, apara e tira repetido', () => {
    expect(parseCities(' Goiânia ,, São  Paulo, GOIÂNIA ')).toEqual(['Goiânia', 'São Paulo']);
    expect(parseCities('')).toEqual([]);
    expect(parseSteps('\n a \n\nb\n')).toEqual(['a', 'b']);
  });

  it('cor: aceita sem # e em minúscula; texto contrasta com a cor', () => {
    expect(normalizeColor('5e1e7a')).toBe('#5E1E7A');
    expect(normalizeColor('#abc')).toBe('#abc');
    expect(textOnColor('#5E1E7A')).toBe('#FFFFFF');
    expect(textOnColor('#F4C543')).toBe('#0A0A0A');
  });

  it('ordena por prioridade (maior primeiro) e depois por nome', () => {
    const list = [
      partnerFromDoc('b', { name: 'Beta', priority: 10 }),
      partnerFromDoc('a', { name: 'Alfa', priority: 10 }),
      partnerFromDoc('l', { name: 'LinQ', priority: 100 }),
    ];
    expect(sortPartners(list).map((p) => p.id)).toEqual(['l', 'a', 'b']);
  });
});

describe('clube: id do parceiro', () => {
  it('slug do nome: sem acento, minúsculo, hífen, até 60', () => {
    expect(slugify('Fast Açaí')).toBe('fast-acai');
    expect(slugify('  LinQ — Telecom!! ')).toBe('linq-telecom');
    expect(slugify('***')).toBe('');
    const long = slugify('a'.repeat(59) + ' bcd');
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('-')).toBeFalse();
    expect(isValidPartnerId(long)).toBeTrue();
  });

  it('único: acrescenta -2, -3 quando o slug já existe; nunca "novo"', () => {
    expect(uniquePartnerId('Fast Açaí', new Set())).toBe('fast-acai');
    expect(uniquePartnerId('Fast Açaí', new Set(['fast-acai']))).toBe('fast-acai-2');
    expect(uniquePartnerId('Fast Açaí', new Set(['fast-acai', 'fast-acai-2']))).toBe('fast-acai-3');
    expect(uniquePartnerId('!!!', new Set())).toBeNull();
    expect(uniquePartnerId('Novo', new Set())).toBe('novo-parceiro');
    const id = uniquePartnerId('x'.repeat(70), new Set(['x'.repeat(60)]))!;
    expect(id.length).toBeLessThanOrEqual(60);
    expect(id.endsWith('-2')).toBeTrue();
    expect(isValidPartnerId('novo')).toBeFalse();
    expect(isValidPartnerId('Fast')).toBeFalse();
  });
});

describe('clube: apresentação e logo', () => {
  it('iniciais e resumo do botão', () => {
    expect(initialsOf('Fast Açaí')).toBe('FA');
    expect(initialsOf('LinQ')).toBe('LI');
    expect(initialsOf('  ')).toBe('?');
    expect(ctaSummary({ ctaType: 'link', couponMode: 'fixed', couponCode: 'NEXAGO10' })).toBe('Link + cupom NEXAGO10');
    expect(ctaSummary({ ctaType: 'link', couponMode: 'athlete', couponCode: null })).toBe('Link + cupom por atleta');
    expect(ctaSummary({ ctaType: 'lead_form', couponMode: 'none', couponCode: null })).toBe('Formulário');
  });

  it('textos padrão do formulário espelham o backend', () => {
    expect(defaultConsentText('LinQ Telecom')).toBe(
      'Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP com a LinQ Telecom para que ela entre em contato comigo sobre esta oferta.',
    );
    expect(defaultLeadSuccessMessage('LinQ')).toBe('Pronto! A LinQ vai falar com você pelo WhatsApp');
  });

  it('logo: tipo e tamanho da rule do Storage; nome único por envio', () => {
    expect(logoFileError({ type: 'image/png', size: 1000 })).toBeNull();
    expect(logoFileError({ type: 'image/gif', size: 1000 })).toContain('PNG');
    expect(logoFileError({ type: 'image/webp', size: 2 * 1024 * 1024 })).toContain('2 MB');
    const now = new Date(1_763_300_000_000);
    expect(logoStoragePath('fast-acai', 'image/png', now)).toBe('app/partners/fast-acai-1763300000000.png');
    expect(logoStoragePath('', 'image/jpeg', now)).toBe('app/partners/parceiro-1763300000000.jpg');
  });
});
