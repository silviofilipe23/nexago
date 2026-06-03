import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ranking/domain/ranking_providers.dart';
import '../data/my_tournament_registrations_repository.dart';
import 'my_tournaments_logic.dart';
import 'my_tournaments_models.dart';
import 'tournament_discovery_models.dart';
import 'tournament_discovery_providers.dart';

final myTournamentsPageStateProvider =
    Provider.autoDispose<AsyncValue<MyTournamentsPageState>>((ref) {
  final regsAsync = ref.watch(myTournamentRegistrationsProvider);
  final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
  final rankingAsync = ref.watch(competeHubUserRankingProvider);

  if (regsAsync.isLoading || tournamentsAsync.isLoading) {
    return const AsyncValue.loading();
  }

  if (regsAsync.hasError) {
    return AsyncValue.error(regsAsync.error!, regsAsync.stackTrace!);
  }
  if (tournamentsAsync.hasError) {
    return AsyncValue.error(
      tournamentsAsync.error!,
      tournamentsAsync.stackTrace!,
    );
  }

  final regs = regsAsync.value ?? const <MyTournamentRegistration>[];
  final tournaments =
      tournamentsAsync.value ?? const <DiscoveryTournament>[];
  final ranking = rankingAsync.valueOrNull;

  final seasonYear = resolveSeasonYear(
    rankingSeasonLabel: ranking?.seasonLabel,
  );

  final enrollments = buildMyTournamentEnrollments(
    registrations: regs,
    tournamentsById: tournamentsById(tournaments),
  );

  return AsyncValue.data(
    buildMyTournamentsPageState(
      enrollments: enrollments,
      seasonYear: seasonYear,
    ),
  );
});
