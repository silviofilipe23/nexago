import {
  DEFAULT_BROADCAST_CONTROL,
  broadcastControlFromRaw,
  finalPrefOf,
  interviewLineOf,
  interviewOnAirAt,
  type BroadcastInterview,
} from './broadcast-control';

const TARJA: BroadcastInterview = {
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000_000,
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
