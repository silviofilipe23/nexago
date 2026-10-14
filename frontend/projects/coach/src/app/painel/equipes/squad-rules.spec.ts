import { checkSquadDeletable } from './squad-rules';

describe('checkSquadDeletable', () => {
  it('permite excluir equipe vazia', () => {
    expect(checkSquadDeletable('s1', ['s2', null], ['s2']).ok).toBe(true);
  });

  it('bloqueia quando há atleta na equipe', () => {
    const r = checkSquadDeletable('s1', ['s1'], []);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('atletas');
  });

  it('bloqueia quando há treino da equipe', () => {
    expect(checkSquadDeletable('s1', [], ['s1']).ok).toBe(false);
  });
});
