export interface SquadDeleteCheck {
  ok: boolean;
  reason: string | null;
}

/** Equipe só sai se ninguém (atleta ou treino) ainda aponta pra ela — evita `squadId` pendurado. */
export function checkSquadDeletable(
  squadId: string,
  athleteSquadIds: (string | null)[],
  trainingSquadIds: string[],
): SquadDeleteCheck {
  const hasAthletes = athleteSquadIds.some((id) => id === squadId);
  const hasTrainings = trainingSquadIds.some((id) => id === squadId);
  if (hasAthletes || hasTrainings) {
    return { ok: false, reason: 'Mova os atletas e remova os treinos antes de excluir a equipe.' };
  }
  return { ok: true, reason: null };
}
