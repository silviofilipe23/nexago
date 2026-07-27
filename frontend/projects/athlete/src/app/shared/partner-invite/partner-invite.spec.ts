import {
  PARTNER_INVITE_CONTEXT_KEY,
  PARTNER_INVITE_CONTEXT_TTL_MS,
  buildPartnerInviteMessage,
  buildPartnerInviteUrl,
  clearPartnerLinkInviteMarker,
  isSafeInviteId,
  peekPartnerInviteContext,
  readPartnerLinkInviteMarker,
  savePartnerLinkInviteMarker,
  stashPartnerInviteContext,
  takePartnerInviteContext,
  whatsAppShareUrl,
} from './partner-invite';

describe('isSafeInviteId', () => {
  it('aceita IDs de doc do Firestore', () => {
    expect(isSafeInviteId('abc123')).toBeTrue();
    expect(isSafeInviteId('a_b-C9')).toBeTrue();
  });

  it('rejeita vazio, nulo e caracteres de URL/rota', () => {
    expect(isSafeInviteId(null)).toBeFalse();
    expect(isSafeInviteId('')).toBeFalse();
    expect(isSafeInviteId('a/b')).toBeFalse();
    expect(isSafeInviteId('a?x=1')).toBeFalse();
    expect(isSafeInviteId('a b')).toBeFalse();
  });
});

describe('buildPartnerInviteUrl', () => {
  it('monta o link completo com ref, torneio, categoria e nome', () => {
    const url = buildPartnerInviteUrl('https://atleta.nexago.app', {
      referralCode: 'uid123',
      tournamentId: 'tor1',
      categoryId: 'cat1',
      inviterName: 'Ana Souza',
    });
    expect(url).toBe('https://atleta.nexago.app/cadastro?ref=uid123&torneio=tor1&categoria=cat1&de=Ana+Souza');
  });

  it('omite partes inválidas ou ausentes', () => {
    const url = buildPartnerInviteUrl('https://x.app', {
      referralCode: 'uid123',
      tournamentId: null,
      categoryId: 'a/b',
      inviterName: '  ',
    });
    expect(url).toBe('https://x.app/cadastro?ref=uid123');
  });
});

describe('buildPartnerInviteMessage', () => {
  it('personaliza a saudação com o nome do parceiro', () => {
    const msg = buildPartnerInviteMessage({
      partnerName: 'Bia',
      tournamentName: 'Etapa Verão',
      categoryName: 'Mista C',
      url: 'https://x.app/cadastro?ref=u',
    });
    expect(msg).toContain('Fala, Bia!');
    expect(msg).toContain('Etapa Verão (Mista C)');
    expect(msg).toContain('https://x.app/cadastro?ref=u');
  });

  it('usa saudação genérica sem nome', () => {
    const msg = buildPartnerInviteMessage({
      partnerName: null,
      tournamentName: 'Etapa Verão',
      categoryName: 'Mista C',
      url: 'https://x.app/cadastro',
    });
    expect(msg.startsWith('Fala! ')).toBeTrue();
  });
});

describe('whatsAppShareUrl', () => {
  it('escapa o texto no wa.me', () => {
    expect(whatsAppShareUrl('oi & tchau')).toBe('https://wa.me/?text=oi%20%26%20tchau');
  });
});

describe('contexto do convidado (stash em localStorage)', () => {
  const CTX = { referralCode: 'uid123', tournamentId: 'tor1', categoryId: 'cat1', inviterName: 'Ana' };

  beforeEach(() => localStorage.removeItem(PARTNER_INVITE_CONTEXT_KEY));

  it('faz roundtrip de stash e peek', () => {
    stashPartnerInviteContext(CTX, 1000);
    expect(peekPartnerInviteContext(2000)).toEqual(CTX);
  });

  it('take retorna e limpa', () => {
    stashPartnerInviteContext(CTX, 1000);
    expect(takePartnerInviteContext(2000)).toEqual(CTX);
    expect(peekPartnerInviteContext(3000)).toBeNull();
  });

  it('expira depois da janela de atribuição', () => {
    stashPartnerInviteContext(CTX, 1000);
    expect(peekPartnerInviteContext(1000 + PARTNER_INVITE_CONTEXT_TTL_MS + 1)).toBeNull();
  });

  it('descarta IDs inválidos guardados', () => {
    stashPartnerInviteContext({ ...CTX, tournamentId: 'a/b' }, 1000);
    expect(peekPartnerInviteContext(2000)?.tournamentId).toBeNull();
  });

  it('ignora payload corrompido', () => {
    localStorage.setItem(PARTNER_INVITE_CONTEXT_KEY, '{nope');
    expect(peekPartnerInviteContext()).toBeNull();
  });
});

describe('marcador "convite por link enviado"', () => {
  beforeEach(() => clearPartnerLinkInviteMarker('tor1', 'cat1'));

  it('faz roundtrip por torneio/categoria', () => {
    savePartnerLinkInviteMarker('tor1', 'cat1', 'Bia', 42);
    expect(readPartnerLinkInviteMarker('tor1', 'cat1')).toEqual({ partnerName: 'Bia', sentAt: 42 });
    expect(readPartnerLinkInviteMarker('tor1', 'outra')).toBeNull();
  });

  it('normaliza nome vazio para null e limpa', () => {
    savePartnerLinkInviteMarker('tor1', 'cat1', '   ', 42);
    expect(readPartnerLinkInviteMarker('tor1', 'cat1')?.partnerName).toBeNull();
    clearPartnerLinkInviteMarker('tor1', 'cat1');
    expect(readPartnerLinkInviteMarker('tor1', 'cat1')).toBeNull();
  });
});
