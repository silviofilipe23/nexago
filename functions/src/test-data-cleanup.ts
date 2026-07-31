/**
 * Lógica pura da limpeza de dados de teste (`scripts/delete-test-data.js`).
 *
 * Fica aqui, e não no script, porque um erro nessas decisões apaga dado real:
 * a separação entre "é seed, pode apagar" e "é de verdade, preserve" precisa
 * de teste. O script cuida só de I/O.
 */

/** Divide uma lista em blocos de no máximo `size` itens. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Campos de `inscriptions` usados pelas decisões de limpeza. */
export interface CleanupInscription {
  id: string;
  tournamentId: string;
  teamId?: string;
  participantUids?: unknown;
  player1Id?: unknown;
}

function cleanUid(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Uids de participantes de uma inscrição. Docs antigos têm só `player1Id`;
 * os atuais têm `participantUids` — considerar os dois evita deixar atleta
 * de fora das checagens de contaminação.
 */
export function inscriptionParticipantUids(
  inscription: CleanupInscription,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const raw = Array.isArray(inscription.participantUids) ?
    inscription.participantUids :
    [];
  for (const item of raw) {
    const uid = cleanUid(item);
    if (uid && !seen.has(uid)) {
      seen.add(uid);
      out.push(uid);
    }
  }

  const legacy = cleanUid(inscription.player1Id);
  if (legacy && !seen.has(legacy)) {
    seen.add(legacy);
    out.push(legacy);
  }

  return out;
}

/** O que a limpeza deve apagar e o que precisa preservar. */
export interface CleanupPlan {
  /** Inscrições dos torneios seed — apagar. */
  seedInscriptionIds: string[];
  /** Duplas referenciadas por essas inscrições — apagar. */
  teamIds: string[];
  /** Atletas NÃO-seed inscritos em torneio seed — motivo de abortar. */
  realAthleteUids: string[];
  /** Atletas seed inscritos em torneio real — preservar (doc, espelho e Auth). */
  preservedAthleteUids: string[];
  /** Atletas seed seguros para apagar. */
  deletableAthleteUids: string[];
}

/**
 * Cruza inscrições, atletas seed e torneios seed para decidir a limpeza.
 *
 * `inscriptions` deve conter TODAS as inscrições do projeto, não só as dos
 * torneios seed: é justamente a presença de um atleta seed numa inscrição de
 * torneio real que o torna impossível de apagar.
 */
export function partitionCleanupTargets(input: {
  inscriptions: CleanupInscription[];
  seedAthleteUids: string[];
  seedTournamentIds: string[];
}): CleanupPlan {
  const seedAthletes = new Set(input.seedAthleteUids.map(cleanUid).filter(Boolean));
  const seedTournaments = new Set(
    input.seedTournamentIds.map(cleanUid).filter(Boolean),
  );

  const seedInscriptionIds: string[] = [];
  const teamIds: string[] = [];
  const seenTeamIds = new Set<string>();
  const realAthleteUids: string[] = [];
  const seenRealUids = new Set<string>();
  const preservedAthleteUids: string[] = [];
  const seenPreservedUids = new Set<string>();

  for (const inscription of input.inscriptions) {
    const tournamentId = cleanUid(inscription.tournamentId);
    const isSeedTournament = seedTournaments.has(tournamentId);
    const participants = inscriptionParticipantUids(inscription);

    if (isSeedTournament) {
      seedInscriptionIds.push(inscription.id);

      const teamId = cleanUid(inscription.teamId);
      if (teamId && !seenTeamIds.has(teamId)) {
        seenTeamIds.add(teamId);
        teamIds.push(teamId);
      }

      for (const uid of participants) {
        if (!seedAthletes.has(uid) && !seenRealUids.has(uid)) {
          seenRealUids.add(uid);
          realAthleteUids.push(uid);
        }
      }
      continue;
    }

    // Torneio real: qualquer atleta seed aqui precisa sobreviver à limpeza.
    for (const uid of participants) {
      if (seedAthletes.has(uid) && !seenPreservedUids.has(uid)) {
        seenPreservedUids.add(uid);
        preservedAthleteUids.push(uid);
      }
    }
  }

  const deletableAthleteUids = [...seedAthletes].filter(
    (uid) => !seenPreservedUids.has(uid),
  );

  return {
    seedInscriptionIds,
    teamIds,
    realAthleteUids,
    preservedAthleteUids,
    deletableAthleteUids,
  };
}

/** Campos de `tournaments` usados pela checagem de organizador. */
export interface CleanupTournament {
  id: string;
  managerId?: unknown;
  seedTestTournament?: unknown;
}

/** O que a checagem de organizador decide preservar/apagar. */
export interface OrganizerCleanupPlan {
  /** Organizadores seed que são `managerId` de torneio NÃO-seed — preservar. */
  preservedOrganizerUids: string[];
  /** Organizadores seed seguros para apagar. */
  deletableOrganizerUids: string[];
}

/**
 * Cruza organizadores seed contra o `managerId` de TODOS os torneios do
 * projeto (não só os seed) — espelha `partitionCleanupTargets`.
 *
 * Um organizador seed que gerencia um torneio real não pode ser apagado:
 * o torneio ficaria com `managerId` apontando para uma conta inexistente,
 * e ninguém mais consegue passar em `managerId === uid`
 * (`tournament-acl.ts`) para gerenciá-lo — o dono de verdade fica trancado
 * fora do próprio torneio, de forma permanente.
 */
export function partitionOrganizerCleanup(input: {
  organizerUids: string[];
  tournaments: CleanupTournament[];
}): OrganizerCleanupPlan {
  const organizerSet = new Set(input.organizerUids.map(cleanUid).filter(Boolean));
  const preserved = new Set<string>();

  for (const tournament of input.tournaments) {
    if (tournament.seedTestTournament === true) continue;
    const managerId = cleanUid(tournament.managerId);
    if (managerId && organizerSet.has(managerId)) {
      preserved.add(managerId);
    }
  }

  const deletableOrganizerUids = input.organizerUids
    .map(cleanUid)
    .filter((uid) => uid && !preserved.has(uid));

  return {
    preservedOrganizerUids: [...preserved],
    deletableOrganizerUids,
  };
}
