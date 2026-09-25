import { overlayFinalModeOf, readOverlayFinalPref, writeOverlayFinalPref } from './overlay-final-sync';

describe('overlay-final-sync', () => {
  const TID = 'torneio-teste';

  beforeEach(() => {
    localStorage.removeItem(`nexago.overlay.final.${TID}`);
  });

  it('sem preferência, o modo segue se a partida é final', () => {
    expect(overlayFinalModeOf(true, null)).toBeTrue();
    expect(overlayFinalModeOf(false, null)).toBeFalse();
  });

  it('preferência explícita manda sobre o matchType', () => {
    expect(overlayFinalModeOf(false, true)).toBeTrue();
    expect(overlayFinalModeOf(true, false)).toBeFalse();
  });

  it('grava e lê a preferência no storage', () => {
    expect(readOverlayFinalPref(TID)).toBeNull();
    writeOverlayFinalPref(TID, true);
    expect(readOverlayFinalPref(TID)).toBeTrue();
    writeOverlayFinalPref(TID, false);
    expect(readOverlayFinalPref(TID)).toBeFalse();
  });
});
