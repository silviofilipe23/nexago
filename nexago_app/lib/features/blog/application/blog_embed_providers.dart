import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/profiles/users_repository.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../../arenas/domain/slots_query.dart';
import '../../ranking/data/ranking_repository.dart';
import '../../ranking/domain/ranking_list_mapper.dart';
import '../../ranking/domain/ranking_list_models.dart';
import '../../ranking/domain/ranking_providers.dart';
import '../domain/blog_embed_logic.dart';
import '../domain/blog_post.dart';

/// Quantas linhas o bloco de ranking mostra.
const blogRankingTopCount = 5;

/// Horários livres de hoje da arena do bloco. Mesmas leituras do "hoje" do
/// detalhe da arena (`arenaDetailTodayCourtsProvider`): quadras, a arena (preço
/// de fallback dos slots virtuais) e a grade do dia de cada quadra.
final blogArenaFreeTimesProvider = FutureProvider.autoDispose
    .family<List<BlogArenaFreeTime>, String>((ref, arenaId) async {
      final aid = arenaId.trim();
      if (aid.isEmpty) return const [];
      final courts = await ref.watch(courtsStreamProvider(aid).future);
      final arena = await ref.watch(arenaByIdProvider(aid).future);
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final slotsByCourtId = <String, List<ArenaSlot>>{};
      for (final court in courts) {
        if (court.isMaintenance) continue;
        final query = SlotsQuery(
          arenaId: aid,
          courtId: court.id,
          date: today,
          arenaFallbackPricePerHourReais: arena?.pricePerHourReais,
        );
        slotsByCourtId[court.id] = await ref.watch(
          slotsStreamProvider(query).future,
        );
      }
      return blogArenaFreeTimes(
        courts: courts,
        slotsByCourtId: slotsByCourtId,
        today: today,
        now: now,
      );
    });

/// Top 5 do ranking do bloco: a mesma montagem da tela de ranking (pontos da
/// temporada, gênero pelo perfil/equipe, posições renumeradas depois do
/// filtro). Esporte desconhecido = lista vazia (o bloco some).
final blogRankingTopProvider = FutureProvider.autoDispose
    .family<List<RankingListEntry>, BlogRankingEmbed>((ref, block) async {
      final filter = blogRankingFilter(
        block,
        year: ref.watch(rankingSeasonYearProvider),
      );
      if (filter == null) return const [];
      final user = await ref.watch(authProvider.future);
      final repo = ref.read(rankingRepositoryProvider);
      final users = ref.read(usersRepositoryProvider);
      final entries = filter.mode == RankingListMode.teams
          ? await buildTeamRankingListEntries(
              repo: repo,
              users: users,
              filter: filter,
              sportCode: filter.sport!,
              currentUid: user?.uid,
            )
          : await buildAthleteRankingListEntries(
              repo: repo,
              users: users,
              filter: filter,
              sportCode: filter.sport!,
              currentUid: user?.uid,
            );
      return sortedRankingEntries(
        entries,
      ).take(blogRankingTopCount).toList(growable: false);
    });
