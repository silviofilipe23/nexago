import { emptyTournamentDraft, registrationHoldLabel } from './tournament-create.model';
import { tournamentDraftFromFirestore } from './tournament-create-mapper';

function hydrate(data: Record<string, unknown>) {
  return tournamentDraftFromFirestore(data, 'torneio-1').draft;
}

describe('prazo de garantia da vaga no wizard', () => {
  it('torneio novo nasce com o prazo ligado em 30 minutos', () => {
    const draft = emptyTournamentDraft();
    expect(draft.registrationHoldEnabled).toBeTrue();
    expect(draft.registrationHoldMinutes).toBe(30);
  });

  it('torneio ANTERIOR à regra (sem os campos) abre no padrão ligado, como a Cloud Function lê', () => {
    const draft = hydrate({});
    expect(draft.registrationHoldEnabled).toBeTrue();
    expect(draft.registrationHoldMinutes).toBe(30);
  });

  it('respeita o que o organizador salvou', () => {
    const draft = hydrate({ registrationHoldEnabled: true, registrationHoldMinutes: 120 });
    expect(draft.registrationHoldMinutes).toBe(120);
  });

  it('prazo desligado sobrevive à reabertura do wizard', () => {
    const draft = hydrate({ registrationHoldEnabled: false });
    expect(draft.registrationHoldEnabled).toBeFalse();
  });

  it('rotula os prazos oferecidos, e cai no genérico fora da lista', () => {
    expect(registrationHoldLabel(30)).toBe('30 minutos');
    expect(registrationHoldLabel(60)).toBe('1 hora');
    expect(registrationHoldLabel(1440)).toBe('24 horas');
    expect(registrationHoldLabel(45)).toBe('45 minutos');
  });
});
