import { emptyCategoryDraft } from './tournament-create.model';
import { tournamentDraftFromFirestore } from './tournament-create-mapper';

describe('formato de partida no wizard', () => {
  it('categoria nova nasce em set único', () => {
    expect(emptyCategoryDraft('cat-1').bestOf).toBe('singleSet');
  });

  it('torneio já gravado mantém o formato que escolheu', () => {
    const { draft } = tournamentDraftFromFirestore(
      { categories: [{ id: 'cat-1', categoryName: 'Masculino Open', bestOf: 'bestOf3' }] },
      'torneio-1',
    );
    expect(draft.categories[0].bestOf).toBe('bestOf3');
  });

  it('torneio antigo, sem o campo, continua lido como MD3', () => {
    const { draft } = tournamentDraftFromFirestore(
      { categories: [{ id: 'cat-1', categoryName: 'Masculino Open' }] },
      'torneio-1',
    );
    expect(draft.categories[0].bestOf).toBe('bestOf3');
  });
});
