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
  /**
   * Inscrições órfãs (o `tournamentId` não existe em `tournaments`) cujos
   * participantes são TODOS atletas seed — apagar junto, é lixo do seed.
   */
  orphanSeedInscriptionIds: string[];
  /**
   * Inscrições órfãs que envolvem alguém que não é atleta seed (ou que não
   * têm participante nenhum) — apenas reportar, nunca apagar.
   */
  orphanUnknownInscriptionIds: string[];
  /** Duplas referenciadas pelas inscrições apagáveis — apagar. */
  teamIds: string[];
  /** Atletas NÃO-seed inscritos em torneio seed — motivo de abortar. */
  realAthleteUids: string[];
  /** Atletas seed inscritos em torneio real EXISTENTE — preservar. */
  preservedAthleteUids: string[];
  /** Atletas seed seguros para apagar. */
  deletableAthleteUids: string[];
}

/**
 * Cruza inscrições, atletas seed e torneios para decidir a limpeza.
 *
 * `inscriptions` deve conter TODAS as inscrições do projeto, não só as dos
 * torneios seed: é justamente a presença de um atleta seed numa inscrição de
 * torneio real que o torna impossível de apagar.
 *
 * `existingTournamentIds` deve conter os ids de TODOS os torneios que existem
 * hoje (seed e reais). Sem ele não dá para distinguir "inscrição em torneio
 * real" de "inscrição com `tournamentId` pendurado", e as duas caem no mesmo
 * ramo: um torneio seed apagado à mão pelo console deixa as inscrições para
 * trás, todo atleta seed delas vira "preservado", a limpeza vira no-op
 * permanente e o relatório afirma que existem torneios REAIS envolvidos —
 * mentira, o torneio não existe mais. É um parâmetro obrigatório de
 * propósito: omitir por engano recriaria exatamente esse bug.
 */
export function partitionCleanupTargets(input: {
  inscriptions: CleanupInscription[];
  seedAthleteUids: string[];
  seedTournamentIds: string[];
  existingTournamentIds: string[];
}): CleanupPlan {
  const seedAthletes = new Set(input.seedAthleteUids.map(cleanUid).filter(Boolean));
  const seedTournaments = new Set(
    input.seedTournamentIds.map(cleanUid).filter(Boolean),
  );
  const existingTournaments = new Set(
    input.existingTournamentIds.map(cleanUid).filter(Boolean),
  );

  const seedInscriptionIds: string[] = [];
  const orphanSeedInscriptionIds: string[] = [];
  const orphanUnknownInscriptionIds: string[] = [];
  const teamIds: string[] = [];
  const seenTeamIds = new Set<string>();
  const realAthleteUids: string[] = [];
  const seenRealUids = new Set<string>();
  const preservedAthleteUids: string[] = [];
  const seenPreservedUids = new Set<string>();

  const takeTeamId = (inscription: CleanupInscription): void => {
    const teamId = cleanUid(inscription.teamId);
    if (teamId && !seenTeamIds.has(teamId)) {
      seenTeamIds.add(teamId);
      teamIds.push(teamId);
    }
  };

  for (const inscription of input.inscriptions) {
    const tournamentId = cleanUid(inscription.tournamentId);
    const participants = inscriptionParticipantUids(inscription);

    if (seedTournaments.has(tournamentId)) {
      seedInscriptionIds.push(inscription.id);
      takeTeamId(inscription);

      for (const uid of participants) {
        if (!seedAthletes.has(uid) && !seenRealUids.has(uid)) {
          seenRealUids.add(uid);
          realAthleteUids.push(uid);
        }
      }
      continue;
    }

    if (!existingTournaments.has(tournamentId)) {
      // Órfã: o torneio apontado não existe (id vazio, torneio apagado pelo
      // console, etc.). Não pode preservar atleta nenhum — não há torneio
      // real para proteger. Só é apagável quando é provadamente lixo do
      // seed: todos os participantes são atletas seed. Qualquer participante
      // fora disso (ou nenhum participante) é reportado e não tocado — a
      // limpeza nunca apaga o que não conseguiu provar que é seed.
      const isSeedOnly =
        participants.length > 0 && participants.every((uid) => seedAthletes.has(uid));
      if (isSeedOnly) {
        orphanSeedInscriptionIds.push(inscription.id);
        takeTeamId(inscription);
      } else {
        orphanUnknownInscriptionIds.push(inscription.id);
      }
      continue;
    }

    // Torneio real EXISTENTE: qualquer atleta seed aqui precisa sobreviver.
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
    orphanSeedInscriptionIds,
    orphanUnknownInscriptionIds,
    teamIds,
    realAthleteUids,
    preservedAthleteUids,
    deletableAthleteUids,
  };
}

/**
 * Doc de ranking/rating reduzido ao que decide a limpeza.
 *
 * Cobre `athleteRankings`, `teamRankings`, `tournamentCategoryResults`,
 * `athleteRatings`, `leagueAthleteRankings` e `leagueTeamRankings` — coleções
 * escritas por TRIGGER a partir das partidas, que por isso nunca carregam flag
 * `seedTest*` e precisam ser decididas pelo dono.
 */
export interface CleanupRankingDoc {
  /** Caminho completo do doc — é o que o script apaga. */
  path: string;
  /** Dono atleta, quando a coleção é por atleta. */
  athleteId?: string;
  /** Dona dupla, quando a coleção é por dupla. */
  teamId?: string;
  /** Torneio do doc (só `tournamentCategoryResults`). */
  tournamentId?: string;
}

/** O que a limpeza de ranking decide apagar, e por qual motivo. */
export interface RankingCleanupPlan {
  /** Dono (ou torneio) é seed apagável — sai junto com o resto do seed. */
  seedRankingPaths: string[];
  /**
   * Dono não existe mais: `users/{uid}` / `teams/{teamId}` já foram apagados
   * e só o doc de ranking sobrou. São os "atletas fantasma" das telas.
   */
  orphanRankingPaths: string[];
}

/**
 * Decide, doc a doc, o que sai das coleções de ranking/rating.
 *
 * Dois motivos independentes para apagar:
 *
 * 1. **Seed** — o dono é um atleta/dupla que esta limpeza vai apagar, ou o doc
 *    é de um torneio seed. Some junto, como o resto do seed.
 * 2. **Órfão** — o dono já não existe. Nenhuma flag prova que era seed (essas
 *    coleções nunca tiveram flag), mas um ranking de conta inexistente é lixo
 *    por definição: a tela não esconde a linha, ela desenha um nome de
 *    fallback ("Atleta ab12cd"). São as sobras das execuções anteriores a este
 *    passo existir, quando `users` era apagado e o ranking ficava para trás.
 *
 * Seed ganha de órfão na classificação — os dois apagam, a separação existe só
 * para o relatório distinguir "lixo desta rodada" de "sobra antiga".
 *
 * Doc sem dono identificável (campo vazio ou ausente) é MANTIDO: sem dono não
 * dá para provar nem que é seed nem que é órfão, e a limpeza não apaga o que
 * não conseguiu provar.
 */
export function partitionRankingDocs(input: {
  docs: CleanupRankingDoc[];
  deletableAthleteUids: string[];
  deletableTeamIds: string[];
  seedTournamentIds: string[];
  orphanAthleteUids: string[];
  orphanTeamIds: string[];
}): RankingCleanupPlan {
  const toSet = (list: string[]): Set<string> =>
    new Set(list.map(cleanUid).filter(Boolean));

  const seedAthletes = toSet(input.deletableAthleteUids);
  const seedTeams = toSet(input.deletableTeamIds);
  const seedTournaments = toSet(input.seedTournamentIds);
  const orphanAthletes = toSet(input.orphanAthleteUids);
  const orphanTeams = toSet(input.orphanTeamIds);

  const seedRankingPaths: string[] = [];
  const orphanRankingPaths: string[] = [];

  for (const doc of input.docs) {
    const athleteId = cleanUid(doc.athleteId);
    const teamId = cleanUid(doc.teamId);
    const tournamentId = cleanUid(doc.tournamentId);

    const isSeed =
      (athleteId !== "" && seedAthletes.has(athleteId)) ||
      (teamId !== "" && seedTeams.has(teamId)) ||
      (tournamentId !== "" && seedTournaments.has(tournamentId));
    if (isSeed) {
      seedRankingPaths.push(doc.path);
      continue;
    }

    const isOrphan =
      (athleteId !== "" && orphanAthletes.has(athleteId)) ||
      (teamId !== "" && orphanTeams.has(teamId));
    if (isOrphan) orphanRankingPaths.push(doc.path);
  }

  return {seedRankingPaths, orphanRankingPaths};
}

/** Campos de `ratingEvents` usados pela decisão de limpeza. */
export interface CleanupRatingEvent {
  id: string;
  athleteIds?: unknown;
}

/** O que a limpeza do ledger de rating decide apagar/reportar. */
export interface RatingEventCleanupPlan {
  /** Eventos cujos participantes são TODOS removíveis — apagar. */
  deletableRatingEventIds: string[];
  /**
   * Eventos que misturam atleta removível com alguém que fica — apenas
   * reportar, nunca apagar.
   */
  mixedRatingEventIds: string[];
}

/**
 * Decide quais docs de `ratingEvents` (o ledger que a engine de rating replaya)
 * podem sair.
 *
 * `removableAthleteUids` é a união dos atletas seed apagáveis com os órfãos
 * (uid sem `users/{uid}`) — os dois casos que somem desta limpeza.
 *
 * Um evento com atleta que FICA é REPORTADO, não apagado: apagar o ledger não
 * desfaz rating nenhum (`athleteRatings` é o estado, `ratingEvents` é o
 * histórico), então sumir com o evento só faria o replay administrativo
 * recalcular o rating de quem ficou para um valor diferente do que ele
 * realmente jogou. Mesma regra das inscrições órfãs: a limpeza não apaga o que
 * não conseguiu provar que é descartável por inteiro.
 */
export function partitionRatingEvents(input: {
  events: CleanupRatingEvent[];
  removableAthleteUids: string[];
}): RatingEventCleanupPlan {
  const removableAthletes = new Set(
    input.removableAthleteUids.map(cleanUid).filter(Boolean),
  );

  const deletableRatingEventIds: string[] = [];
  const mixedRatingEventIds: string[] = [];

  for (const event of input.events) {
    const raw = Array.isArray(event.athleteIds) ? event.athleteIds : [];
    const athleteIds = raw.map(cleanUid).filter(Boolean);
    const isRemovableOnly =
      athleteIds.length > 0 &&
      athleteIds.every((uid) => removableAthletes.has(uid));
    if (isRemovableOnly) {
      deletableRatingEventIds.push(event.id);
    } else {
      mixedRatingEventIds.push(event.id);
    }
  }

  return {deletableRatingEventIds, mixedRatingEventIds};
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
