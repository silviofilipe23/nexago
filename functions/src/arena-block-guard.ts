/**
 * Bloqueio de atleta por arena (`arena_blocks/{arenaId}_{athleteId}`).
 *
 * O ID do doc sozinho não prova de qual arena é o bloqueio: antes das rules
 * amarrarem o ID aos campos, uma arena conseguia gravar `{outraArena}_{atleta}`.
 * Por isso o servidor só aceita o bloqueio quando o `arenaId` gravado é o da
 * reserva.
 */
export function arenaBlockApplies(
  blockData: Record<string, unknown> | undefined,
  arenaId: string,
): boolean {
  return blockData?.["arenaId"] === arenaId;
}
