import {
  CATEGORY_LABELS,
  FALLBACK_BRAND_COLOR,
  athleteCode,
  brandTextTone,
  categoriesOf,
  categoryLine,
  clubConfigFromDoc,
  clubErrorMessage,
  clubVisible,
  consentTextFor,
  couponFor,
  ctaHint,
  defaultConsentText,
  emphasize,
  formatWhatsapp,
  heroLine,
  howToUseSteps,
  isAdminClaims,
  isTester,
  maskCep,
  masterSponsor,
  parseClubSource,
  partnerFromDoc,
  partnerInitials,
  partnersInCategory,
  trackedPartnerUrl,
  validateLead,
  visiblePartners,
  type LeadFormInput,
  type Partner,
} from './clube.logic';

function partner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: 'fast-acai',
    name: 'Fast Açaí',
    logoUrl: null,
    category: 'food',
    benefitHighlight: '10% OFF',
    benefitTitle: '10% de desconto em todo pedido',
    description: '',
    howToUse: [],
    terms: '',
    ctaType: 'link',
    ctaLabel: 'Pedir com 10% off',
    link: 'https://fast.example.com/cardapio',
    couponMode: 'fixed',
    couponCode: 'NEXAGO10',
    brandColor: '#5E1E7A',
    cities: [],
    isMasterSponsor: false,
    priority: 50,
    active: true,
    audience: 'all',
    leadConsentText: null,
    leadSuccessMessage: null,
    ...overrides,
  };
}

const LINQ = partner({
  id: 'linq',
  name: 'LinQ Telecom',
  category: 'services',
  benefitHighlight: 'GRÁTIS',
  ctaType: 'lead_form',
  ctaLabel: 'Quero contratar',
  link: null,
  couponMode: 'none',
  couponCode: null,
  brandColor: '#0F62FE',
  isMasterSponsor: true,
  priority: 100,
  audience: 'testers',
});

describe('clube.logic — partnerFromDoc', () => {
  it('lê o doc do seed da Fast Açaí', () => {
    const p = partnerFromDoc('fast-acai', {
      name: ' Fast Açaí ',
      category: 'food',
      benefitHighlight: '10% OFF',
      benefitTitle: '10% de desconto em todo pedido',
      howToUse: ['Passo 1', '', 'Passo 2', 'Passo 3', 'Passo 4'],
      ctaType: 'link',
      ctaLabel: 'Pedir com 10% off',
      link: 'https://fast.example.com',
      couponMode: 'fixed',
      couponCode: 'NEXAGO10',
      brandColor: '#5E1E7A',
      cities: ['Goiânia'],
      priority: 50,
      active: true,
      audience: 'all',
    });
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Fast Açaí');
    expect(p!.howToUse).toEqual(['Passo 1', 'Passo 2', 'Passo 3']);
    expect(p!.cities).toEqual(['Goiânia']);
    expect(p!.couponCode).toBe('NEXAGO10');
  });

  it('é tolerante: campo estranho vira o padrão em vez de derrubar a vitrine', () => {
    const p = partnerFromDoc('x', {
      name: 'Parceiro',
      category: 'carros',
      ctaType: 'whatever',
      couponMode: 42,
      brandColor: 'roxo',
      link: 'http://inseguro.example.com',
      logoUrl: 'javascript:alert(1)',
      priority: 'alta',
      active: 'true',
      audience: 'vip',
      howToUse: 'um texto',
      cities: [1, 'Goiânia'],
    });
    expect(p).toEqual(jasmine.objectContaining({
      category: 'other',
      ctaType: 'link',
      ctaLabel: 'Ver oferta',
      couponMode: 'none',
      brandColor: FALLBACK_BRAND_COLOR,
      link: null,
      logoUrl: null,
      priority: 0,
      active: false,
      audience: 'all',
      howToUse: [],
      cities: ['Goiânia'],
    }));
  });

  it('sem nome, ou com id fora do formato, não entra', () => {
    expect(partnerFromDoc('x', { name: '  ' })).toBeNull();
    expect(partnerFromDoc('x', null)).toBeNull();
    expect(partnerFromDoc('a/b', { name: 'X' })).toBeNull();
  });

  it('formulário sem rótulo ganha "Quero contratar"', () => {
    expect(partnerFromDoc('linq', { name: 'LinQ', ctaType: 'lead_form' })!.ctaLabel).toBe('Quero contratar');
  });
});

describe('clube.logic — config e quem testa', () => {
  it('config ausente é clube desligado sem testadores', () => {
    expect(clubConfigFromDoc(undefined)).toEqual({ enabled: false, testerUids: [] });
    expect(clubConfigFromDoc({ enabled: 'sim', testerUids: ['u1', 2] })).toEqual({ enabled: false, testerUids: ['u1'] });
  });

  it('admin pelas claims: roles com admin ou superAdmin', () => {
    expect(isAdminClaims({ roles: ['athlete', 'admin'] })).toBeTrue();
    expect(isAdminClaims({ superAdmin: true })).toBeTrue();
    expect(isAdminClaims({ roles: ['athlete'] })).toBeFalse();
    expect(isAdminClaims({ superAdmin: 'true' })).toBeFalse();
    expect(isAdminClaims(null)).toBeFalse();
  });

  it('testa quem é admin ou está na lista', () => {
    const config = { enabled: false, testerUids: ['u1'] };
    expect(isTester('u1', false, config)).toBeTrue();
    expect(isTester('u2', false, config)).toBeFalse();
    expect(isTester('u2', true, config)).toBeTrue();
    expect(isTester(null, false, config)).toBeFalse();
  });

  it('o clube aparece com a flag ligada ou para quem testa', () => {
    expect(clubVisible({ enabled: true, testerUids: [] }, false)).toBeTrue();
    expect(clubVisible({ enabled: false, testerUids: [] }, true)).toBeTrue();
    expect(clubVisible({ enabled: false, testerUids: [] }, false)).toBeFalse();
  });
});

describe('clube.logic — visiblePartners', () => {
  const fast = partner();
  const off = partner({ id: 'off', name: 'Desligado', active: false });
  const bsb = partner({ id: 'bsb', name: 'Só Brasília', cities: ['Brasília'] });
  const gyn = partner({ id: 'gyn', name: 'Só Goiânia', cities: ['GOIÂNIA '] });

  it('esconde inativo, parceiro de teste para quem não testa e cidade de fora', () => {
    const list = visiblePartners([fast, off, LINQ, bsb, gyn], false, 'goiania');
    expect(list.map((p) => p.id)).toEqual(['fast-acai', 'gyn']);
  });

  it('quem testa vê o parceiro de teste, em ordem de prioridade', () => {
    const list = visiblePartners([fast, LINQ], true, null);
    expect(list.map((p) => p.id)).toEqual(['linq', 'fast-acai']);
  });

  it('parceiro com cidades some para quem não tem cidade no perfil', () => {
    expect(visiblePartners([gyn], false, '').length).toBe(0);
  });

  it('empate de prioridade vai pelo nome, sem mexer na lista original', () => {
    const b = partner({ id: 'b', name: 'Bravo' });
    const a = partner({ id: 'a', name: 'alfa' });
    const input = [b, a];
    expect(visiblePartners(input, false, null).map((p) => p.id)).toEqual(['a', 'b']);
    expect(input.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('patrocinador oficial e categorias presentes', () => {
    const list = visiblePartners([fast, LINQ], true, null);
    expect(masterSponsor(list)?.id).toBe('linq');
    expect(masterSponsor([fast])).toBeNull();
    expect(categoriesOf(list)).toEqual(['food', 'services']);
    expect(partnersInCategory(list, 'services').map((p) => p.id)).toEqual(['linq']);
    expect(partnersInCategory(list, null).length).toBe(2);
  });

  it('rótulos das categorias', () => {
    expect(CATEGORY_LABELS).toEqual({
      food: 'Alimentação',
      sports: 'Artigos esportivos',
      health: 'Saúde e bem-estar',
      services: 'Serviços',
      leisure: 'Lazer',
      other: 'Outros',
    });
    expect(categoryLine(LINQ)).toBe('Serviços · Oficial');
    expect(categoryLine(fast)).toBe('Alimentação');
  });

  it('linha do hero e dica do botão', () => {
    expect(heroLine(LINQ)).toBe('Patrocinador oficial · Serviços');
    expect(heroLine(partner({ cities: ['Goiânia'] }))).toBe('Alimentação · Goiânia');
    expect(heroLine(fast)).toBe('Alimentação');
    expect(ctaHint(LINQ)).toBe('Seus dados só vão para a LinQ Telecom com a sua autorização');
    expect(ctaHint(fast)).toBe('Abre o site da Fast Açaí numa nova aba');
  });
});

describe('clube.logic — código, cupom e link', () => {
  it('código do atleta: NEXA- e os 4 primeiros alfanuméricos em maiúsculas', () => {
    expect(athleteCode('a1-b2c3d4')).toBe('NEXA-A1B2');
    expect(athleteCode('xY')).toBe('NEXA-XY');
  });

  it('cupom fixo, por atleta ou nenhum', () => {
    expect(couponFor({ couponMode: 'fixed', couponCode: 'NEXAGO10' }, 'abcd1234')).toBe('NEXAGO10');
    expect(couponFor({ couponMode: 'athlete', couponCode: null }, 'abcd1234')).toBe('NEXA-ABCD');
    expect(couponFor({ couponMode: 'none', couponCode: 'X' }, 'abcd1234')).toBeNull();
  });

  it('link marcado preserva a query e o fragmento do parceiro', () => {
    const url = trackedPartnerUrl('https://fast.example.com/menu?loja=12#topo', 'NEXA-ABCD');
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe('https://fast.example.com/menu');
    expect(parsed.hash).toBe('#topo');
    expect(parsed.searchParams.get('loja')).toBe('12');
    expect(parsed.searchParams.get('utm_source')).toBe('nexago');
    expect(parsed.searchParams.get('utm_medium')).toBe('web');
    expect(parsed.searchParams.get('utm_campaign')).toBe('clube_vantagens');
    expect(parsed.searchParams.get('ref')).toBe('NEXA-ABCD');
  });

  it('só https; link quebrado ou ausente não vira botão', () => {
    expect(trackedPartnerUrl('http://fast.example.com', 'NEXA-A')).toBeNull();
    expect(trackedPartnerUrl('javascript:alert(1)', 'NEXA-A')).toBeNull();
    expect(trackedPartnerUrl('não é url', 'NEXA-A')).toBeNull();
    expect(trackedPartnerUrl(null, 'NEXA-A')).toBeNull();
  });

  it('como usar: os passos do parceiro, ou o padrão do tipo de botão', () => {
    expect(howToUseSteps(partner({ howToUse: ['Um', 'Dois'] }), 'X')).toEqual(['Um', 'Dois']);
    const link = howToUseSteps(partner(), 'NEXAGO10');
    expect(link.length).toBe(3);
    expect(link[0]).toContain('Pedir com 10% off');
    expect(link[2]).toBe('No fechamento, use o cupom NEXAGO10.');
    expect(howToUseSteps(partner({ couponMode: 'none' }), null)[2]).not.toContain('cupom');
    expect(howToUseSteps(LINQ, null)).toEqual([
      'Clique em Quero contratar.',
      'Confira seus dados e autorize o envio para a LinQ Telecom.',
      'A LinQ Telecom chama você no WhatsApp.',
    ]);
  });

  it('destaca o botão e o cupom dentro do passo', () => {
    expect(emphasize('No fechamento, use o cupom NEXAGO10.', ['Pedir', 'NEXAGO10', null])).toEqual([
      { text: 'No fechamento, use o cupom ', strong: false },
      { text: 'NEXAGO10', strong: true },
      { text: '.', strong: false },
    ]);
    expect(emphasize('Monte o pedido.', ['NEXAGO10'])).toEqual([{ text: 'Monte o pedido.', strong: false }]);
  });

  it('origem da visita: valores da spec, o resto vira deeplink', () => {
    expect(parseClubSource('competir_web')).toBe('competir_web');
    expect(parseClubSource('hub_card')).toBe('hub_card');
    expect(parseClubSource('push')).toBe('push');
    expect(parseClubSource(undefined)).toBe('deeplink');
    expect(parseClubSource('unknown')).toBe('deeplink');
    expect(parseClubSource('<script>')).toBe('deeplink');
  });
});

describe('clube.logic — formulário do lead', () => {
  function lead(overrides: Partial<LeadFormInput> = {}): LeadFormInput {
    return {
      partnerId: 'linq',
      name: '  Silvio   Dionizio ',
      whatsapp: '(62) 98240-6456',
      neighborhood: ' Setor  Bueno ',
      cep: '74230-010',
      consent: true,
      ...overrides,
    };
  }

  it('normaliza como o servidor', () => {
    expect(validateLead(lead())).toEqual({
      ok: true,
      lead: {
        partnerId: 'linq',
        name: 'Silvio Dionizio',
        whatsapp: '5562982406456',
        neighborhood: 'Setor Bueno',
        cep: '74230010',
      },
    });
    const withDdi = validateLead(lead({ whatsapp: '+55 62 98240-6456' }));
    expect(withDdi.ok && withDdi.lead.whatsapp).toBe('5562982406456');
  });

  it('mesmas mensagens e mesma ordem do parseLead do servidor', () => {
    const error = (o: Partial<LeadFormInput>) => {
      const r = validateLead(lead(o));
      return r.ok ? null : r.error;
    };
    expect(error({ partnerId: 'a/b' })).toBe('Parceiro inválido.');
    expect(error({ consent: false, name: '' })).toBe('Marque a autorização para enviarmos seus dados ao parceiro.');
    expect(error({ name: 'S' })).toBe('Informe seu nome.');
    expect(error({ name: 'x'.repeat(121) })).toBe('Informe seu nome.');
    expect(error({ whatsapp: '123' })).toBe('Informe um WhatsApp com DDD.');
    expect(error({ neighborhood: ' ' })).toBe('Informe seu bairro.');
    expect(error({ cep: '7423' })).toBe('Informe um CEP com 8 números.');
  });

  it('máscara do CEP e telefone do perfil formatado', () => {
    expect(maskCep('74230010')).toBe('74230-010');
    expect(maskCep('742')).toBe('742');
    expect(maskCep('74230-0109999')).toBe('74230-010');
    expect(formatWhatsapp('+5562982406456')).toBe('(62) 98240-6456');
    expect(formatWhatsapp('6232101234')).toBe('(62) 3210-1234');
    expect(formatWhatsapp('123')).toBe('123');
    expect(formatWhatsapp(null)).toBe('');
  });

  it('consentimento padrão IDÊNTICO ao do servidor', () => {
    expect(defaultConsentText('LinQ Telecom')).toBe(
      'Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP com a LinQ Telecom ' +
        'para que ela entre em contato comigo sobre esta oferta.',
    );
    expect(consentTextFor({ name: 'LinQ', leadConsentText: 'Texto do parceiro.' })).toBe('Texto do parceiro.');
    expect(consentTextFor({ name: 'LinQ', leadConsentText: null })).toBe(defaultConsentText('LinQ'));
  });
});

describe('clube.logic — aparência e erros', () => {
  it('texto claro sobre marca escura, escuro sobre marca clara', () => {
    expect(brandTextTone('#5E1E7A')).toBe('light');
    expect(brandTextTone('#0F62FE')).toBe('light');
    expect(brandTextTone('#FFD600')).toBe('dark');
    expect(brandTextTone('#FFFFFF')).toBe('dark');
    expect(brandTextTone('lixo')).toBe(brandTextTone(FALLBACK_BRAND_COLOR));
  });

  it('iniciais do parceiro sem logo', () => {
    expect(partnerInitials('Fast Açaí')).toBe('FA');
    expect(partnerInitials('decathlon')).toBe('DE');
    expect(partnerInitials('  ')).toBe('?');
  });

  it('frase do servidor vai para a tela; código cru do SDK não', () => {
    const fallback = 'Não foi possível enviar agora.';
    expect(clubErrorMessage({ code: 'functions/invalid-argument', message: 'Informe seu bairro.' }, fallback))
      .toBe('Informe seu bairro.');
    expect(clubErrorMessage({ code: 'functions/not-found', message: 'Parceiro não encontrado.' }, fallback))
      .toBe('Parceiro não encontrado.');
    // Callable não publicada: o SDK devolve "NOT FOUND" cru.
    expect(clubErrorMessage({ code: 'functions/not-found', message: 'NOT FOUND' }, fallback)).toBe(fallback);
    expect(clubErrorMessage({ code: 'functions/internal', message: 'internal' }, fallback)).toBe(fallback);
    expect(clubErrorMessage({ code: 'functions/unavailable', message: 'Failed to fetch' }, fallback)).toBe(fallback);
    expect(clubErrorMessage({ code: 'functions/unauthenticated', message: 'x' }, fallback))
      .toBe('Sua sessão expirou. Entre de novo para continuar.');
    expect(clubErrorMessage(new Error('boom'), fallback)).toBe(fallback);
  });
});
