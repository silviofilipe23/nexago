import {
  buildPredictionShareData,
  predictionShareFileName,
  predictionShareText,
  predictionShareUrl,
  shortDisplayName,
} from './predictions-share';
import type { PredictionLeaderboardRow } from './predictions.selectors';

function row(partial: Partial<PredictionLeaderboardRow> & Pick<PredictionLeaderboardRow, 'rank' | 'userId'>): PredictionLeaderboardRow {
  return { score: 0, picksCount: 0, hits: 0, delta: null, isMe: false, ...partial };
}

const NAMES: Record<string, string> = {
  u1: 'Rafaela Nunes',
  u2: 'Diego Torres',
  u3: 'Carla Menezes',
  eu: 'Marcelo Antunes',
};

const nameOf = (userId: string): string | null => NAMES[userId] ?? null;

describe('shortDisplayName', () => {
  it('mantém o primeiro nome e reduz o resto à inicial', () => {
    expect(shortDisplayName('Marcelo Antunes')).toBe('Marcelo A.');
    expect(shortDisplayName('Ana Paula da Silva')).toBe('Ana S.');
  });

  it('aguenta nome único, espaços sobrando e ausência de nome', () => {
    expect(shortDisplayName('Rafaela')).toBe('Rafaela');
    expect(shortDisplayName('  Diego   Torres  ')).toBe('Diego T.');
    expect(shortDisplayName(null)).toBe('Atleta');
    expect(shortDisplayName('   ')).toBe('Atleta');
  });
});

describe('predictionShareUrl', () => {
  it('aponta para a aba de palpites do torneio no portal', () => {
    expect(predictionShareUrl('https://atleta.nexago.com.br', 't1')).toBe('https://atleta.nexago.com.br/torneios/t1/palpites');
  });

  it('não duplica a barra final da origem', () => {
    expect(predictionShareUrl('https://atleta.nexago.com.br/', 't1')).toBe('https://atleta.nexago.com.br/torneios/t1/palpites');
  });
});

describe('buildPredictionShareData', () => {
  const leaderboard = [
    row({ rank: 1, userId: 'u1', score: 12 }),
    row({ rank: 2, userId: 'u2', score: 9 }),
    row({ rank: 3, userId: 'u3', score: 7 }),
    row({ rank: 4, userId: 'x', score: 5 }),
    row({ rank: 5, userId: 'eu', score: 4, isMe: true }),
  ];

  it('leva o pódio e a linha de quem compartilha quando ela está fora do top 3', () => {
    const data = buildPredictionShareData({
      tournamentName: 'Open Goiânia Beach 2026',
      leaderboard,
      nameOf,
      url: 'https://atleta.nexago.com.br/torneios/t1/palpites',
    });

    expect(data.top.map((r) => r.name)).toEqual(['Rafaela N.', 'Diego T.', 'Carla M.']);
    expect(data.me).toEqual(jasmine.objectContaining({ rank: 5, name: 'Marcelo A.', isMe: true }));
    expect(data.totalPlayers).toBe(5);
    expect(data.urlLabel).toBe('atleta.nexago.com.br/torneios/t1/palpites');
  });

  // Dentro do pódio a linha destacada já é a dele: repetir embaixo mostraria a mesma pessoa duas
  // vezes no mesmo card.
  it('não repete a linha de quem já está no pódio', () => {
    const data = buildPredictionShareData({
      tournamentName: null,
      leaderboard: [row({ rank: 1, userId: 'eu', score: 12, isMe: true }), row({ rank: 2, userId: 'u2', score: 9 })],
      nameOf,
      url: 'https://x/y',
    });
    expect(data.me).toBeNull();
    expect(data.top[0]?.isMe).toBe(true);
  });

  it('aguenta ranking com menos de três participantes', () => {
    const data = buildPredictionShareData({
      tournamentName: null,
      leaderboard: [row({ rank: 1, userId: 'u1', score: 2 })],
      nameOf,
      url: 'https://x/y',
    });
    expect(data.top.length).toBe(1);
    expect(data.me).toBeNull();
  });

  it('cai no rótulo genérico quando o perfil não trouxe nome', () => {
    const data = buildPredictionShareData({
      tournamentName: null,
      leaderboard: [row({ rank: 1, userId: 'desconhecido', score: 1 })],
      nameOf,
      url: 'https://x/y',
    });
    expect(data.top[0]?.name).toBe('Atleta');
  });
});

describe('predictionShareText', () => {
  const url = 'https://atleta.nexago.com.br/torneios/t1/palpites';

  it('provoca com a própria posição quando o atleta está fora do pódio', () => {
    const data = buildPredictionShareData({
      tournamentName: 'Open Goiânia Beach 2026',
      leaderboard: [row({ rank: 1, userId: 'u1', score: 9 }), row({ rank: 5, userId: 'eu', score: 4, isMe: true })],
      nameOf,
      url,
    });
    expect(predictionShareText(data, url)).toBe(
      'Estou em #5 no ranking de palpites do Open Goiânia Beach 2026. Dá o seu: ' + url,
    );
  });

  it('muda o tom quando quem compartilha é o líder', () => {
    const data = buildPredictionShareData({
      tournamentName: 'Open Goiânia Beach 2026',
      leaderboard: [row({ rank: 1, userId: 'eu', score: 9, isMe: true })],
      nameOf,
      url,
    });
    expect(predictionShareText(data, url)).toContain('Estou liderando');
  });

  it('cita o líder quando quem compartilha não palpitou', () => {
    const data = buildPredictionShareData({
      tournamentName: null,
      leaderboard: [row({ rank: 1, userId: 'u1', score: 9 })],
      nameOf,
      url,
    });
    expect(predictionShareText(data, url)).toBe('Rafaela N. lidera o ranking de palpites. Dá o seu: ' + url);
  });
});

describe('predictionShareFileName', () => {
  it('gera um nome de arquivo sem acento nem espaço', () => {
    expect(predictionShareFileName('Open Goiânia Beach 2026')).toBe('nexago-palpites-open-goiania-beach-2026.png');
  });

  it('cai num nome estável sem torneio', () => {
    expect(predictionShareFileName(null)).toBe('nexago-palpites-ranking.png');
    expect(predictionShareFileName('!!!')).toBe('nexago-palpites-ranking.png');
  });
});
