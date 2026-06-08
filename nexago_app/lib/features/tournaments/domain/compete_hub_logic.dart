import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';
import 'tournament_registration_logic.dart';

final _hubTileDateFmt = DateFormat('d MMM', 'pt_BR');

DateTime hubTournamentSortDate(DiscoveryTournament tournament) {
  return tournament.createdAt ?? tournament.startDate;
}

bool tournamentHasRegisterableCategoryForUser(
  DiscoveryTournament tournament, {
  String? athleteGender,
  Set<String> registeredCategoryIds = const {},
}) {
  if (!canRegisterForTournament(tournament.status)) return false;
  return tournament.categoryOffers.any((offer) {
    if (registeredCategoryIds.contains(offer.id)) return false;
    if (!isCategorySelectable(offer)) return false;
    if (!athleteMatchesCategoryGender(offer, athleteGender)) return false;
    return true;
  });
}

/// Seleciona os torneios mais novos em que o atleta ainda pode se inscrever.
List<DiscoveryTournament> pickNewestRegisterableTournamentsForHub(
  List<DiscoveryTournament> tournaments, {
  String? athleteGender,
  Map<String, Set<String>> registeredCategoriesByTournamentId = const {},
  int limit = 5,
}) {
  if (tournaments.isEmpty || limit <= 0) return const [];

  final filtered = tournaments.where((tournament) {
    final registered =
        registeredCategoriesByTournamentId[tournament.id] ?? const {};
    return tournamentHasRegisterableCategoryForUser(
      tournament,
      athleteGender: athleteGender,
      registeredCategoryIds: registered,
    );
  }).toList();

  filtered.sort((a, b) {
    final cmp = hubTournamentSortDate(b).compareTo(hubTournamentSortDate(a));
    if (cmp != 0) return cmp;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });

  return filtered.take(limit).toList();
}

String hubTournamentCategoryCountLabel(DiscoveryTournament tournament) {
  final count = tournament.categoryOffers.length;
  if (count <= 0) return 'Sem categorias';
  if (count == 1) return '1 categoria';
  return '$count categorias';
}

/// Data no tile do hub (ex.: `28 mai`).
String hubTournamentDateLabel(DiscoveryTournament tournament) {
  return _hubTileDateFmt
      .format(tournament.startDate)
      .replaceAll('.', '')
      .toLowerCase();
}

/// Cor da barra superior e da data — alinhada ao protótipo do hub.
Color hubTournamentAccentColor(DiscoveryTournament tournament) {
  if (tournament.featured) return AppColors.brand;
  if (tournament.status == TournamentListingStatus.open ||
      tournament.status == TournamentListingStatus.almostFull) {
    return AppColors.win;
  }
  return switch (tournament.status) {
    TournamentListingStatus.bracketsReady => AppColors.brand,
    TournamentListingStatus.live => AppColors.live,
    _ => AppColors.onSurfaceMuted,
  };
}

String hubTournamentStatusBadge(DiscoveryTournament tournament) {
  return switch (tournament.status) {
    TournamentListingStatus.open => 'ABERTO',
    TournamentListingStatus.almostFull => 'ABERTO',
    TournamentListingStatus.live => 'AO VIVO',
    TournamentListingStatus.bracketsReady => 'CHAVES',
    TournamentListingStatus.completed => 'ENCERRADO',
    TournamentListingStatus.ended => 'ENCERRADO',
    TournamentListingStatus.scheduled => 'EM BREVE',
  };
}
