import {
  displayLinkUrl,
  normalizeLinkUrl,
  slugifyLinkPage,
  sortPageLinks,
  topLinkOf,
  validateLinkPageSlug,
  validateLinkUrl,
  viewsTrendPercent,
  type PageLink,
} from '@nexago/link-pages';

/** Regras da página de links que valem para os dois portais (arena e organizador). */

function link(overrides: Partial<PageLink> & Pick<PageLink, 'id'>): PageLink {
  return {
    title: 'Link',
    subtitle: '',
    url: 'https://nexago.com.br',
    icon: 'link',
    active: true,
    featured: false,
    live: false,
    order: 0,
    clicks: 0,
    clicks30d: 0,
    ...overrides,
  };
}

describe('slugifyLinkPage', () => {
  it('remove acentos e normaliza para kebab-case', () => {
    expect(slugifyLinkPage('Arena Ação & Beach')).toBe('arena-acao-beach');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(slugifyLinkPage('  --Arena--  ')).toBe('arena');
  });
});

describe('validateLinkPageSlug', () => {
  it('aceita slug simples', () => {
    expect(validateLinkPageSlug('arena-cfc')).toBeNull();
  });

  it('recusa slug curto demais', () => {
    expect(validateLinkPageSlug('ab')).not.toBeNull();
  });

  it('recusa caracteres fora de [a-z0-9-]', () => {
    expect(validateLinkPageSlug('Arena_CFC')).not.toBeNull();
  });

  it('recusa endereço reservado do site', () => {
    expect(validateLinkPageSlug('torneios')).not.toBeNull();
  });
});

describe('normalizeLinkUrl / validateLinkUrl', () => {
  it('completa o esquema quando o usuário digita só o domínio', () => {
    expect(normalizeLinkUrl('wa.me/5562998210034')).toBe('https://wa.me/5562998210034');
  });

  it('preserva https e mailto', () => {
    expect(normalizeLinkUrl('https://nexago.com.br')).toBe('https://nexago.com.br');
    expect(normalizeLinkUrl('mailto:oi@nexago.com.br')).toBe('mailto:oi@nexago.com.br');
  });

  it('recusa destino sem domínio válido', () => {
    expect(validateLinkUrl('localhost')).not.toBeNull();
  });

  it('aceita destino válido', () => {
    expect(validateLinkUrl('instagram.com/arena.cfc')).toBeNull();
  });

  it('encurta a URL para exibição', () => {
    expect(displayLinkUrl('https://nexago.com.br/a/arena-cfc/')).toBe('nexago.com.br/a/arena-cfc');
  });
});

describe('sortPageLinks', () => {
  it('põe o destaque no topo e mantém a ordem manual no resto', () => {
    const ordered = sortPageLinks([
      link({ id: 'b', order: 1 }),
      link({ id: 'a', order: 0 }),
      link({ id: 'destaque', order: 5, featured: true }),
    ]);
    expect(ordered.map((l) => l.id)).toEqual(['destaque', 'a', 'b']);
  });
});

describe('viewsTrendPercent', () => {
  it('calcula a variação contra os 30 dias anteriores', () => {
    expect(viewsTrendPercent({ views30d: 118, viewsPrev30d: 100 })).toBe(18);
  });

  it('devolve null sem base de comparação', () => {
    expect(viewsTrendPercent({ views30d: 40, viewsPrev30d: 0 })).toBeNull();
  });
});

describe('topLinkOf', () => {
  it('devolve o mais clicado e a fatia do total', () => {
    const top = topLinkOf([
      link({ id: 'a', clicks30d: 30 }),
      link({ id: 'b', clicks30d: 70 }),
    ]);
    expect(top?.link.id).toBe('b');
    expect(top?.share).toBe(70);
  });

  it('devolve null quando ninguém clicou', () => {
    expect(topLinkOf([link({ id: 'a' })])).toBeNull();
  });
});
