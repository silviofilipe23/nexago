import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import 'tournament_discovery_models.dart';

final _hubTileDateFmt = DateFormat('d MMM', 'pt_BR');

/// Seleciona torneios para preview horizontal no hub (destaque + abertos primeiro).
List<DiscoveryTournament> pickTournamentsForHubPreview(
  List<DiscoveryTournament> tournaments, {
  int limit = 8,
}) {
  if (tournaments.isEmpty || limit <= 0) return const [];

  final sorted = [...tournaments]..sort((a, b) {
      final featuredCmp = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      if (featuredCmp != 0) return featuredCmp;

      final openCmp = (_openPriority(b.status)) - (_openPriority(a.status));
      if (openCmp != 0) return openCmp;

      return a.startDate.compareTo(b.startDate);
    });

  return sorted.take(limit).toList();
}

int _openPriority(TournamentListingStatus status) {
  return switch (status) {
    TournamentListingStatus.open => 3,
    TournamentListingStatus.almostFull => 2,
    TournamentListingStatus.bracketsReady => 1,
    _ => 0,
  };
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
