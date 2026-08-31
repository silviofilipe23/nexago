import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';

final _discoveryCardDateFmt = DateFormat('dd/MM', 'pt_BR');

/// Data curta no card (ex.: 21/04).
String tournamentDiscoveryCardDateShort(DiscoveryTournament tournament) {
  return _discoveryCardDateFmt.format(tournament.startDate);
}

String tournamentDiscoveryCardCtaLabel({
  required bool isEnrolled,
  required TournamentListingStatus status,
  bool registrationNotYetOpen = false,
}) {
  if (isEnrolled) return 'Ver inscrição';
  if (registrationNotYetOpen) return 'Ver detalhes →';
  if (canRegisterForTournament(status)) return 'Inscrever →';
  return 'Ver detalhes →';
}

/// "Inscrições abrem em 05/09 às 10:00" — parede local do instante gravado
/// em `registrationOpensAt`.
String tournamentRegistrationOpensLabel(DateTime opensAt) {
  final local = opensAt.toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  return 'Inscrições abrem em ${two(local.day)}/${two(local.month)} '
      'às ${two(local.hour)}:${two(local.minute)}';
}

String tournamentStatusLabel(TournamentListingStatus status) {
  return switch (status) {
    TournamentListingStatus.scheduled => 'Programado',
    TournamentListingStatus.open => 'Inscrições abertas',
    TournamentListingStatus.bracketsReady => 'Chaves prontas',
    TournamentListingStatus.almostFull => 'Quase lotado',
    TournamentListingStatus.live => 'Em andamento',
    TournamentListingStatus.completed => 'Concluído',
    TournamentListingStatus.ended => 'Encerrado',
  };
}

/// Rótulo com suporte a `listingStatus` bruto (ex.: closed → inscrições encerradas).
String tournamentStatusLabelFromRaw({
  required TournamentListingStatus status,
  String? listingStatusRaw,
  bool registrationNotYetOpen = false,
}) {
  if (isRegistrationListingClosed(listingStatusRaw)) {
    return 'Inscrições encerradas';
  }
  if (registrationNotYetOpen && canRegisterForTournament(status)) {
    return 'Inscrições em breve';
  }
  return tournamentStatusLabel(status);
}

Color tournamentStatusColor(TournamentListingStatus status) {
  return switch (status) {
    TournamentListingStatus.scheduled => AppColors.onSurfaceMuted,
    TournamentListingStatus.open => AppColors.win,
    TournamentListingStatus.bracketsReady => AppColors.brand,
    TournamentListingStatus.almostFull => AppColors.pending,
    TournamentListingStatus.live => AppColors.live,
    TournamentListingStatus.completed => AppColors.onSurfaceMuted,
    TournamentListingStatus.ended => AppColors.onSurfaceMuted,
  };
}

String tournamentCategoryLabel(TournamentGenderCat cat) {
  return switch (cat) {
    TournamentGenderCat.m => 'Masc',
    TournamentGenderCat.f => 'Fem',
    TournamentGenderCat.mix => 'Misto',
  };
}

String tournamentFormatLabel(TournamentFormat format) {
  return switch (format) {
    TournamentFormat.dupla => 'Dupla',
    TournamentFormat.individual => 'Individual',
  };
}

String tournamentDiscoveryCategoryFilterLabel(
  TournamentDiscoveryCategoryFilter filter,
) {
  return switch (filter) {
    TournamentDiscoveryCategoryFilter.all => 'Todos',
    TournamentDiscoveryCategoryFilter.m => 'Masc',
    TournamentDiscoveryCategoryFilter.f => 'Fem',
    TournamentDiscoveryCategoryFilter.mix => 'Misto',
  };
}

bool tournamentMatchesCategoryFilter(
  DiscoveryTournament t,
  TournamentDiscoveryCategoryFilter filter,
) {
  if (filter == TournamentDiscoveryCategoryFilter.all) return true;
  final cat = switch (filter) {
    TournamentDiscoveryCategoryFilter.m => TournamentGenderCat.m,
    TournamentDiscoveryCategoryFilter.f => TournamentGenderCat.f,
    TournamentDiscoveryCategoryFilter.mix => TournamentGenderCat.mix,
    TournamentDiscoveryCategoryFilter.all => null,
  };
  return cat != null && t.categories.contains(cat);
}

bool tournamentMatchesOpenFilter(DiscoveryTournament t, bool openOnly) {
  if (!openOnly) return true;
  return canRegisterForTournament(t.status) ||
      t.status == TournamentListingStatus.live;
}

TournamentDiscoveryLiveStats computeDiscoveryLiveStats(
  List<DiscoveryTournament> tournaments,
) {
  return TournamentDiscoveryLiveStats(
    activeTournaments: tournaments
        .where((t) => !isTournamentTerminal(t.status))
        .length,
    matchesLiveNow: tournaments.fold<int>(
      0,
      (sum, t) => sum + t.liveMatchesNow,
    ),
    openRegistrations: tournaments
        .where((t) => t.status == TournamentListingStatus.open)
        .length,
  );
}

/// Contagem de inscritos do card de torneio concluído.
///
/// A unidade segue o formato: cada inscrição é uma dupla no torneio de duplas e um atleta no
/// individual, então falar em "duplas" nos dois mentiria na metade dos cards.
String tournamentEnrolledEntriesLabel(int count, TournamentFormat format) {
  final n = count < 0 ? 0 : count;
  if (format == TournamentFormat.individual) {
    if (n == 0) return 'Nenhum atleta inscrito';
    return n == 1 ? '1 atleta inscrito' : '$n atletas inscritos';
  }
  if (n == 0) return 'Nenhuma dupla inscrita';
  return n == 1 ? '1 dupla inscrita' : '$n duplas inscritas';
}
