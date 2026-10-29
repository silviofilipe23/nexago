import { Timestamp } from 'firebase/firestore';
import {
  canContinueFromStep,
  categoryStartError,
  categoryStartWindow,
  emptyCategoryDraft,
  emptyTournamentDraft,
  type TournamentCreateDraft,
} from './tournament-create.model';
import { categoryFromMap, categoryToMap } from './tournament-create-mapper';

/**
 * Início da categoria (`startsAt`): opcional, mas quando existe cai dentro do período do
 * torneio — do começo do dia de `startAt` ao fim do dia de `endAt` (os dois são só data).
 */

function draftWith(startsAt: Date | null): TournamentCreateDraft {
  return {
    ...emptyTournamentDraft(),
    startAt: new Date(2026, 10, 14),
    endAt: new Date(2026, 10, 15),
    categories: [{ ...emptyCategoryDraft('c1'), startsAt }],
  };
}

describe('início da categoria', () => {
  it('janela vai da meia-noite do 1º dia ao fim do último', () => {
    const win = categoryStartWindow(draftWith(null))!;
    expect(win.min).toEqual(new Date(2026, 10, 14, 0, 0, 0, 0));
    expect(win.max).toEqual(new Date(2026, 10, 15, 23, 59, 59, 999));
  });

  it('sem período completo não há janela nem erro', () => {
    const draft = { ...draftWith(new Date(2030, 0, 1)), endAt: null };
    expect(categoryStartWindow(draft)).toBeNull();
    expect(categoryStartError(draft.categories[0]!, draft)).toBeNull();
  });

  it('sem horário é válido (campo opcional)', () => {
    const draft = draftWith(null);
    expect(categoryStartError(draft.categories[0]!, draft)).toBeNull();
    expect(canContinueFromStep(draft, 'categories')).toBeTrue();
  });

  it('aceita qualquer hora dentro do período, inclusive no último dia', () => {
    for (const d of [new Date(2026, 10, 14, 0, 0), new Date(2026, 10, 14, 8, 30), new Date(2026, 10, 15, 23, 59)]) {
      const draft = draftWith(d);
      expect(categoryStartError(draft.categories[0]!, draft)).withContext(d.toString()).toBeNull();
    }
  });

  it('recusa antes do início e depois do fim, e trava o passo de categorias', () => {
    for (const d of [new Date(2026, 10, 13, 23, 59), new Date(2026, 10, 16, 0, 0)]) {
      const draft = draftWith(d);
      expect(categoryStartError(draft.categories[0]!, draft)).toContain('14/11 e 15/11');
      expect(canContinueFromStep(draft, 'categories')).toBeFalse();
    }
  });

  it('grava `startsAt` como Timestamp e lê de volta (roundtrip do array inteiro)', () => {
    const startsAt = new Date(2026, 10, 14, 9, 0);
    const draft = draftWith(startsAt);
    const map = categoryToMap(draft.categories[0]!, draft);
    expect(map['startsAt']).toEqual(Timestamp.fromDate(startsAt));
    expect(categoryFromMap(map)!.startsAt).toEqual(startsAt);
  });

  it('categoria sem horário grava `null` e categoria legada (sem o campo) lê `null`', () => {
    const draft = draftWith(null);
    expect(categoryToMap(draft.categories[0]!, draft)['startsAt']).toBeNull();
    expect(categoryFromMap({ id: 'legacy', categoryName: 'Open' })!.startsAt).toBeNull();
  });
});
