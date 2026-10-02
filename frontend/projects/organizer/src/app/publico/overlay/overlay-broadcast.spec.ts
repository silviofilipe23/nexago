import { DEFAULT_BROADCAST_CONTROL, type BroadcastControl, type BroadcastInterview, interviewWithDefaults } from '../../painel/data/broadcast-control';
import {
  interviewVisibleAt,
  nextCommandStep,
  nextInterviewAir,
  overlayFinalModeOf,
  overlayLayersOf,
  panelRoundEndScreen,
  type OverlayAutoLayers,
} from './overlay-broadcast';

const TUDO: OverlayAutoLayers = { duel: true, kocBar: true, kocPreRound: true, roundEnd: true, champions: true };

function controle(over: Partial<BroadcastControl> = {}): BroadcastControl {
  return {
    ...DEFAULT_BROADCAST_CONTROL,
    graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics },
    commands: { ...DEFAULT_BROADCAST_CONTROL.commands },
    ...over,
  };
}

const TARJA: BroadcastInterview = interviewWithDefaults({
  name: 'Ana Souza',
  photoUrl: null,
  partnerName: 'Bia Lima',
  categoryName: 'Feminina B',
  durationSec: 20,
  shownAt: 1_000,
});

describe('overlayLayersOf', () => {
  it('sem painel mexido, vai ao ar o que a regra automática manda', () => {
    const semPodio = { ...TUDO, champions: false };
    expect(overlayLayersOf(controle(), semPodio, false)).toEqual({ ...semPodio, interview: false });
    const nada = { duel: false, kocBar: false, kocPreRound: false, roundEnd: false, champions: false };
    expect(overlayLayersOf(controle(), nada, false)).toEqual({ ...nada, interview: false });
  });

  it('chave desligada tira o gráfico mesmo quando a regra automática mandaria', () => {
    const c = controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false, kocRoundEnd: false } });
    const l = overlayLayersOf(c, { ...TUDO, champions: false }, false);
    expect(l.duel).toBeFalse();
    expect(l.roundEnd).toBeFalse();
    expect(l.kocBar).toBeTrue();
  });

  it('pódio no ar toma o lugar do placar e das telas do KOTC — a categoria escolhida pode não ser a da quadra', () => {
    expect(overlayLayersOf(controle(), TUDO, false)).toEqual({
      duel: false,
      kocBar: false,
      kocPreRound: false,
      roundEnd: false,
      champions: true,
      interview: false,
    });
  });

  it('chave dos campeões desligada: o placar segue no ar', () => {
    const c = controle({ graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, champions: false } });
    const l = overlayLayersOf(c, TUDO, false);
    expect(l.champions).toBeFalse();
    expect(l.duel).toBeTrue();
  });

  it('chave ligada não inventa gráfico que a regra automática não pôs', () => {
    expect(overlayLayersOf(controle(), { ...TUDO, champions: false }, false).champions).toBeFalse();
  });

  it('tarja no ar toma a tela inteira', () => {
    expect(overlayLayersOf(controle(), TUDO, true)).toEqual({
      duel: false,
      kocBar: false,
      kocPreRound: false,
      roundEnd: false,
      champions: false,
      interview: true,
    });
  });
});

describe('nextCommandStep', () => {
  it('o 1º snapshot é linha de base: nada dispara, mesmo com carimbo antigo', () => {
    const step = nextCommandStep(null, controle({ commands: { donationNowAt: 500, sponsorsNowAt: 700 } }));
    expect(step.donationNow).toBeFalse();
    expect(step.sponsorsNow).toBeFalse();
    expect(step.memory).toEqual({ donationNowAt: 500, sponsorsNowAt: 700 });
  });

  it('carimbo novo depois da linha de base dispara só o comando que mudou', () => {
    const base = { donationNowAt: 500, sponsorsNowAt: 700 };
    const step = nextCommandStep(base, controle({ commands: { donationNowAt: 900, sponsorsNowAt: 700 } }));
    expect(step.donationNow).toBeTrue();
    expect(step.sponsorsNow).toBeFalse();
  });

  it('snapshot de outra chave, com carimbos iguais, não dispara nada', () => {
    const base = { donationNowAt: 500, sponsorsNowAt: 700 };
    const c = controle({ commands: { ...base }, graphics: { ...DEFAULT_BROADCAST_CONTROL.graphics, scoreboard: false } });
    const step = nextCommandStep(base, c);
    expect(step.donationNow).toBeFalse();
    expect(step.sponsorsNow).toBeFalse();
  });
});

describe('nextInterviewAir', () => {
  it('tarja nova entra no ar contando do recebimento', () => {
    expect(nextInterviewAir(null, TARJA, false, 50_000)).toEqual({ data: TARJA, receivedAtMs: 50_000 });
  });

  it('mesmo comando em snapshot seguinte mantém o instante de recebimento', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    expect(nextInterviewAir(air, { ...TARJA }, false, 60_000)).toBe(air);
  });

  it('mesmo carimbo com o card mudado (chave ligada no ar) troca os dados sem reiniciar a duração', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    const next = nextInterviewAir(air, { ...TARJA, showCampaign: false }, false, 60_000);
    expect(next?.data.showCampaign).toBeFalse();
    expect(next?.receivedAtMs).toBe(50_000);
  });

  it('comando novo (outro shownAt) reinicia a contagem', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    expect(nextInterviewAir(air, { ...TARJA, shownAt: 2_000 }, false, 60_000)?.receivedAtMs).toBe(60_000);
  });

  it('"Tirar do ar" (null) derruba a tarja', () => {
    expect(nextInterviewAir({ data: TARJA, receivedAtMs: 50_000 }, null, false, 60_000)).toBeNull();
  });

  it('recarregar o OBS no meio de tarja temporizada não a reexibe', () => {
    const air = nextInterviewAir(null, TARJA, true, 50_000);
    expect(interviewVisibleAt(air, 50_000)).toBeFalse();
  });

  it('snapshot de outra chave depois do reload não ressuscita a tarja temporizada', () => {
    const base = nextInterviewAir(null, TARJA, true, 50_000);
    const depois = nextInterviewAir(base, { ...TARJA }, false, 51_000);
    expect(interviewVisibleAt(depois, 51_000)).toBeFalse();
  });

  it('tarja "até tirar" na linha de base continua no ar', () => {
    const air = nextInterviewAir(null, { ...TARJA, durationSec: null }, true, 50_000);
    expect(interviewVisibleAt(air, 9_999_999)).toBeTrue();
  });
});

describe('interviewVisibleAt', () => {
  it('sem tarja, nada no ar', () => {
    expect(interviewVisibleAt(null, 0)).toBeFalse();
  });

  it('temporizada sai na duração contada do recebimento', () => {
    const air = { data: TARJA, receivedAtMs: 50_000 };
    expect(interviewVisibleAt(air, 69_999)).toBeTrue();
    expect(interviewVisibleAt(air, 70_000)).toBeFalse();
  });
});

describe('panelRoundEndScreen', () => {
  it('rodízio devolve o controle ao overlay; resultado/classificadas fixam', () => {
    expect(panelRoundEndScreen('rodizio')).toBeNull();
    expect(panelRoundEndScreen('resultado')).toBe('resultado');
    expect(panelRoundEndScreen('classificadas')).toBe('classificadas');
  });
});

describe('overlayFinalModeOf', () => {
  it('preferência do painel manda; sem preferência, segue a partida', () => {
    expect(overlayFinalModeOf(false, true)).toBeTrue();
    expect(overlayFinalModeOf(true, false)).toBeFalse();
    expect(overlayFinalModeOf(true, null)).toBeTrue();
    expect(overlayFinalModeOf(false, null)).toBeFalse();
  });
});
