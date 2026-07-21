import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

/**
 * Feed da Comunidade — itens gerados pelo sistema (sem UGC), publicados por
 * este arquivo a partir do trigger `onTournamentWrittenCommunityFeed`:
 * - `tournament_open`: inscrições abertas.
 * - `tournament_champions`: torneio concluído, campeões por categoria.
 * Docs em `communityFeed/{id}` com ID determinístico (idempotente).
 *
 * Um terceiro `type`, `organizer_announcement`, é publicado por uma callable
 * (não por este trigger) em `./tournament-announcements.ts` — aviso público
 * escrito manualmente pelo organizador do torneio.
 */



function listingStatus(data: Record<string, unknown> | undefined): string {
  return String(data?.["listingStatus"] ?? "").trim().toLowerCase();
}

/** Transição para inscrições abertas (inclui criação já aberta). */
export function shouldPostTournamentOpen(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  return listingStatus(after) === "open" && listingStatus(before) !== "open";
}

/** Transição para concluído. */
export function shouldPostTournamentCompleted(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  return listingStatus(after) === "completed" &&
    listingStatus(before) !== "completed";
}

export interface ChampionCategory {
  categoryId: string;
  categoryName: string;
  championTeamId: string;
}

/** Extrai campeões registrados em `categoryOps.{id}.championTeamId`. */
export function extractChampionCategories(
  data: Record<string, unknown>,
): ChampionCategory[] {
  const ops = data["categoryOps"];
  if (ops == null || typeof ops !== "object") return [];

  const categories = Array.isArray(data["categories"]) ?
    (data["categories"] as Array<Record<string, unknown>>) :
    [];
  const nameById = new Map<string, string>();
  for (const cat of categories) {
    const id = String(cat?.["id"] ?? "").trim();
    const name = String(cat?.["categoryName"] ?? cat?.["name"] ?? "").trim();
    if (id) nameById.set(id, name);
  }

  const result: ChampionCategory[] = [];
  for (const [categoryId, raw] of Object.entries(
    ops as Record<string, unknown>,
  )) {
    if (raw == null || typeof raw !== "object") continue;
    const championTeamId =
      String((raw as Record<string, unknown>)["championTeamId"] ?? "").trim();
    if (!championTeamId) continue;
    result.push({
      categoryId,
      categoryName: nameById.get(categoryId) ?? "",
      championTeamId,
    });
  }
  result.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  return result;
}

/** Campos comuns do item de feed a partir do doc do torneio. */
export function buildFeedItemBase(
  tournamentId: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    tournamentId,
    tournamentName: String(data["name"] ?? "").trim(),
    city: String(data["city"] ?? "").trim(),
    locationName: String(data["locationName"] ?? "").trim(),
    startAt: data["startAt"] ?? null,
    endAt: data["endAt"] ?? null,
  };
}

interface ChampionPlayer {
  uid: string;
  name: string;
  photoUrl: string | null;
}

async function resolveTeamPlayers(
  db: Firestore,
  teamId: string,
): Promise<ChampionPlayer[]> {
  const teamSnap = await db
    .doc(`${artifactsTeamsPath(getFirebaseProjectId())}/${teamId}`)
    .get();
  const team = teamSnap.data() ?? {};
  const uids = [team["player1Id"], team["player2Id"]]
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);

  const players: ChampionPlayer[] = [];
  for (const uid of uids) {
    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() ?? {};
    const nickname = String(user["nickname"] ?? "").trim();
    const fullName = String(user["fullName"] ?? "").trim();
    players.push({
      uid,
      name: nickname || fullName || "Atleta",
      photoUrl: String(user["profilePhotoUrl"] ?? "").trim() || null,
    });
  }
  return players;
}

export const onTournamentWrittenCommunityFeed = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const {tournamentId} = event.params;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const db = getFirestore();

    if (shouldPostTournamentOpen(before, after)) {
      const categories = Array.isArray(after["categories"]) ?
        (after["categories"] as unknown[]).length :
        0;
      await db.doc(`communityFeed/open_${tournamentId}`).set({
        type: "tournament_open",
        ...buildFeedItemBase(tournamentId, after),
        categoriesCount: categories,
        createdAt: FieldValue.serverTimestamp(),
      });
      logger.info("communityFeed: inscrições abertas publicadas", {
        tournamentId,
      });
    }

    if (shouldPostTournamentCompleted(before, after)) {
      const championCategories = extractChampionCategories(after);
      if (championCategories.length === 0) return;

      const champions = [];
      for (const cat of championCategories) {
        champions.push({
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          players: await resolveTeamPlayers(db, cat.championTeamId),
        });
      }

      await db.doc(`communityFeed/champions_${tournamentId}`).set({
        type: "tournament_champions",
        ...buildFeedItemBase(tournamentId, after),
        champions,
        createdAt: FieldValue.serverTimestamp(),
      });
      logger.info("communityFeed: campeões publicados", {
        tournamentId,
        categories: champions.length,
      });
    }
  },
);
