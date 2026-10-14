import { buildContexts, resolveActiveCoach, type CoachMembership } from './coach-context.logic';

const member = (coachUid: string, role: unknown, coachName = ''): CoachMembership => ({ coachUid, role, coachName });

describe('buildContexts', () => {
  it('treinador sem vínculos: só o próprio painel', () => {
    expect(buildContexts('me', true, [])).toEqual([{ coachUid: 'me', role: 'principal', coachName: 'Meu painel', isOwn: true }]);
  });

  it('membro SEM painel próprio: só os vínculos, nenhum contexto "próprio" vazio', () => {
    const ctx = buildContexts('me', false, [member('A', 'fisioterapeuta', 'Carla')]);
    expect(ctx.map((c) => c.coachUid)).toEqual(['A']);
    expect(ctx[0].isOwn).toBeFalse();
  });

  it('dono E membro: o próprio vem primeiro, depois os vínculos', () => {
    const ctx = buildContexts('me', true, [member('A', 'auxiliar', 'Carla')]);
    expect(ctx.map((c) => c.coachUid)).toEqual(['me', 'A']);
    expect(ctx[1].role).toBe('auxiliar');
  });

  it('espelho com cargo inválido ou vazio não vira contexto (não libera nada)', () => {
    expect(buildContexts('me', false, [member('A', ''), member('B', 'dono'), member('C', undefined)])).toEqual([]);
  });

  it('vínculo apontando para o próprio uid é ignorado', () => {
    expect(buildContexts('me', true, [member('me', 'auxiliar')]).length).toBe(1);
  });

  it('sem nome do treinador: rótulo padrão', () => {
    expect(buildContexts(null, false, [member('A', 'psicologo', '')])[0].coachName).toBe('Treinador');
  });
});

describe('resolveActiveCoach', () => {
  const ctx = buildContexts('me', true, [member('A', 'auxiliar', 'Carla')]);

  it('sem contextos: null', () => expect(resolveActiveCoach([], 'A')).toBeNull());
  it('respeita o treinador preferido quando existe', () => expect(resolveActiveCoach(ctx, 'A')?.coachUid).toBe('A'));
  it('preferido que não existe mais (acesso revogado): cai no primeiro contexto', () =>
    expect(resolveActiveCoach(ctx, 'ZZZ')?.coachUid).toBe('me'));
  it('sem preferência: primeiro contexto (o próprio painel, se existir)', () =>
    expect(resolveActiveCoach(ctx, null)?.coachUid).toBe('me'));
  it('sem painel próprio e sem preferência: o primeiro vínculo', () =>
    expect(resolveActiveCoach(buildContexts('me', false, [member('A', 'psicologo', 'C')]), null)?.coachUid).toBe('A'));
});
