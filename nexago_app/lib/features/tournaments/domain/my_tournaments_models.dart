import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'tournament_discovery_labels.dart';
import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';

/// Destaque visual do card na lista (protótipo A1).
enum MyTournamentCardAccent {
  live,
  enrolled,
  neutral,
}

/// Inscrição do atleta enriquecida com dados do torneio (discovery).
class MyTournamentEnrollment {
  const MyTournamentEnrollment({
    required this.registration,
    this.tournament,
  });

  final MyTournamentRegistration registration;
  final DiscoveryTournament? tournament;

  String get tournamentId => registration.tournamentId;

  String get displayName =>
      tournament?.name.trim().isNotEmpty == true
          ? tournament!.name
          : registration.tournamentName;

  TournamentListingStatus get listingStatus =>
      tournament?.status ??
      registration.listingStatus ??
      TournamentListingStatus.open;

  bool get isCompleted => isTournamentTerminal(listingStatus);

  bool get isOngoing => !isCompleted;

  bool get isLive => listingStatus == TournamentListingStatus.live;

  bool get isEventDay {
    final start = startDate;
    if (start == null || isCompleted) return false;
    return isTournamentEventDay(startAt: start, endAt: endDate);
  }

  MyTournamentCardAccent get cardAccent {
    if (listingStatus == TournamentListingStatus.live || isEventDay) {
      return MyTournamentCardAccent.live;
    }
    if (listingStatus == TournamentListingStatus.open ||
        listingStatus == TournamentListingStatus.bracketsReady ||
        listingStatus == TournamentListingStatus.almostFull) {
      return MyTournamentCardAccent.enrolled;
    }
    return MyTournamentCardAccent.neutral;
  }

  Color get borderColor {
    return switch (cardAccent) {
      MyTournamentCardAccent.live => AppColors.live,
      MyTournamentCardAccent.enrolled => MyTournamentsTokens.gold,
      MyTournamentCardAccent.neutral => AppColors.surfaceRaised,
    };
  }

  String get statusChipLabel {
    if (registration.statusLabel.trim().isNotEmpty) {
      return registration.statusLabel;
    }
    return tournamentStatusLabel(listingStatus);
  }

  String get locationLine {
    final t = tournament;
    final parts = <String>[];
    if (t != null) {
      final loc = t.location.trim();
      final city = t.city.trim();
      if (loc.isNotEmpty) parts.add(loc);
      if (city.isNotEmpty) parts.add(city);
    }
    final date = (t?.dateLabel ?? registration.dateLabel).trim();
    if (date.isNotEmpty) parts.add(date);
    return parts.join(' · ');
  }

  String? get categoryLabel {
    final categoryId = registration.categoryId.trim();
    if (categoryId.isEmpty) return null;
    final offers = tournament?.categoryOffers ?? const [];
    for (final offer in offers) {
      if (offer.id == categoryId) return offer.name.trim();
    }
    return null;
  }

  String? get formatLabel {
    final format = tournament?.format;
    if (format == null) return 'Dupla';
    return tournamentFormatLabel(format);
  }

  DateTime? get startDate => tournament?.startDate ?? registration.startDate;

  DateTime? get endDate => registration.endDate;
}

/// Tokens visuais da tela Meus torneios (protótipo).
abstract final class MyTournamentsTokens {
  MyTournamentsTokens._();

  static const gold = Color(0xFFE5B82E);
}

/// Estado agregado da página.
class MyTournamentsPageState {
  const MyTournamentsPageState({
    required this.enrollments,
    required this.seasonYear,
  });

  final List<MyTournamentEnrollment> enrollments;
  final int seasonYear;

  List<MyTournamentEnrollment> get ongoing =>
      enrollments.where((e) => e.isOngoing).toList();

  List<MyTournamentEnrollment> get completed =>
      enrollments.where((e) => e.isCompleted).toList();

  int get ongoingCount => ongoing.length;

  int get completedCount => completed.length;

  MyTournamentEnrollment? get firstLive {
    for (final e in enrollments) {
      if (e.isLive) return e;
    }
    return null;
  }

  String get seasonLabel => 'TEMPORADA $seasonYear';
}

enum MyTournamentsTab { ongoing, completed }
