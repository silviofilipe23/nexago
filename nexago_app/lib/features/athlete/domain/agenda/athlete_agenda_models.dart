import 'package:flutter/material.dart';

enum AthleteAgendaItemKind { rental, tournament, challenge, friendlyMatch }

enum AthleteAgendaFilter { all, rentals, tournaments, challenges }

enum AthleteAgendaViewMode { day, month }

enum AthleteAgendaTimeTab { upcoming, past }

enum AthleteAgendaBookingStage { past, current, future, canceled }

enum AthleteAgendaNeedsYouKind {
  rankingChallenge,
  partnerInvite,
  bookingConfirmation,
}

/// Payload tipado para navegação a partir de um item da agenda.
class AthleteAgendaRentalPayload {
  const AthleteAgendaRentalPayload({
    required this.bookingId,
    this.arenaId,
    required this.arenaName,
    required this.courtName,
    required this.startAt,
    required this.endAt,
    required this.rawStatus,
    required this.confirmedParticipants,
    this.amountReais,
    this.paymentType,
    required this.stage,
    this.attendancePending = false,
    this.partnerName,
    this.partnerInitials,
    this.needsPayment = false,
  });

  final String bookingId;
  final String? arenaId;
  final String arenaName;
  final String courtName;
  final DateTime startAt;
  final DateTime endAt;
  final String rawStatus;
  final int confirmedParticipants;
  final double? amountReais;
  final String? paymentType;
  final AthleteAgendaBookingStage stage;
  final bool attendancePending;
  final String? partnerName;
  final String? partnerInitials;
  final bool needsPayment;
}

class AthleteAgendaTournamentPayload {
  const AthleteAgendaTournamentPayload({
    required this.tournamentId,
    required this.registrationId,
    required this.isLive,
    this.isCompleted = false,
    this.categoryId = '',
    this.categoryLabel,
  });

  final String tournamentId;
  final String registrationId;
  final bool isLive;
  final bool isCompleted;
  final String categoryId;
  final String? categoryLabel;
}

class AthleteAgendaChallengePayload {
  const AthleteAgendaChallengePayload({required this.challengeId});

  final String challengeId;
}

/// Jogo avulso do Bora Jogar (confirmado ou aguardando avaliação).
class AthleteAgendaFriendlyMatchPayload {
  const AthleteAgendaFriendlyMatchPayload({
    required this.matchId,
    required this.otherName,
  });

  final String matchId;
  final String otherName;
}

class AthleteAgendaItem {
  const AthleteAgendaItem({
    required this.id,
    required this.kind,
    required this.startsAt,
    this.endsAt,
    required this.title,
    required this.subtitle,
    required this.statusLabel,
    required this.accentColor,
    this.rental,
    this.tournament,
    this.challenge,
    this.friendlyMatch,
    this.isMock = false,
  });

  final String id;
  final AthleteAgendaItemKind kind;
  final DateTime startsAt;
  final DateTime? endsAt;
  final String title;
  final String subtitle;
  final String statusLabel;
  final Color accentColor;
  final AthleteAgendaRentalPayload? rental;
  final AthleteAgendaTournamentPayload? tournament;
  final AthleteAgendaChallengePayload? challenge;
  final AthleteAgendaFriendlyMatchPayload? friendlyMatch;
  final bool isMock;

  bool get isCanceled =>
      rental?.stage == AthleteAgendaBookingStage.canceled;
}

class AthleteAgendaDaySummary {
  const AthleteAgendaDaySummary({
    required this.totalToday,
    required this.rentalsToday,
    required this.tournamentsToday,
    required this.challengesToday,
    this.nextInMinutes,
  });

  final int totalToday;
  final int rentalsToday;
  final int tournamentsToday;
  final int challengesToday;
  final int? nextInMinutes;

  String get headline {
    if (totalToday <= 0) return 'Nenhum jogo hoje';
    final next = nextInMinutes;
    if (next != null && next >= 0) {
      return '$totalToday jogos hoje · próximo em $next min';
    }
    return '$totalToday jogos hoje';
  }
}

class AthleteAgendaWeekDay {
  const AthleteAgendaWeekDay({
    required this.date,
    required this.weekdayLabel,
    required this.dayNumber,
    required this.isToday,
    required this.isPast,
    required this.isSelected,
    required this.rentalDots,
    required this.tournamentDots,
    required this.challengeDots,
    required this.eventCount,
  });

  final DateTime date;
  final String weekdayLabel;
  final int dayNumber;
  final bool isToday;
  final bool isPast;
  final bool isSelected;
  final int rentalDots;
  final int tournamentDots;
  final int challengeDots;
  /// Total de eventos no dia.
  final int eventCount;

  int get totalDots => rentalDots + tournamentDots + challengeDots;
}

class AthleteAgendaMonthDay {
  const AthleteAgendaMonthDay({
    required this.date,
    required this.dayNumber,
    required this.isToday,
    required this.isSelected,
    required this.rentalDots,
    required this.tournamentDots,
    required this.challengeDots,
    required this.eventCount,
  });

  final DateTime date;
  final int dayNumber;
  final bool isToday;
  final bool isSelected;
  final int rentalDots;
  final int tournamentDots;
  final int challengeDots;
  final int eventCount;
}

class AthleteAgendaMonthSummaryRow {
  const AthleteAgendaMonthSummaryRow({
    required this.date,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.accentColor,
    required this.isFree,
    required this.eventCount,
  });

  final DateTime date;
  final String title;
  final String subtitle;
  final String description;
  final Color accentColor;
  final bool isFree;
  final int eventCount;
}

class AthleteAgendaDaySection {
  const AthleteAgendaDaySection({
    required this.date,
    required this.title,
    required this.subtitle,
    required this.items,
  });

  final DateTime date;
  final String title;
  final String subtitle;
  final List<AthleteAgendaItem> items;
}

class AthleteAgendaNeedsYouItem {
  const AthleteAgendaNeedsYouItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.meta,
    required this.statusLabel,
    this.inviteId,
    this.bookingId,
    this.isMock = false,
  });

  final String id;
  final AthleteAgendaNeedsYouKind kind;
  final String title;
  final String subtitle;
  final String meta;
  final String statusLabel;
  final String? inviteId;
  final String? bookingId;
  final bool isMock;
}

class AthleteAgendaTimelineRow {
  const AthleteAgendaTimelineRow.item(
    this.item, {
    required this.isFirst,
    required this.isLast,
  });

  final AthleteAgendaItem item;
  final bool isFirst;
  final bool isLast;
}

class AthleteAgendaFilterCounts {
  const AthleteAgendaFilterCounts({
    required this.all,
    required this.rentals,
    required this.tournaments,
    required this.challenges,
  });

  final int all;
  final int rentals;
  final int tournaments;
  final int challenges;
}

class AthleteAgendaTimeTabCounts {
  const AthleteAgendaTimeTabCounts({
    required this.upcoming,
    required this.past,
  });

  final int upcoming;
  final int past;
}

/// Preview mock de drop-in para empty state D3.
class AgendaDropInPreview {
  const AgendaDropInPreview({
    required this.id,
    required this.startHour,
    required this.startMinute,
    required this.arenaLine,
    required this.kmDistance,
    required this.spotsNeeded,
    required this.avatarCount,
  });

  final String id;
  final int startHour;
  final int startMinute;
  final String arenaLine;
  final double kmDistance;
  final int spotsNeeded;
  final int avatarCount;

  String get timeLabel {
    final h = startHour.toString().padLeft(2, '0');
    final m = startMinute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  String get kmLabel => '${kmDistance.toStringAsFixed(1)} km';
}

class AgendaEmptyHeroDescriptionParts {
  const AgendaEmptyHeroDescriptionParts({
    required this.lead,
    this.nearbyCount,
    required this.suffix,
  });

  final String lead;
  final int? nearbyCount;
  final String suffix;
}
