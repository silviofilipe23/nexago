import {
  slugifyTournamentName,
  spotPassClaimLink,
  spotPassRegistrationLink,
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

describe('links de vaga liberada', () => {
  // O link nominal NÃO carrega token: o passe já está preso ao uid, então quem mais abrir
  // esbarra na categoria lotada. Um token aqui só daria a impressão de segredo.
  it('link nominal aponta para a confirmação da vaga', () => {
    expect(spotPassRegistrationLink('https://atleta.nexago.com.br', 't1', 'cat-a')).toBe(
      'https://atleta.nexago.com.br/vaga/pessoal?t=t1&c=cat-a',
    );
  });

  it('categoria com caracteres especiais é escapada', () => {
    expect(spotPassRegistrationLink('https://a.b', 't1', 'Feminina B/C')).toBe(
      'https://a.b/vaga/pessoal?t=t1&c=Feminina%20B%2FC',
    );
  });

  it('sem categoria, o link ainda vale para qualquer vaga viva do torneio', () => {
    expect(spotPassRegistrationLink('https://a.b', 't1', '')).toBe(
      'https://a.b/vaga/pessoal?t=t1',
    );
  });

  /**
   * O app publicado reivindica estes prefixos como App Link (AndroidManifest) e resolve só
   * eles. Um link de vaga que caia em `/torneios/**` é entregue ao APP, que bloqueia a
   * categoria lotada antes de consultar o servidor — beco sem saída para quem tem a vaga.
   * Enquanto a versão publicada for essa, os links de vaga precisam morar fora daqui.
   */
  const PREFIXOS_DO_APP = ['/torneios', '/torneios-convite', '/convite/', '/convite-dupla'];

  it('nenhum link de vaga cai num caminho que o app publicado sequestra', () => {
    const paths = [
      new URL(spotPassRegistrationLink('https://a.b', 't1', 'c1')).pathname,
      new URL(spotPassClaimLink('https://a.b', 'tok3n')).pathname,
    ];
    for (const path of paths) {
      for (const claimed of PREFIXOS_DO_APP) {
        expect(path.startsWith(claimed))
          .withContext(`${path} começa com ${claimed}, que o app publicado intercepta`)
          .toBeFalse();
      }
    }
  });

  it('link do grupo aponta para a tela de resgate', () => {
    expect(spotPassClaimLink('https://atleta.nexago.com.br', 'tok3n')).toBe(
      'https://atleta.nexago.com.br/vaga/tok3n',
    );
  });

  it('barra sobrando no host não vira barra dupla', () => {
    expect(spotPassClaimLink('https://a.b/', 'tok3n')).toBe('https://a.b/vaga/tok3n');
    expect(spotPassRegistrationLink('https://a.b//', 't1', 'c1')).toBe(
      'https://a.b/vaga/pessoal?t=t1&c=c1',
    );
  });
});
