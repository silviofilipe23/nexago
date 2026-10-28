import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import type { InscricaoRow, PayStatus } from './inscricoes.model';
import {
  STORY_PER_PAGE,
  buildInscricoesStory,
  shortAthleteName,
  storyDateLabel,
  storyFileName,
  storyInitials,
  type StoryOptions,
} from './inscricoes-story';

type StoryTournament = Parameters<typeof buildInscricoesStory>[1];

function category(over: Partial<OrganizerTournamentCategory> = {}): OrganizerTournamentCategory {
  return {
    id: 'fem',
    name: 'Feminino Open',
    maxTeams: 16,
    teamSize: null,
    ...over,
  } as OrganizerTournamentCategory;
}

function tournament(over: Partial<StoryTournament> = {}): StoryTournament {
  return {
    name: 'Copa Verão',
    status: 'inscricoes',
    startAt: new Date(2026, 7, 4),
    endAt: new Date(2026, 7, 5),
    location: 'Arena CFC',
    city: 'Goiânia',
    categories: [category()],
    ...over,
  } as Pick<OrganizerTournament, keyof StoryTournament>;
}

let seq = 0;
function row(
  names: string[],
  pay: PayStatus = 'pago',
  over: Partial<InscricaoRow> = {},
): InscricaoRow {
  seq++;
  return {
    id: `r${String(seq).padStart(3, '0')}`,
    name: names.join(' / '),
    athletes: names.map((n, i) => ({
      uid: `u${seq}-${i}`,
      name: n,
      fullName: n,
      nickname: '',
      email: '',
      photoUrl: null,
      lgpdAccepted: true,
      phone: '',
      sharePaid: false,
      organizerConfirmedShare: false,
    })),
    categoriaId: 'fem',
    categoria: 'Feminino Open',
    pay,
    payNote: null,
    payTitle: '',
    canRevertPayment: false,
    partialPayment: false,
    roster: null,
    cancelPending: false,
    cancelReason: '',
    lgpd: 'aceito',
    lgpdMissing: [],
    date: '',
    time: '',
    dateLong: '',
    createdAt: new Date(2026, 6, 1, 8, seq),
    search: '',
    ...over,
  };
}

const OPTS: StoryOptions = { categoryId: 'fem', paidOnly: false, showSpots: true };

describe('shortAthleteName', () => {
  it('encolhe o sobrenome para a inicial, como no protótipo ("Ana F.")', () => {
    expect(shortAthleteName('Ana Ferreira')).toBe('Ana F.');
  });

  // A inicial que identifica a pessoa é a do sobrenome de família, não a do segundo nome.
  it('usa o último sobrenome, pulando partícula e sufixo', () => {
    expect(shortAthleteName('Maria Eduarda Lima')).toBe('Maria L.');
    expect(shortAthleteName('João da Silva Júnior')).toBe('João S.');
    expect(shortAthleteName('Pedro Souza Filho')).toBe('Pedro S.');
  });

  it('mantém o nome de uma palavra só (apelido)', () => {
    expect(shortAthleteName('Duda')).toBe('Duda');
    expect(shortAthleteName('  Duda  ')).toBe('Duda');
  });

  it('inicial acentuada sai maiúscula', () => {
    expect(shortAthleteName('Bia élida')).toBe('Bia É.');
  });
});

describe('storyInitials', () => {
  it('primeiro nome + último sobrenome', () => {
    expect(storyInitials('Ana Paula Ferreira')).toBe('AF');
    expect(storyInitials('Duda')).toBe('D');
    expect(storyInitials('')).toBe('');
  });
});

describe('storyDateLabel', () => {
  it('mesmo mês vira "04–05 Ago"', () => {
    expect(storyDateLabel(new Date(2026, 7, 4), new Date(2026, 7, 5))).toBe('04–05 Ago');
  });

  it('meses diferentes mostram os dois', () => {
    expect(storyDateLabel(new Date(2026, 8, 30), new Date(2026, 9, 2))).toBe('30 Set – 02 Out');
  });

  it('um dia só, ou fim igual/anterior ao início, mostra uma data', () => {
    expect(storyDateLabel(new Date(2026, 7, 4, 8), new Date(2026, 7, 4, 20))).toBe('04 Ago');
    expect(storyDateLabel(new Date(2026, 7, 4), null)).toBe('04 Ago');
  });

  it('sem data, nada', () => {
    expect(storyDateLabel(null, null)).toBeNull();
  });
});

describe('buildInscricoesStory', () => {
  beforeEach(() => (seq = 0));

  it('numera na ordem de inscrição — a primeira a entrar é a 01', () => {
    const late = row(['Bia Duarte', 'Ana Ferreira'], 'pago', { createdAt: new Date(2026, 6, 9) });
    const early = row(['Carla Nunes', 'Duda Alves'], 'pago', { createdAt: new Date(2026, 6, 2) });
    const story = buildInscricoesStory([late, early], tournament(), OPTS);
    expect(story.pages[0]!.entries.map((e) => [e.position, e.label])).toEqual([
      [1, 'Carla N. / Duda A.'],
      [2, 'Bia D. / Ana F.'],
    ]);
  });

  it('fila de espera fica de fora da arte e da conta de vagas', () => {
    const story = buildInscricoesStory(
      [row(['Ana A', 'Bia B']), row(['Cid C', 'Duda D'], 'espera')],
      tournament(),
      OPTS,
    );
    expect(story.count).toBe(1);
    expect(story.spotsAvailable).toBe(15);
  });

  // "Só pagas" esconde quem ainda deve; quem declarou o Pix (a conferir) já tem a vaga valendo.
  it('"só pagas" mantém pago e a conferir, tira pendente — mas as vagas seguem contando todos', () => {
    const rows = [
      row(['A A', 'B B'], 'pago'),
      row(['C C', 'D D'], 'conferir'),
      row(['E E', 'F F'], 'pendente'),
    ];
    const story = buildInscricoesStory(rows, tournament(), { ...OPTS, paidOnly: true });
    expect(story.pages[0]!.entries.map((e) => e.label)).toEqual(['A A. / B B.', 'C C. / D D.']);
    expect(story.pages[0]!.entries.map((e) => e.position)).toEqual([1, 2]);
    expect(story.spotsAvailable).toBe(13);
  });

  it('só entra a categoria escolhida', () => {
    const story = buildInscricoesStory(
      [row(['A A', 'B B']), row(['C C', 'D D'], 'pago', { categoriaId: 'masc' })],
      tournament({ categories: [category(), category({ id: 'masc', name: 'Masculino Open' })] }),
      { ...OPTS, categoryId: 'masc' },
    );
    expect(story.categoryName).toBe('Masculino Open');
    expect(story.pages[0]!.entries.map((e) => e.label)).toEqual(['C C. / D D.']);
  });

  it(`quebra em stories de ${STORY_PER_PAGE}, mantendo a numeração corrida`, () => {
    const rows = Array.from({ length: 10 }, (_, i) => row([`Atleta ${i}a`, `Atleta ${i}b`]));
    const story = buildInscricoesStory(rows, tournament(), OPTS);
    expect(story.pages.length).toBe(2);
    expect(story.pages.map((p) => [p.index, p.total, p.entries.length])).toEqual([
      [0, 2, 8],
      [1, 2, 2],
    ]);
    expect(story.pages[1]!.entries[0]!.position).toBe(9);
  });

  it('sem ninguém, ainda tem uma página (vazia) pra prévia', () => {
    const story = buildInscricoesStory([], tournament(), OPTS);
    expect(story.count).toBe(0);
    expect(story.pages).toEqual([{ index: 0, total: 1, entries: [] }]);
  });

  describe('vagas restantes', () => {
    it('somem com o toggle desligado, mas continuam calculadas', () => {
      const story = buildInscricoesStory([row(['A A', 'B B'])], tournament(), {
        ...OPTS,
        showSpots: false,
      });
      expect(story.spotsAvailable).toBe(15);
      expect(story.spotsLeft).toBeNull();
    });

    it('categoria sem teto não tem vaga pra mostrar', () => {
      const story = buildInscricoesStory(
        [row(['A A', 'B B'])],
        tournament({ categories: [category({ maxTeams: null })] }),
        OPTS,
      );
      expect(story.spotsLeft).toBeNull();
    });

    it('categoria lotada não mostra "0 vagas"', () => {
      const story = buildInscricoesStory(
        [row(['A A', 'B B']), row(['C C', 'D D'])],
        tournament({ categories: [category({ maxTeams: 2 })] }),
        OPTS,
      );
      expect(story.spotsLeft).toBeNull();
    });
  });

  it('o botão "Inscreva-se" só sai com inscrições abertas', () => {
    expect(buildInscricoesStory([], tournament(), OPTS).cta).toBeTrue();
    expect(buildInscricoesStory([], tournament({ status: 'encerradas' }), OPTS).cta).toBeFalse();
  });

  it('equipe (trio+) mostra o nome da equipe e até 3 avatares', () => {
    const team = row(['Ana Lima', 'Bia Rocha', 'Caio Melo', 'Davi Reis'], 'pago', {
      name: 'Tubarões',
    });
    const story = buildInscricoesStory(
      [team],
      tournament({ categories: [category({ teamSize: 4 })] }),
      OPTS,
    );
    expect(story.unitTitle).toBe('EQUIPES');
    expect(story.unit).toBe('equipe');
    expect(story.pages[0]!.entries[0]).toEqual({
      position: 1,
      label: 'Tubarões',
      initials: ['AL', 'BR', 'CM'],
    });
  });

  it('individual mostra o nome inteiro e concorda o título ("ATLETAS INSCRITOS")', () => {
    const story = buildInscricoesStory(
      [row(['Ana Ferreira'])],
      tournament({ categories: [category({ teamSize: 1 })] }),
      OPTS,
    );
    expect([story.unitTitle, story.unitVerb]).toEqual(['ATLETAS', 'INSCRITOS']);
    expect(story.pages[0]!.entries[0]!.label).toBe('Ana Ferreira');
  });

  it('inscrição sem elenco resolvido vai com o nome da dupla como veio', () => {
    const legacy = row(['Ana / Bia'], 'pago');
    legacy.athletes[0]!.uid = '';
    const story = buildInscricoesStory([legacy], tournament(), OPTS);
    expect(story.pages[0]!.entries[0]).toEqual({
      position: 1,
      label: 'Ana / Bia',
      initials: ['A', 'B'],
    });
  });

  it('local cai na cidade quando não há local', () => {
    expect(buildInscricoesStory([], tournament({ location: null }), OPTS).place).toBe('Goiânia');
  });
});

describe('storyFileName', () => {
  it('slug do evento + categoria, com a página quando há mais de uma', () => {
    const story = { eventName: 'Copa Verão 2026', categoryName: 'Feminino Open' };
    expect(storyFileName(story, { index: 0, total: 1, entries: [] })).toBe(
      'stories-copa-verao-2026-feminino-open.png',
    );
    expect(storyFileName(story, { index: 1, total: 2, entries: [] })).toBe(
      'stories-copa-verao-2026-feminino-open-2-de-2.png',
    );
  });
});
