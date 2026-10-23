import type { Plan, TrainingClass } from '../../domain/models';

export interface ProgramRemoval {
  /** Turmas (qualquer situação) da modalidade — guardam o `programId`, então bloqueiam. */
  classes: number;
  /** Planos ativos restritos só a ela: tirar o id deixaria `programIds` vazio = "todas". */
  exclusivePlans: string[];
  /** Planos ativos que também atendem outras modalidades: só perdem o id (limpeza; o id órfão não quebra nada). */
  sharedPlanIds: string[];
  /** Motivo do bloqueio, ou null se pode remover. */
  blocked: string | null;
}

/**
 * O que remover a modalidade afeta. Planos arquivados e a atribuição de membros ficam com o id
 * órfão (as telas já mostram "Modalidade removida" / ignoram) — as rules não deixam o gestor
 * editar o próprio vínculo nem o do owner, e isso derrubaria o batch.
 */
export function programRemoval(programId: string, classes: TrainingClass[], plans: Plan[]): ProgramRemoval {
  const nClasses = classes.filter((c) => c.programId === programId).length;
  const active = plans.filter((p) => p.status !== 'archived' && p.programIds.includes(programId));
  const exclusivePlans = active.filter((p) => p.programIds.length === 1).map((p) => p.name);
  let blocked: string | null = null;
  if (nClasses > 0) {
    blocked = `Usada por ${nClasses} ${nClasses === 1 ? 'turma' : 'turmas'} (inclui encerradas e rascunhos) — a turma guarda a modalidade.`;
  } else if (exclusivePlans.length > 0) {
    blocked = `Plano só desta modalidade: ${exclusivePlans.join(', ')}. Arquive o plano ou inclua outra modalidade nele antes.`;
  }
  return {
    classes: nClasses,
    exclusivePlans,
    sharedPlanIds: active.filter((p) => p.programIds.length > 1).map((p) => p.id),
    blocked,
  };
}
