import 'package:intl/intl.dart';

import 'league_ranking_models.dart';
import 'tournament_detail_logic.dart';
import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';

String leagueStatusBadgeLabel(String? listingStatusRaw) {
  final status = listingStatusFromRaw(listingStatusRaw);
  return switch (status) {
    TournamentListingStatus.live => 'EM ANDAMENTO',
    TournamentListingStatus.open => 'INSCRIÇÕES ABERTAS',
    TournamentListingStatus.almostFull => 'QUASE LOTADO',
    TournamentListingStatus.bracketsReady => 'CHAVES PRONTAS',
    TournamentListingStatus.completed => 'CONCLUÍDA',
    TournamentListingStatus.ended => 'ENCERRADA',
    TournamentListingStatus.scheduled => 'PROGRAMADA',
    null => 'LIGA',
  };
}

String leagueStagesBadgeLabel(DiscoveryLeague league) {
  final count = league.totalStagesCount;
  return 'LIGA · $count ETAPAS';
}

String leagueSeasonDateLabel(DiscoveryLeague league) {
  final start = league.seasonStartAt;
  final end = league.seasonEndAt;
  if (start != null && end != null) {
    final startLabel = DateFormat('MMM', 'pt_BR').format(start);
    final endLabel = DateFormat('MMM yyyy', 'pt_BR').format(end);
    return '${_capitalizeMonth(startLabel)} – ${_capitalizeMonth(endLabel)}';
  }
  final label = league.seasonLabel?.trim();
  if (label != null && label.isNotEmpty) return label;
  return 'Temporada';
}

String leagueLocationLabel({String? city, String? state}) {
  final parts = <String>[
    if (city != null && city.trim().isNotEmpty) city.trim(),
    if (state != null && state.trim().isNotEmpty) state.trim(),
  ];
  if (parts.isEmpty) return 'Local a definir';
  return parts.join(', ');
}

int leagueCompletedStagesCount(
  DiscoveryLeague league,
  Map<String, DiscoveryTournament> tournamentsById,
) {
  var completed = 0;
  for (final stage in league.stages) {
    final hasCompleted = stage.tournamentIds.any((id) {
      final tournament = tournamentsById[id];
      if (tournament == null) return false;
      return tournament.status == TournamentListingStatus.completed;
    });
    if (hasCompleted) completed++;
  }
  return completed;
}

String leagueCompletedStagesLabel(
  DiscoveryLeague league,
  Map<String, DiscoveryTournament> tournamentsById,
) {
  final completed = leagueCompletedStagesCount(league, tournamentsById);
  final total = league.totalStagesCount;
  return 'APÓS $completed DE $total';
}

String? leagueGrandFinalBannerText(DiscoveryLeague league) {
  if (!league.grandFinalEnabled || league.grandFinalSpots <= 0) return null;
  final spots = league.grandFinalSpots;
  final month = league.seasonEndAt != null
      ? DateFormat('MMMM', 'pt_BR').format(league.seasonEndAt!)
      : 'dezembro';
  final monthLabel = _capitalizeMonth(month);
  final noun = spots == 1 ? 'dupla' : 'duplas';
  return 'As $spots melhores $noun garantem vaga na Grande Final em $monthLabel.';
}

DiscoveryLeagueCategory? categoryForGender(
  List<DiscoveryLeagueCategory> categories,
  TournamentGenderCat gender,
) {
  final target = switch (gender) {
    TournamentGenderCat.m => 'male',
    TournamentGenderCat.f => 'female',
    TournamentGenderCat.mix => 'mixed',
  };
  for (final category in categories) {
    if (category.genderType == target) return category;
  }
  for (final category in categories) {
    final tag = genderTagFromText(category.genderType ?? category.name);
    final matches = switch (gender) {
      TournamentGenderCat.m => tag == 'MASCULINO',
      TournamentGenderCat.f => tag == 'FEMININO',
      TournamentGenderCat.mix => tag == 'MISTO',
    };
    if (matches) return category;
  }
  return categories.isNotEmpty ? categories.first : null;
}

TournamentGenderCat? initialLeagueGenderFilter(
  List<DiscoveryLeagueCategory> categories,
) {
  if (categories.isEmpty) return null;
  for (final gender in TournamentGenderCat.values) {
    if (categoryForGender(categories, gender) != null) return gender;
  }
  return null;
}

String _capitalizeMonth(String raw) {
  if (raw.isEmpty) return raw;
  return raw[0].toUpperCase() + raw.substring(1);
}
