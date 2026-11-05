import { Injectable, inject } from '@angular/core';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { environment } from '../../../../../environments/environment';
import { backofficeDb } from '../../../data/firebase';
import { TournamentsRepository, tournamentRowOf } from '../../../torneios/data/tournaments.repository';
import {
  isListedTournament,
  rankingStagesFromDoc,
  recentStages,
  type ProductCandidate,
  type RankingStageCandidate,
  type TournamentCandidate,
} from './blog-suggestions';

/** Torneios mais recentes por data de início: os próximos ficam no topo desta página. */
const TOURNAMENTS_SCAN = 60;

export interface SuggestionSources {
  tournaments: TournamentCandidate[];
  stages: RankingStageCandidate[];
  products: ProductCandidate[];
}

function dateOf(v: unknown): Date | null {
  const toDate = (v as { toDate?: unknown } | null)?.toDate;
  return typeof toDate === 'function' ? (toDate.call(v) as Date) : null;
}

/**
 * Leituras das "Pautas sugeridas" — só o que o admin já lê, nada é gravado. Cada fonte falha
 * sozinha: sem ela, as outras pautas continuam.
 */
@Injectable({ providedIn: 'root' })
export class BlogSuggestionsRepository {
  private readonly tournamentsRepository = inject(TournamentsRepository);

  async load(now: Date): Promise<SuggestionSources> {
    const [tournaments, stages, products] = await Promise.allSettled([
      this.tournaments(),
      this.stages(now),
      this.products(),
    ]);
    return {
      tournaments: tournaments.status === 'fulfilled' ? tournaments.value : [],
      stages: stages.status === 'fulfilled' ? stages.value : [],
      products: products.status === 'fulfilled' ? products.value : [],
    };
  }

  /** Torneios listados (mesma regra do site), sem rascunho, ordenados pela data de início. */
  private async tournaments(): Promise<TournamentCandidate[]> {
    const snap = await getDocs(
      query(collection(backofficeDb(), 'tournaments'), orderBy('startAt', 'desc'), limit(TOURNAMENTS_SCAN)),
    );
    return snap.docs
      .filter((d) => isListedTournament(d.data()))
      .map((d) => {
        const row = tournamentRowOf(d);
        const sport = d.data()['sport'];
        return {
          id: row.id,
          name: row.name,
          sport: typeof sport === 'string' ? sport : null,
          status: row.status,
          startAt: row.startAt,
        };
      });
  }

  /**
   * `artifacts/{projectId}/public/data/rankingStages/{esporte}` (o app lê o mesmo em
   * `ranking_repository.dart`); o nome da etapa vem do doc do torneio.
   */
  private async stages(now: Date): Promise<RankingStageCandidate[]> {
    const path = `artifacts/${environment.firebase.projectId}/public/data/rankingStages`;
    const snap = await getDocs(collection(backofficeDb(), path));
    const recent = recentStages(
      snap.docs.flatMap((d) => rankingStagesFromDoc(d.id, d.data())),
      now,
    );
    const names = new Map(
      (await this.tournamentsRepository.byIds(recent.map((s) => s.tournamentId)).catch(() => [])).map((t) => [t.id, t.name]),
    );
    return recent.map((s) => ({ ...s, tournamentName: names.get(s.tournamentId) ?? null }));
  }

  /** Vitrine com o selo "nova" (posto pelo time; vale 30 dias depois da publicação). */
  private async products(): Promise<ProductCandidate[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'storeShowcase'), where('badge', '==', 'nova')));
    return snap.docs.flatMap((d) => {
      const data = d.data();
      const name = typeof data['name'] === 'string' ? data['name'].trim() : '';
      return name ? [{ id: d.id, name, newUntil: dateOf(data['badgeExpiresAt']) }] : [];
    });
  }
}
