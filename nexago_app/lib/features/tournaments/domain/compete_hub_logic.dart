import 'dart:math';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../athlete/domain/athlete_discover_logic.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../ranking/domain/ranking_display_helpers.dart';
import 'compete_hub_models.dart';
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
  DateTime? now,
}) {
  if (!canRegisterForTournament(tournament.status)) return false;
  if (tournamentRegistrationNotYetOpen(
    tournament.registrationOpensAt,
    now: now,
  )) {
    return false;
  }
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

/// Preview do hub: prioriza inscrições abertas; completa com torneios existentes
/// (incluindo finalizados) quando não houver [limit] elegíveis.
List<DiscoveryTournament> pickTournamentsForHubPreview(
  List<DiscoveryTournament> tournaments, {
  String? athleteGender,
  Map<String, Set<String>> registeredCategoriesByTournamentId = const {},
  int limit = 5,
}) {
  final registerable = pickNewestRegisterableTournamentsForHub(
    tournaments,
    athleteGender: athleteGender,
    registeredCategoriesByTournamentId: registeredCategoriesByTournamentId,
    limit: limit,
  );
  if (registerable.length >= limit || tournaments.isEmpty) {
    return registerable;
  }

  final pickedIds = registerable.map((t) => t.id).toSet();
  final fillers = tournaments.where((t) => !pickedIds.contains(t.id)).toList()
    ..sort((a, b) {
      final cmp = hubTournamentSortDate(b).compareTo(hubTournamentSortDate(a));
      if (cmp != 0) return cmp;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });

  return [...registerable, ...fillers.take(limit - registerable.length)];
}

String hubTournamentCategoryCountLabel(DiscoveryTournament tournament) {
  final count = tournament.categoryOffers.length;
  if (count <= 0) return 'Sem categorias';
  return '$count ${count == 1 ? 'CATEGORIA' : 'CATEGORIAS'}';
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

String _normLocation(String value) => value.trim().toLowerCase();

/// Mesma cidade do viewer (UF compatível quando ambos têm UF).
bool athleteMatchesViewerCity(AthleteProfile viewer, AthleteProfile other) {
  final viewerCity = _normLocation(viewer.city);
  final viewerState = _normLocation(viewer.state ?? '');
  final city = _normLocation(other.city);
  final state = _normLocation(other.state ?? '');
  if (viewerCity.isEmpty || city != viewerCity) return false;
  if (viewerState.isEmpty || state.isEmpty || viewerState == state) {
    return true;
  }
  return false;
}

/// Mesmo UF, cidade diferente do viewer.
bool athleteMatchesViewerState(AthleteProfile viewer, AthleteProfile other) {
  final viewerState = _normLocation(viewer.state ?? '');
  final state = _normLocation(other.state ?? '');
  if (viewerState.isEmpty || state.isEmpty || viewerState != state) {
    return false;
  }
  return !athleteMatchesViewerCity(viewer, other);
}

bool _hubAthleteExcluded(AthleteProfile profile, String? currentUserId) {
  final uid = currentUserId?.trim();
  return uid != null && uid.isNotEmpty && profile.id == uid;
}

/// Até [limit] atletas: cidade → UF → aleatório.
List<AthleteProfile> pickAthletesForHubPreview({
  required AthleteProfile? viewer,
  required List<AthleteProfile> regionalPool,
  required List<AthleteProfile> randomPool,
  required String? currentUserId,
  int limit = 10,
  Random? random,
}) {
  if (limit <= 0) return const [];

  final rng = random ?? Random();
  final picked = <String, AthleteProfile>{};

  void addFrom(List<AthleteProfile> pool) {
    if (picked.length >= limit) return;
    final shuffled = [...pool]..shuffle(rng);
    for (final profile in shuffled) {
      if (picked.length >= limit) break;
      if (_hubAthleteExcluded(profile, currentUserId)) continue;
      if (picked.containsKey(profile.id)) continue;
      picked[profile.id] = profile;
    }
  }

  if (viewer != null) {
    final cityBucket = regionalPool
        .where((p) => athleteMatchesViewerCity(viewer, p))
        .toList();
    final stateBucket = regionalPool
        .where((p) => athleteMatchesViewerState(viewer, p))
        .toList();
    addFrom(cityBucket);
    if (picked.length < limit) addFrom(stateBucket);
  }

  if (picked.length < limit) addFrom(randomPool);

  return picked.values.toList();
}

String hubAthleteCategoryLabel(AthleteProfile profile) {
  final category = profile.category?.trim() ?? '';
  if (category.isNotEmpty) return category;
  final level = profile.level.trim();
  if (level.isNotEmpty) return level;
  return 'Atleta';
}

CompeteHubAthletePreview buildCompeteHubAthletePreview(
  AthleteProfile profile, {
  DateTime? now,
}) {
  final reference = now ?? DateTime.now();
  return CompeteHubAthletePreview(
    userId: profile.id,
    name: athleteDisplayName(profile),
    categoryLabel: hubAthleteCategoryLabel(profile),
    initials: athleteInitials(profile),
    avatarColor: rankingAvatarColor(profile.id),
    avatarUrl: profile.avatarUrl,
    isOnline: isAthleteOnline(profile, reference),
  );
}
