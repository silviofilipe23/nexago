import type { Plan, TrainingClass } from '../../domain/models';
import { programRemoval } from './program-removal';

const cls = (programId: string, status = 'ended') => ({ id: `c-${programId}-${status}`, programId, status }) as unknown as TrainingClass;
const plan = (id: string, programIds: string[], status: Plan['status'] = 'active') => ({ id, name: `Plano ${id}`, programIds, status }) as unknown as Plan;

describe('programRemoval', () => {
  it('bloqueia quando qualquer turma (mesmo encerrada) usa a modalidade', () => {
    const r = programRemoval('bt', [cls('bt', 'ended'), cls('fv', 'active')], []);
    expect(r.classes).toBe(1);
    expect(r.blocked).toContain('1 turma');
  });

  it('bloqueia quando um plano ativo é só dela; arquivado não conta', () => {
    const r = programRemoval('bt', [], [plan('a', ['bt']), plan('b', ['bt'], 'archived')]);
    expect(r.exclusivePlans).toEqual(['Plano a']);
    expect(r.blocked).toContain('Plano a');
  });

  it('livre: lista os planos compartilhados que perdem o id', () => {
    const r = programRemoval('bt', [cls('fv')], [plan('a', ['bt', 'fv']), plan('b', ['fv']), plan('c', [])]);
    expect(r.blocked).toBeNull();
    expect(r.sharedPlanIds).toEqual(['a']);
  });
});
