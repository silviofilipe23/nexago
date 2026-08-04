import {
  slugifyTournamentName,
  toTournamentSlugId,
  tournamentQrFileName,
  tournamentShareLink,
  tournamentShareMessage,
  whatsAppShareUrl,
} from './tournament-share';

const BASES = {
  siteBaseUrl: 'https://nexago.com.br',
  athleteBaseUrl: 'https://atleta.nexago.com.br',
};

describe('slugifyTournamentName', () => {
  it('remove acentos e vira kebab-case', () => {
    expect(slugifyTournamentName('Copa de Verão — Etapa 1')).toBe('copa-de-verao-etapa-1');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(slugifyTournamentName('  ¡Torneio!  ')).toBe('torneio');
  });

  it('corta em 60 chars sem terminar em hífen', () => {
    const slug = slugifyTournamentName('a'.repeat(58) + ' bc');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBeFalse();
  });

  it('devolve vazio quando o nome não tem nenhum caractere aproveitável', () => {
    expect(slugifyTournamentName('※※※')).toBe('');
  });
});

describe('toTournamentSlugId', () => {
  it('junta slug e id', () => {
    expect(toTournamentSlugId('Copa de Verão', 'aBc123')).toBe('copa-de-verao-aBc123');
  });

  it('cai pro id puro quando o nome não gera slug', () => {
    expect(toTournamentSlugId('※※※', 'aBc123')).toBe('aBc123');
  });
});

describe('tournamentShareLink', () => {
  it('torneio público vai pra página do site, já na URL canônica', () => {
    const link = tournamentShareLink(
      { id: 'aBc123', name: 'Copa de Verão', visibility: 'publicListing' },
      BASES,
    );
    expect(link).toEqual({ url: 'https://nexago.com.br/torneios/copa-de-verao-aBc123', target: 'site' });
  });

  it('torneio somente-link vai direto pra inscrição no portal do atleta', () => {
    const link = tournamentShareLink(
      { id: 'aBc123', name: 'Copa de Verão', visibility: 'linkOnly' },
      BASES,
    );
    expect(link).toEqual({
      url: 'https://atleta.nexago.com.br/torneios/aBc123/inscricao',
      target: 'inscricao',
    });
  });

  it('não duplica a barra quando a base termina em /', () => {
    const link = tournamentShareLink(
      { id: 'aBc123', name: 'Copa', visibility: 'linkOnly' },
      { ...BASES, athleteBaseUrl: 'https://atleta.nexago.com.br/' },
    );
    expect(link.url).toBe('https://atleta.nexago.com.br/torneios/aBc123/inscricao');
  });
});

describe('tournamentShareMessage', () => {
  it('põe local e período na linha de baixo do nome', () => {
    const text = tournamentShareMessage({
      name: 'Copa de Verão',
      place: 'Arena CFC, Goiânia',
      dateLabel: '12 – 14 set',
      url: 'https://nexago.com.br/torneios/copa-de-verao-aBc123',
    });
    expect(text).toBe(
      '🏆 Copa de Verão\nArena CFC, Goiânia · 12 – 14 set\n\n' +
        'Inscrições abertas! Garanta sua vaga:\n' +
        'https://nexago.com.br/torneios/copa-de-verao-aBc123',
    );
  });

  /** Nome de etapa já costuma ter travessão — a linha de detalhes não pode emendar nele. */
  it('não gera travessão duplo com nome de etapa', () => {
    const text = tournamentShareMessage({
      name: 'Copa de Verão — Etapa 2',
      place: 'Arena CFC',
      dateLabel: null,
      url: 'https://x',
    });
    expect(text.startsWith('🏆 Copa de Verão — Etapa 2\nArena CFC\n\n')).toBeTrue();
  });

  it('não deixa linha vazia quando não há local nem data', () => {
    const text = tournamentShareMessage({ name: 'Copa', place: null, dateLabel: null, url: 'https://x' });
    expect(text).toBe('🏆 Copa\n\nInscrições abertas! Garanta sua vaga:\nhttps://x');
  });

  it('ignora local em branco e mantém só a data', () => {
    const text = tournamentShareMessage({ name: 'Copa', place: '   ', dateLabel: '12 set', url: 'https://x' });
    expect(text).toContain('🏆 Copa\n12 set');
  });
});

describe('whatsAppShareUrl', () => {
  it('escapa o texto', () => {
    expect(whatsAppShareUrl('oi & tchau')).toBe('https://wa.me/?text=oi%20%26%20tchau');
  });
});

describe('tournamentQrFileName', () => {
  it('usa o slug do torneio', () => {
    expect(tournamentQrFileName('Copa de Verão', 'aBc123')).toBe('torneio-copa-de-verao-aBc123-qr.png');
  });
});
