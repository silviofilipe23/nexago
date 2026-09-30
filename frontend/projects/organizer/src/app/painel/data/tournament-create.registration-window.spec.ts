import { canContinueFromStep, emptyTournamentDraft, registrationWindowError, TournamentCreateDraft } from './tournament-create.model';

// "Início" do torneio é só data (meia-noite); o fechamento é data + hora.
function draft(patch: Partial<TournamentCreateDraft>): TournamentCreateDraft {
  return {
    ...emptyTournamentDraft(),
    startAt: new Date(2026, 9, 10),
    endAt: new Date(2026, 9, 10),
    registrationOpensAt: new Date(2026, 9, 1, 8, 0),
    ...patch,
  };
}

describe('janela de inscrição x início do torneio', () => {
  it('fecha às 14h no próprio dia de um torneio sem horário do 1º jogo', () => {
    const d = draft({ registrationClosesAt: new Date(2026, 9, 10, 14, 0) });
    expect(registrationWindowError(d)).toBeNull();
    expect(canContinueFromStep(d, 'registration')).toBeTrue();
  });

  it('fecha às 14h no próprio dia quando o 1º jogo é às 18h', () => {
    const d = draft({ firstMatchAt: new Date(2026, 9, 10, 18, 0), registrationClosesAt: new Date(2026, 9, 10, 14, 0) });
    expect(registrationWindowError(d)).toBeNull();
  });

  it('fecha exatamente no horário do 1º jogo', () => {
    const d = draft({ firstMatchAt: new Date(2026, 9, 10, 18, 0), registrationClosesAt: new Date(2026, 9, 10, 18, 0) });
    expect(registrationWindowError(d)).toBeNull();
  });

  it('recusa fechar depois do 1º jogo', () => {
    const d = draft({ firstMatchAt: new Date(2026, 9, 10, 18, 0), registrationClosesAt: new Date(2026, 9, 10, 19, 0) });
    expect(registrationWindowError(d)).toContain('1º jogo');
    expect(canContinueFromStep(d, 'registration')).toBeFalse();
  });

  it('recusa fechar no dia seguinte ao início', () => {
    const d = draft({ endAt: new Date(2026, 9, 11), registrationClosesAt: new Date(2026, 9, 11, 9, 0) });
    expect(registrationWindowError(d)).toContain('depois do início');
  });

  it('1º jogo de outro dia (desatualizado) não vira o limite — vale o dia do início', () => {
    const d = draft({ firstMatchAt: new Date(2026, 9, 3, 18, 0), registrationClosesAt: new Date(2026, 9, 10, 14, 0) });
    expect(registrationWindowError(d)).toBeNull();
  });
});
