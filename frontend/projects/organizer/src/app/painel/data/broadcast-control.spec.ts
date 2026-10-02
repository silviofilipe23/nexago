import {
  DEFAULT_BROADCAST_CONTROL,
  broadcastControlFromRaw,
  finalPrefOf,
  interviewLineOf,
  interviewOnAirAt,
  interviewWithDefaults,
  type BroadcastInterview,
} from './broadcast-control';

const TARJA: BroadcastInterview = interviewWithDefaults({
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000_000,
});

/** Tarja v1, exatamente como o painel de 01/10 grava — sem nenhum campo novo. */
const TARJA_V1 = {
  name: 'Ana Souza',
  photoUrl: 'https://x/ana.jpg',
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000_000,
};

const TARJA_V2 = {
  ...TARJA_V1,
  name: 'Ana Souza / Bia Lima',
  kind: 'dupla',
  key: 'dupla:t1',
  names: ['Ana Souza', 'Bia Lima'],
  photos: ['https://x/ana.jpg', null],
  members: [],
  badge: 'DUPLA',
  context: 'Feminina B · Semifinal',
  subtitle: null,
  rankingPos: 2,
  chips: [
    { label: 'Ranking', value: '2º' },
    { label: 'Pontos', value: '1.240' },
  ],
  campaign: {
    title: 'Campanha no torneio',
    summary: '2V · 1D',
    rows: [
      { mark: 'V', won: true, opponent: 'Carla / Duda', phase: 'Grupo A', score: '21–15' },
      { mark: 'D', won: false, opponent: 'Eva / Fê', phase: 'Grupo A', score: '1–2' },
    ],
  },
  showCampaign: false,
  question: 'Como foi a virada no segundo set?',
  reporter: { role: 'Repórter', name: 'Carla Mendes' },
};

describe('broadcastControlFromRaw', () => {
  it('doc ausente vira o default — o comportamento de antes do painel', () => {
    expect(broadcastControlFromRaw(null)).toEqual(DEFAULT_BROADCAST_CONTROL);
    expect(broadcastControlFromRaw(undefined)).toEqual(DEFAULT_BROADCAST_CONTROL);
  });

  it('chave ausente conta como ligada; só false explícito desliga', () => {
    const c = broadcastControlFromRaw({ graphics: { scoreboard: false, kocBar: 0, donation: true } });
    expect(c.graphics.scoreboard).toBeFalse();
    expect(c.graphics.kocBar).toBeTrue();
    expect(c.graphics.donation).toBeTrue();
    expect(c.graphics.champions).toBeTrue();
  });

  it('valor desconhecido cai no default do campo, sem derrubar o doc', () => {
    const c = broadcastControlFromRaw({ kocRoundEndScreen: 'tudo', finalMode: 'talvez', courtId: '  ' });
    expect(c.kocRoundEndScreen).toBe('rodizio');
    expect(c.finalMode).toBe('auto');
    expect(c.courtId).toBeNull();
  });

  it('lê quadra, tela do fim de rodada e modo final válidos', () => {
    const c = broadcastControlFromRaw({ courtId: 'q2', kocRoundEndScreen: 'classificadas', finalMode: 'off' });
    expect(c.courtId).toBe('q2');
    expect(c.kocRoundEndScreen).toBe('classificadas');
    expect(c.finalMode).toBe('off');
  });

  it('tarja sem nome ou sem carimbo é tarja fora do ar', () => {
    expect(broadcastControlFromRaw({ interview: { ...TARJA, name: ' ' } }).interview).toBeNull();
    expect(broadcastControlFromRaw({ interview: { ...TARJA, shownAt: 0 } }).interview).toBeNull();
  });

  it('duração inválida vira "até tirar"; duração fracionada arredonda', () => {
    expect(broadcastControlFromRaw({ interview: { ...TARJA, durationSec: 0 } }).interview?.durationSec).toBeNull();
    expect(broadcastControlFromRaw({ interview: { ...TARJA, durationSec: '20' } }).interview?.durationSec).toBeNull();
    expect(broadcastControlFromRaw({ interview: { ...TARJA, durationSec: 20.4 } }).interview?.durationSec).toBe(20);
  });

  it('tarja v1 (só nome, foto, parceiro e categoria) vira a variante atleta', () => {
    const t = broadcastControlFromRaw({ interview: TARJA_V1 }).interview!;
    expect(t.kind).toBe('atleta');
    expect(t.names).toEqual(['Ana Souza']);
    expect(t.photos).toEqual(['https://x/ana.jpg']);
    expect(t.badge).toBe('ATLETA');
    expect(t.context).toBe('Feminina B');
    expect(t.subtitle).toBe('Dupla com Bia Lima');
    expect(t.chips).toEqual([]);
    expect(t.campaign).toBeNull();
    expect(t.showCampaign).toBeTrue();
    expect(t.question).toBeNull();
    expect(t.reporter).toBeNull();
  });

  it('tarja v1 de pessoas diferentes tem identidades diferentes', () => {
    const a = broadcastControlFromRaw({ interview: TARJA_V1 }).interview!;
    const b = broadcastControlFromRaw({ interview: { ...TARJA_V1, name: 'Bia Lima' } }).interview!;
    expect(a.key).not.toBe(b.key);
  });

  it('lê a tarja v2 inteira', () => {
    const t = broadcastControlFromRaw({ interview: TARJA_V2 }).interview!;
    expect(t.kind).toBe('dupla');
    expect(t.key).toBe('dupla:t1');
    expect(t.names).toEqual(['Ana Souza', 'Bia Lima']);
    expect(t.photos).toEqual(['https://x/ana.jpg', null]);
    expect(t.context).toBe('Feminina B · Semifinal');
    expect(t.subtitle).toBeNull();
    expect(t.rankingPos).toBe(2);
    expect(t.chips).toEqual(TARJA_V2.chips);
    expect(t.campaign).toEqual(TARJA_V2.campaign);
    expect(t.showCampaign).toBeFalse();
    expect(t.question).toBe('Como foi a virada no segundo set?');
    expect(t.reporter).toEqual({ role: 'Repórter', name: 'Carla Mendes' });
  });

  it('pauta longa demais é cortada; repórter sem nome fica fora', () => {
    const t = broadcastControlFromRaw({
      interview: { ...TARJA_V2, question: 'x'.repeat(500), reporter: { role: 'Repórter', name: ' ' } },
    }).interview!;
    expect(t.question!.length).toBe(200);
    expect(t.reporter).toBeNull();
  });

  it('na v2, contexto null fica null — não volta pra categoria da v1', () => {
    const t = broadcastControlFromRaw({ interview: { ...TARJA_V2, context: null } }).interview!;
    expect(t.context).toBeNull();
  });

  it('v2 com lixo cai no neutro de cada campo, sem derrubar a tarja', () => {
    const t = broadcastControlFromRaw({
      interview: {
        ...TARJA_V2,
        kind: 'trio',
        names: 'Ana',
        photos: [1, 'https://x/b.jpg'],
        rankingPos: -3,
        chips: [{ label: 'Ranking' }, ['Pontos', '10'], { label: 'Nível', value: 'Open' }],
        campaign: { title: 'x', summary: 'y', rows: [{ mark: 'V' }] },
        members: [{ name: '' }, { name: 'Caio', photoUrl: 7 }],
      },
    }).interview!;
    expect(t.kind).toBe('atleta');
    expect(t.names).toEqual(['Ana Souza / Bia Lima']);
    expect(t.photos).toEqual([null, 'https://x/b.jpg']);
    expect(t.rankingPos).toBeNull();
    expect(t.chips).toEqual([{ label: 'Nível', value: 'Open' }]);
    expect(t.campaign).toBeNull();
    expect(t.members).toEqual([{ name: 'Caio', photoUrl: null }]);
  });

  it('elenco, chips e linhas da campanha têm teto (o que cabe no ar)', () => {
    const muitos = Array.from({ length: 9 }, (_, i) => ({ name: `A${i}`, photoUrl: null }));
    const chips = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: `${i}` }));
    const rows = Array.from({ length: 9 }, (_, i) => ({ mark: 'V', won: true, opponent: `O${i}`, phase: 'G', score: '1–0' }));
    const t = broadcastControlFromRaw({
      interview: { ...TARJA_V2, kind: 'equipe', members: muitos, chips, campaign: { title: 't', summary: 's', rows } },
    }).interview!;
    expect(t.members.length).toBe(6);
    expect(t.chips.length).toBe(4);
    expect(t.campaign!.rows.length).toBe(6);
    // As MAIS RECENTES: a campanha vem em ordem cronológica.
    expect(t.campaign!.rows[5]!.opponent).toBe('O8');
  });

  it('carimbo inválido de comando vira 0', () => {
    const c = broadcastControlFromRaw({ commands: { donationNowAt: -5, sponsorsNowAt: Number.NaN } });
    expect(c.commands).toEqual({ donationNowAt: 0, sponsorsNowAt: 0 });
  });
});

describe('interviewOnAirAt', () => {
  it('sem tarja não há nada no ar', () => {
    expect(interviewOnAirAt(null, 0)).toBeFalse();
  });

  it('"até tirar" fica no ar indefinidamente', () => {
    expect(interviewOnAirAt({ ...TARJA, durationSec: null }, TARJA.shownAt + 3_600_000)).toBeTrue();
  });

  it('temporizada sai do ar exatamente na duração', () => {
    expect(interviewOnAirAt(TARJA, TARJA.shownAt + 19_999)).toBeTrue();
    expect(interviewOnAirAt(TARJA, TARJA.shownAt + 20_000)).toBeFalse();
  });
});

describe('interviewLineOf', () => {
  it('junta categoria e parceiro numa frase só', () => {
    expect(interviewLineOf(TARJA)).toBe('Feminina B · com Bia Lima');
  });

  it('omite a parte que falta e devolve null quando não sobra nada', () => {
    expect(interviewLineOf({ categoryName: 'Feminina B', partnerName: null })).toBe('Feminina B');
    expect(interviewLineOf({ categoryName: null, partnerName: 'Bia' })).toBe('com Bia');
    expect(interviewLineOf({ categoryName: null, partnerName: null })).toBeNull();
  });
});

describe('finalPrefOf', () => {
  it('auto segue a partida; on/off forçam', () => {
    expect(finalPrefOf('auto')).toBeNull();
    expect(finalPrefOf('on')).toBeTrue();
    expect(finalPrefOf('off')).toBeFalse();
  });
});
