import {type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

export function buildBracketPublishedNotificationUrl(
  tournamentId: string,
  categoryId: string,
  format: string,
): string {
  const encodedCategory = encodeURIComponent(categoryId);
  if (format === "double_elimination") {
    return `/torneios/${tournamentId}/chave/${encodedCategory}`;
  }
  return `/torneios/${tournamentId}/chave?categoryId=${encodedCategory}`;
}

export function collectBracketAthleteUidsFromTeams(
  teams: Array<Record<string, unknown>>,
): string[] {
  const uids = new Set<string>();
  for (const team of teams) {
    for (const key of ["player1Id", "player2Id"] as const) {
      const id = team[key];
      if (typeof id === "string" && id.trim()) uids.add(id.trim());
    }
  }
  return [...uids];
}

export async function notifyBracketPublishedAthletes(params: {
  db: Firestore;
  projectId: string;
  tournamentId: string;
  categoryId: string;
  categoryLabel: string;
  format: string;
  teamIds: string[];
  teamsPath: (teamId: string) => string;
}): Promise<number> {
  const {
    db,
    tournamentId,
    categoryId,
    categoryLabel,
    format,
    teamIds,
    teamsPath,
  } = params;

  const teamDocs: Array<Record<string, unknown>> = [];
  for (const teamId of teamIds) {
    const trimmed = teamId.trim();
    if (!trimmed) continue;
    const teamSnap = await db.doc(teamsPath(trimmed)).get();
    if (teamSnap.exists) {
      teamDocs.push(teamSnap.data() ?? {});
    }
  }

  const athleteUids = collectBracketAthleteUidsFromTeams(teamDocs);
  if (athleteUids.length === 0) return 0;

  const url = buildBracketPublishedNotificationUrl(
    tournamentId,
    categoryId,
    format,
  );
  const body =
    `A chave de ${categoryLabel} foi publicada. Confira como ficou.`;

  await Promise.all(
    athleteUids.map((userId) =>
      deliverNotificationToUser({
        userId,
        title: "Chave publicada",
        body,
        type: "tournament_bracket_published",
        data: {tournamentId, categoryId, url},
      }).catch((error) => {
        logger.warn("notifyBracketPublishedAthletes: falha ao notificar", {
          userId,
          tournamentId,
          categoryId,
          error,
        });
      }),
    ),
  );

  return athleteUids.length;
}
