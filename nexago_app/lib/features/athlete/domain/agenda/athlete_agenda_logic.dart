import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../arenas/domain/my_booking_item.dart';
import '../../../friendly_match/domain/friendly_match_models.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../tournaments/domain/my_tournaments_models.dart';
import '../../../tournaments/domain/tournament_discovery_models.dart';
import '../../../tournaments/domain/tournament_listing_status.dart';
import 'athlete_agenda_models.dart';

/// Cores por tipo de evento (strip, cards, chips).
const athleteAgendaRentalAccent = Color(0xFF6EB5FF);
const athleteAgendaTournamentAccent = Color(0xFF9B8CFF);
const athleteAgendaChallengeAccent = Color(0xFFFF6B9D);
const athleteAgendaFriendlyMatchAccent = Color(0xFF57C785);

final _weekdayFmt = DateFormat('EEE', 'pt_BR');
final _sectionDateFmt = DateFormat('dd/MM', 'pt_BR');
final _headerDateFmt = DateFormat('d MMM', 'pt_BR');
final _monthYearFmt = DateFormat('MMMM yyyy', 'pt_BR');
final _monthTitleFmt = DateFormat('MMMM', 'pt_BR');

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

DateTime startOfWeek(DateTime day) {
  final d = dateOnly(day);
  final weekday = d.weekday;
  return d.subtract(Duration(days: weekday - 1));
}

DateTime startOfMonth(DateTime day) => DateTime(day.year, day.month);

DateTime endOfMonth(DateTime month) {
  final start = startOfMonth(month);
  return DateTime(start.year, start.month + 1, 0);
}

int daysInMonth(DateTime month) => endOfMonth(month).day;

DateTime? parseBookingDateTime(String dateRaw, String timeRaw) {
  final day = parseBookingDateOnly(dateRaw);
  if (day == null) return null;
  final parts = timeRaw.split(':');
  if (parts.isEmpty) return null;
  final hh = int.tryParse(parts[0]) ?? 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(day.year, day.month, day.day, hh, mm);
}

DateTime? parseBookingDateOnly(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;
  if (value.length >= 10) {
    final iso = DateTime.tryParse(value.substring(0, 10));
    if (iso != null) return iso;
  }
  final normalized = value.replaceAll('-', '/');
  final parts = normalized.split('/');
  if (parts.length >= 3) {
    final d = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    final y = int.tryParse(parts[2].substring(0, 4)) ?? 0;
    if (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return DateTime(y, m, d);
    }
  }
  return null;
}

AthleteAgendaBookingStage bookingStage(
  DateTime now,
  DateTime start,
  DateTime end,
  String rawStatus,
) {
  final status = rawStatus.trim().toLowerCase();
  if (status == 'canceled' || status == 'cancelled') {
    return AthleteAgendaBookingStage.canceled;
  }
  if (now.isAfter(start) && now.isBefore(end)) {
    return AthleteAgendaBookingStage.current;
  }
  if (now.isBefore(start)) return AthleteAgendaBookingStage.future;
  return AthleteAgendaBookingStage.past;
}

String minutesUntilLabel(DateTime now, DateTime start) {
  final diff = start.difference(now);
  final minutes = diff.inMinutes;
  if (minutes <= 59) return '$minutes min';
  final hours = minutes ~/ 60;
  final rem = minutes % 60;
  if (rem == 0) return '${hours}h';
  return '${hours}h ${rem}min';
}

String bookingStatusLabel(AthleteAgendaBookingStage stage, DateTime startAt) {
  return switch (stage) {
    AthleteAgendaBookingStage.current => 'Em andamento',
    AthleteAgendaBookingStage.future =>
      'Em ${minutesUntilLabel(DateTime.now(), startAt)}',
    AthleteAgendaBookingStage.past => 'Finalizado',
    AthleteAgendaBookingStage.canceled => 'Cancelado',
  };
}

Color bookingStageColor(AthleteAgendaBookingStage stage) {
  return switch (stage) {
    AthleteAgendaBookingStage.current => athleteAgendaRentalAccent,
    AthleteAgendaBookingStage.future => athleteAgendaRentalAccent,
    AthleteAgendaBookingStage.past => AppColors.onSurfaceMuted,
    AthleteAgendaBookingStage.canceled => AppColors.live,
  };
}

AthleteAgendaItem? mapBookingToAgendaItem(
  MyBookingItem item, {
  DateTime? now,
  String? currentAthleteUid,
}) {
  final clock = now ?? DateTime.now();
  var start = parseBookingDateTime(item.dateRaw, item.startTime);
  var end = parseBookingDateTime(item.dateRaw, item.endTime);
  if (start == null || end == null) return null;
  if (!end.isAfter(start)) {
    end = end.add(const Duration(days: 1));
  }

  final stage = bookingStage(clock, start, end, item.rawStatus);
  final attendancePending =
      !item.attendanceConfirmed && item.attendanceStatus == 'pending';
  final partner = pickAgendaPartnerPreview(item, currentAthleteUid);

  return AthleteAgendaItem(
    id: 'rental-${item.id}',
    kind: AthleteAgendaItemKind.rental,
    startsAt: start,
    endsAt: end,
    title: item.arenaName.trim().isNotEmpty ? item.arenaName.trim() : 'Arena',
    subtitle: [
      item.courtName?.trim(),
      'Vôlei de praia',
    ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
    statusLabel: bookingStatusLabel(stage, start),
    accentColor: bookingStageColor(stage),
    rental: AthleteAgendaRentalPayload(
      bookingId: item.id,
      arenaId: item.arenaId,
      arenaName: item.arenaName,
      courtName: item.courtName ?? 'Quadra',
      startAt: start,
      endAt: end,
      rawStatus: item.rawStatus,
      confirmedParticipants: item.confirmedParticipants,
      amountReais: item.amountReais,
      paymentType: item.paymentType,
      stage: stage,
      attendancePending: attendancePending,
      partnerName: partner?.displayName,
      partnerInitials: partner?.initials,
      needsPayment: agendaRentalNeedsPayment(item),
    ),
  );
}

String initialsFromDisplayName(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }
  return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
}

({String displayName, String initials})? pickAgendaPartnerPreview(
  MyBookingItem item,
  String? currentAthleteUid,
) {
  for (final athlete in item.confirmedAthletes) {
    final uid = athlete.userId?.trim();
    if (uid != null &&
        uid.isNotEmpty &&
        currentAthleteUid != null &&
        uid == currentAthleteUid) {
      continue;
    }
    final raw = athlete.displayName?.trim();
    if (raw == null || raw.isEmpty) continue;
    final parts = raw.split(RegExp(r'\s+'));
    final short = parts.length >= 2
        ? '${parts.first} ${parts.last[0]}.'
        : parts.first;
    return (displayName: short, initials: initialsFromDisplayName(raw));
  }
  return null;
}

bool agendaRentalNeedsPayment(MyBookingItem item) {
  final status = item.rawStatus.trim().toLowerCase();
  return status == 'pending_payment' || status == 'pending';
}

String? agendaRentalPaymentButtonLabel(double? amountReais) {
  if (amountReais == null || amountReais <= 0) return 'Pagar';
  final value = amountReais == amountReais.roundToDouble()
      ? amountReais.toInt()
      : amountReais;
  return 'Pagar R\$ $value';
}

String agendaTournamentSubtitle(MyTournamentEnrollment enrollment) {
  final parts = <String>[];
  final category = enrollment.categoryLabel?.trim();
  if (category != null && category.isNotEmpty) {
    parts.add(category);
  }
  final location = enrollment.locationLine.trim();
  if (location.isNotEmpty) {
    parts.add(location);
  }
  return parts.join(' · ');
}

DateTime agendaTournamentLocalEventStart(DateTime rawStart) {
  return tournamentEventDateLocal(rawStart);
}

DateTime agendaTournamentLocalEventEnd(DateTime rawStart, DateTime? endAt) {
  if (endAt != null) {
    return tournamentEffectiveEndAt(rawStart, endAt);
  }
  final day = tournamentEventDateLocal(rawStart);
  return DateTime(day.year, day.month, day.day, 23, 59, 59);
}

AthleteAgendaItem? mapTournamentEnrollmentToAgendaItem(
  MyTournamentEnrollment enrollment,
) {
  final rawStart =
      enrollment.startDate ??
      parseBookingDateOnly(enrollment.registration.dateLabel);
  if (rawStart == null) return null;

  final startsAt = agendaTournamentLocalEventStart(rawStart);
  final endsAt = agendaTournamentLocalEventEnd(rawStart, enrollment.endDate);
  final showAsLive = enrollment.isLive || enrollment.isEventDay;
  final isCompleted = enrollment.isCompleted;
  final accent = showAsLive
      ? AppColors.live
      : isCompleted
      ? AppColors.onSurfaceMuted
      : athleteAgendaTournamentAccent;
  final registrationId = enrollment.registration.registrationId.trim();
  if (registrationId.isEmpty) return null;

  return AthleteAgendaItem(
    id: 'tournament-$registrationId',
    kind: AthleteAgendaItemKind.tournament,
    startsAt: startsAt,
    endsAt: endsAt,
    title: enrollment.displayName,
    subtitle: agendaTournamentSubtitle(enrollment),
    statusLabel: showAsLive
        ? 'DIA DO EVENTO'
        : isCompleted
        ? 'FINALIZADO'
        : enrollment.statusChipLabel,
    accentColor: accent,
    tournament: AthleteAgendaTournamentPayload(
      tournamentId: enrollment.tournamentId,
      registrationId: registrationId,
      isLive: showAsLive,
      isCompleted: isCompleted,
      categoryId: enrollment.registration.categoryId,
      categoryLabel: enrollment.categoryLabel,
    ),
  );
}

/// Converte um jogo do Bora Jogar (confirmado ou aguardando avaliação) em
/// item da agenda.
AthleteAgendaItem mapFriendlyMatchToAgendaItem(
  FriendlyMatch match, {
  required String currentUid,
}) {
  final other = match.otherName(currentUid);
  final awaitingReview = match.status == FriendlyMatchStatus.completed;
  return AthleteAgendaItem(
    id: 'friendly-${match.id}',
    kind: AthleteAgendaItemKind.friendlyMatch,
    startsAt: match.scheduledAt,
    title: 'Jogo com $other',
    subtitle:
        [match.objective.label, match.location.displayLabel].join(' · '),
    statusLabel: awaitingReview ? 'AVALIAR' : 'CONFIRMADO',
    accentColor: athleteAgendaFriendlyMatchAccent,
    friendlyMatch: AthleteAgendaFriendlyMatchPayload(
      matchId: match.id,
      otherName: other,
    ),
  );
}

bool isAgendaTournamentAllDayStart(DateTime startsAt) =>
    startsAt.hour == 0 && startsAt.minute == 0;

String formatAgendaTimelineTimeLabel(AthleteAgendaItem item) {
  if (item.kind == AthleteAgendaItemKind.tournament &&
      isAgendaTournamentAllDayStart(item.startsAt)) {
    return 'Dia todo';
  }
  return DateFormat('HH:mm', 'pt_BR').format(item.startsAt);
}

List<AthleteAgendaItem> mergeAgendaItems({
  required List<AthleteAgendaItem> bookings,
  required List<AthleteAgendaItem> tournaments,
  required List<AthleteAgendaItem> challenges,
  List<AthleteAgendaItem> friendlyMatches = const [],
}) {
  final merged = [
    ...bookings,
    ...tournaments,
    ...challenges,
    ...friendlyMatches,
  ];
  merged.sort((a, b) => a.startsAt.compareTo(b.startsAt));
  return merged;
}

AthleteAgendaFilterCounts countAgendaFilters(List<AthleteAgendaItem> items) {
  var rentals = 0;
  var tournaments = 0;
  var challenges = 0;
  for (final item in items) {
    switch (item.kind) {
      case AthleteAgendaItemKind.rental:
        rentals++;
      case AthleteAgendaItemKind.tournament:
        tournaments++;
      case AthleteAgendaItemKind.challenge:
      case AthleteAgendaItemKind.friendlyMatch:
        challenges++;
    }
  }
  return AthleteAgendaFilterCounts(
    all: items.length,
    rentals: rentals,
    tournaments: tournaments,
    challenges: challenges,
  );
}

bool isAgendaItemPast(AthleteAgendaItem item, {DateTime? now}) {
  final clock = now ?? DateTime.now();
  final rental = item.rental;
  if (rental != null) {
    final stage = bookingStage(
      clock,
      rental.startAt,
      rental.endAt,
      rental.rawStatus,
    );
    return stage == AthleteAgendaBookingStage.past ||
        stage == AthleteAgendaBookingStage.canceled;
  }
  if (item.tournament != null) {
    if (item.tournament!.isCompleted) return true;
    if (clock.isBefore(item.startsAt)) return false;
    final end =
        item.endsAt ??
        DateTime(
          item.startsAt.year,
          item.startsAt.month,
          item.startsAt.day,
          23,
          59,
          59,
        );
    return clock.isAfter(end);
  }
  if (clock.isBefore(item.startsAt)) return false;
  final end = item.endsAt ?? item.startsAt.add(const Duration(hours: 2));
  return !clock.isBefore(end);
}

AthleteAgendaTimeTabCounts countAgendaTimeTabs(
  List<AthleteAgendaItem> items, {
  DateTime? now,
}) {
  var upcoming = 0;
  var past = 0;
  for (final item in items) {
    if (isAgendaItemPast(item, now: now)) {
      past++;
    } else {
      upcoming++;
    }
  }
  return AthleteAgendaTimeTabCounts(upcoming: upcoming, past: past);
}

List<AthleteAgendaItem> filterAgendaItems({
  required List<AthleteAgendaItem> items,
  required AthleteAgendaFilter filter,
  required AthleteAgendaViewMode viewMode,
  required DateTime selectedDay,
  required DateTime visibleMonth,
  AthleteAgendaTimeTab timeTab = AthleteAgendaTimeTab.upcoming,
  String query = '',
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  Iterable<AthleteAgendaItem> filtered = items;

  // Dia específico em foco (viewMode == day, fora da aba "Passados"): mostra
  // os jogos do dia mesmo que já tenham acontecido — só reserva cancelada
  // continua escondida. A exclusão de itens passados da aba "Próximos" só
  // faz sentido pra visão geral (mês), não pro dia que o atleta escolheu ver.
  final dayInFocus =
      viewMode == AthleteAgendaViewMode.day &&
      timeTab == AthleteAgendaTimeTab.upcoming;

  if (dayInFocus) {
    filtered = filtered.where((i) => !i.isCanceled);
  } else {
    filtered = switch (timeTab) {
      AthleteAgendaTimeTab.upcoming => filtered.where(
        (i) => !isAgendaItemPast(i, now: clock),
      ),
      AthleteAgendaTimeTab.past => filtered.where(
        (i) => isAgendaItemPast(i, now: clock),
      ),
    };
  }

  filtered = switch (filter) {
    AthleteAgendaFilter.all => filtered,
    AthleteAgendaFilter.rentals => filtered.where(
      (i) => i.kind == AthleteAgendaItemKind.rental,
    ),
    AthleteAgendaFilter.tournaments => filtered.where(
      (i) => i.kind == AthleteAgendaItemKind.tournament,
    ),
    AthleteAgendaFilter.challenges => filtered.where(
      (i) =>
          i.kind == AthleteAgendaItemKind.challenge ||
          i.kind == AthleteAgendaItemKind.friendlyMatch,
    ),
  };

  if (viewMode == AthleteAgendaViewMode.month) {
    final monthStart = startOfMonth(visibleMonth);
    final monthEnd = endOfMonth(visibleMonth);
    filtered = filtered.where((i) {
      final d = dateOnly(i.startsAt);
      return !d.isBefore(monthStart) && !d.isAfter(monthEnd);
    });
  } else if (timeTab != AthleteAgendaTimeTab.past) {
    filtered = filtered.where((i) => isSameDay(i.startsAt, selectedDay));
  }

  final q = query.trim().toLowerCase();
  if (q.isNotEmpty) {
    filtered = filtered.where(
      (i) =>
          i.title.toLowerCase().contains(q) ||
          i.subtitle.toLowerCase().contains(q),
    );
  }

  final copy = filtered.toList()
    ..sort(
      (a, b) => timeTab == AthleteAgendaTimeTab.past
          ? b.startsAt.compareTo(a.startsAt)
          : a.startsAt.compareTo(b.startsAt),
    );
  return copy;
}

AthleteAgendaDaySummary buildDaySummary(
  List<AthleteAgendaItem> items, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  var rentals = 0;
  var tournaments = 0;
  var challenges = 0;
  DateTime? nextStart;

  for (final item in items) {
    if (!isSameDay(item.startsAt, clock)) continue;
    final stage = item.rental?.stage;
    if (stage == AthleteAgendaBookingStage.canceled ||
        stage == AthleteAgendaBookingStage.past) {
      continue;
    }
    switch (item.kind) {
      case AthleteAgendaItemKind.rental:
        rentals++;
      case AthleteAgendaItemKind.tournament:
        tournaments++;
      case AthleteAgendaItemKind.challenge:
      case AthleteAgendaItemKind.friendlyMatch:
        challenges++;
    }
    if (item.startsAt.isAfter(clock)) {
      if (nextStart == null || item.startsAt.isBefore(nextStart)) {
        nextStart = item.startsAt;
      }
    }
  }

  final total = rentals + tournaments + challenges;
  final nextMinutes = nextStart?.difference(clock).inMinutes;

  return AthleteAgendaDaySummary(
    totalToday: total,
    rentalsToday: rentals,
    tournamentsToday: tournaments,
    challengesToday: challenges,
    nextInMinutes: nextMinutes != null && nextMinutes >= 0 ? nextMinutes : null,
  );
}

List<AthleteAgendaMonthDay> buildAgendaMonthDayMarkers({
  required DateTime visibleMonth,
  required DateTime selectedDay,
  required List<AthleteAgendaItem> items,
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  final today = dateOnly(clock);
  final monthStart = startOfMonth(visibleMonth);
  final totalDays = daysInMonth(visibleMonth);
  final anchor = dateOnly(selectedDay);

  return List.generate(totalDays, (index) {
    final date = DateTime(monthStart.year, monthStart.month, index + 1);
    final dayItems = items
        .where((i) => isSameDay(i.startsAt, date))
        .toList(growable: false);
    var rentals = 0;
    var tournaments = 0;
    var challenges = 0;
    for (final item in dayItems) {
      switch (item.kind) {
        case AthleteAgendaItemKind.rental:
          rentals++;
        case AthleteAgendaItemKind.tournament:
          tournaments++;
        case AthleteAgendaItemKind.challenge:
        case AthleteAgendaItemKind.friendlyMatch:
          challenges++;
      }
    }
    return AthleteAgendaMonthDay(
      date: date,
      dayNumber: date.day,
      isToday: isSameDay(date, today),
      isSelected: isSameDay(date, anchor),
      rentalDots: rentals,
      tournamentDots: tournaments,
      challengeDots: challenges,
      eventCount: dayItems.length,
    );
  });
}

int countFreeDaysInMonth(
  DateTime visibleMonth,
  List<AthleteAgendaItem> items, {
  DateTime? now,
  AthleteAgendaTimeTab timeTab = AthleteAgendaTimeTab.upcoming,
}) {
  final monthStart = startOfMonth(visibleMonth);
  final totalDays = daysInMonth(visibleMonth);
  final today = dateOnly(now ?? DateTime.now());
  var free = 0;

  for (var d = 1; d <= totalDays; d++) {
    final date = DateTime(monthStart.year, monthStart.month, d);
    if (timeTab == AthleteAgendaTimeTab.upcoming && date.isBefore(today)) {
      continue;
    }
    final hasEvents = items.any((i) => isSameDay(i.startsAt, date));
    if (!hasEvents) free++;
  }
  return free;
}

Color dominantAgendaKindColor(List<AthleteAgendaItem> items) {
  var rentals = 0;
  var tournaments = 0;
  var challenges = 0;
  for (final item in items) {
    switch (item.kind) {
      case AthleteAgendaItemKind.rental:
        rentals++;
      case AthleteAgendaItemKind.tournament:
        tournaments++;
      case AthleteAgendaItemKind.challenge:
      case AthleteAgendaItemKind.friendlyMatch:
        challenges++;
    }
  }
  if (tournaments >= rentals && tournaments >= challenges) {
    return athleteAgendaTournamentAccent;
  }
  if (rentals >= challenges) return athleteAgendaRentalAccent;
  return athleteAgendaChallengeAccent;
}

String formatMonthSummaryDayTitle(DateTime day) {
  final weekday = _sectionWeekdayShort(day);
  final cap = weekday.isEmpty
      ? weekday
      : '${weekday[0].toUpperCase()}${weekday.substring(1)}';
  return '$cap ${day.day}';
}

String buildMonthSummaryDescription(List<AthleteAgendaItem> items) {
  if (items.isEmpty) return '';
  final parts = <String>[];
  for (final item in items.take(2)) {
    final label = switch (item.kind) {
      AthleteAgendaItemKind.rental => 'Aluguel',
      AthleteAgendaItemKind.tournament => 'Torneio',
      AthleteAgendaItemKind.challenge => 'Desafio',
      AthleteAgendaItemKind.friendlyMatch => 'Jogo',
    };
    parts.add('$label · ${item.title}');
  }
  return parts.join(' · ');
}

List<AthleteAgendaMonthSummaryRow> buildAgendaMonthSummaryRows({
  required DateTime visibleMonth,
  required List<AthleteAgendaItem> items,
  DateTime? now,
  AthleteAgendaTimeTab timeTab = AthleteAgendaTimeTab.upcoming,
  bool reverseDays = false,
}) {
  final monthStart = startOfMonth(visibleMonth);
  final totalDays = daysInMonth(visibleMonth);
  final today = dateOnly(now ?? DateTime.now());
  final rows = <AthleteAgendaMonthSummaryRow>[];

  for (var d = 1; d <= totalDays; d++) {
    final date = DateTime(monthStart.year, monthStart.month, d);
    if (timeTab == AthleteAgendaTimeTab.upcoming && date.isBefore(today)) {
      continue;
    }
    final dayItems =
        items.where((i) => isSameDay(i.startsAt, date)).toList(growable: false)
          ..sort((a, b) => a.startsAt.compareTo(b.startsAt));

    if (dayItems.isEmpty) {
      rows.add(
        AthleteAgendaMonthSummaryRow(
          date: date,
          title: formatMonthSummaryDayTitle(date),
          subtitle: 'Livre',
          description: '',
          accentColor: AppColors.onSurfaceMuted,
          isFree: true,
          eventCount: 0,
        ),
      );
      continue;
    }

    final count = dayItems.length;
    rows.add(
      AthleteAgendaMonthSummaryRow(
        date: date,
        title: formatMonthSummaryDayTitle(date),
        subtitle: count == 1 ? '1 jogo' : '$count jogos',
        description: buildMonthSummaryDescription(dayItems),
        accentColor: dominantAgendaKindColor(dayItems),
        isFree: false,
        eventCount: count,
      ),
    );
  }

  if (reverseDays) {
    rows.sort((a, b) => b.date.compareTo(a.date));
  }
  return rows;
}

/// Itens na janela do strip (7 dias), só filtro temporal — sem dia selecionado.
List<AthleteAgendaItem> filterAgendaItemsForWeekStrip({
  required List<AthleteAgendaItem> items,
  required DateTime selectedDay,
  AthleteAgendaTimeTab timeTab = AthleteAgendaTimeTab.upcoming,
  DateTime? now,
  int dayCount = 7,
  int daysBeforeSelected = 2,
}) {
  final clock = now ?? DateTime.now();
  final anchor = dateOnly(selectedDay);
  final rangeStart = anchor.subtract(Duration(days: daysBeforeSelected));
  final rangeEnd = rangeStart.add(Duration(days: dayCount - 1));

  Iterable<AthleteAgendaItem> filtered = items;
  // A "aba Próximos" só esconde reservas canceladas aqui — os dots do strip
  // (inclusive de hoje) precisam refletir jogos que já aconteceram, senão o
  // dia mostra 0 eventos no strip mas a lista abaixo dele mostra os jogos.
  filtered = switch (timeTab) {
    AthleteAgendaTimeTab.upcoming => filtered.where((i) => !i.isCanceled),
    AthleteAgendaTimeTab.past => filtered.where(
      (i) => isAgendaItemPast(i, now: clock),
    ),
  };
  filtered = filtered.where((i) {
    final d = dateOnly(i.startsAt);
    return !d.isBefore(rangeStart) && !d.isAfter(rangeEnd);
  });
  return filtered.toList();
}

List<AthleteAgendaWeekDay> buildWeekDayStrip({
  required DateTime selectedDay,
  required List<AthleteAgendaItem> items,
  DateTime? now,
  int dayCount = 7,
  int daysBeforeSelected = 2,
}) {
  final clock = now ?? DateTime.now();
  final today = dateOnly(clock);
  final anchor = dateOnly(selectedDay);
  final start = anchor.subtract(Duration(days: daysBeforeSelected));

  return List.generate(dayCount, (index) {
    final date = start.add(Duration(days: index));
    final dayItems = items
        .where((i) => isSameDay(i.startsAt, date))
        .toList(growable: false);
    var rentals = 0;
    var tournaments = 0;
    var challenges = 0;
    for (final item in dayItems) {
      switch (item.kind) {
        case AthleteAgendaItemKind.rental:
          rentals++;
        case AthleteAgendaItemKind.tournament:
          tournaments++;
        case AthleteAgendaItemKind.challenge:
        case AthleteAgendaItemKind.friendlyMatch:
          challenges++;
      }
    }
    return AthleteAgendaWeekDay(
      date: date,
      weekdayLabel: _weekdayFmt.format(date).replaceAll('.', '').toUpperCase(),
      dayNumber: date.day,
      isToday: isSameDay(date, today),
      isPast: date.isBefore(today),
      isSelected: isSameDay(date, anchor),
      rentalDots: rentals,
      tournamentDots: tournaments,
      challengeDots: challenges,
      eventCount: dayItems.length,
    );
  });
}

String formatAgendaHeaderEyebrow(DateTime day) {
  final weekday = _weekdayFmt.format(day).replaceAll('.', '').toUpperCase();
  final date = _headerDateFmt.format(day).replaceAll('.', '').toUpperCase();
  return '$weekday · $date · GMT-3';
}

String formatAgendaMonthEyebrow(DateTime visibleMonth) {
  final label = _monthYearFmt
      .format(startOfMonth(visibleMonth))
      .replaceAll('.', '')
      .toUpperCase();
  return '$label · GMT-3';
}

String formatAgendaMonthTitle() => 'Seu mês';

String formatAgendaMonthGridTitle(DateTime visibleMonth) {
  final raw = _monthTitleFmt.format(startOfMonth(visibleMonth));
  if (raw.isEmpty) return raw;
  return '${raw[0].toUpperCase()}${raw.substring(1)}';
}

String formatAgendaEmptyDayLabel(DateTime selectedDay, {DateTime? now}) {
  final clock = now ?? DateTime.now();
  if (isSameDay(dateOnly(selectedDay), dateOnly(clock))) return 'HOJE';
  return _weekdayFmt.format(selectedDay).replaceAll('.', '').toUpperCase();
}

AgendaEmptyHeroDescriptionParts formatAgendaEmptyHeroDescription(
  int nearbyCount,
  String proximityPhrase,
) {
  const lead = 'Chame a galera pra jogar. ';
  if (nearbyCount <= 0) {
    return const AgendaEmptyHeroDescriptionParts(
      lead: lead,
      suffix: 'Encontre uma arena e marque sua partida.',
    );
  }
  final phrase = proximityPhrase.trim();
  final arenaLabel = nearbyCount == 1 ? ' arena livre' : ' arenas livres';
  final suffix = phrase.isNotEmpty
      ? '$arenaLabel $phrase.'
      : '$arenaLabel hoje.';
  return AgendaEmptyHeroDescriptionParts(
    lead: lead,
    nearbyCount: nearbyCount,
    suffix: suffix,
  );
}

int countDropInsNeedingPlayers(List<AgendaDropInPreview> items) {
  return items.where((i) => i.spotsNeeded > 0).length;
}

String formatAgendaDropInsSectionTitle(DateTime selectedDay, {DateTime? now}) {
  final clock = now ?? DateTime.now();
  if (isSameDay(dateOnly(selectedDay), dateOnly(clock))) {
    return 'Drop-ins abertos hoje';
  }
  final dateLabel = _sectionDateFmt.format(dateOnly(selectedDay));
  return 'Drop-ins abertos · $dateLabel';
}

String _sectionWeekdayShort(DateTime day) =>
    _weekdayFmt.format(day).replaceAll('.', '').toLowerCase();

String formatSectionTitle(DateTime day, {DateTime? now}) {
  final clock = now ?? DateTime.now();
  final today = dateOnly(clock);
  final tomorrow = today.add(const Duration(days: 1));
  final d = dateOnly(day);
  final dateLabel = _sectionDateFmt.format(d);
  final weekday = _sectionWeekdayShort(d);
  if (isSameDay(d, today)) return 'Hoje · $weekday $dateLabel';
  if (isSameDay(d, tomorrow)) return 'Amanhã · $weekday $dateLabel';
  return '$weekday · $dateLabel';
}

String formatSectionSubtitle(
  List<AthleteAgendaItem> items, {
  DateTime? now,
  bool pastOnly = false,
}) {
  if (pastOnly) {
    final count = items.length;
    return count <= 0 ? 'SEM JOGOS' : '$count JOGOS';
  }
  final clock = now ?? DateTime.now();
  final active = items.where((i) {
    final stage = i.rental?.stage;
    return stage != AthleteAgendaBookingStage.canceled &&
        stage != AthleteAgendaBookingStage.past;
  }).length;
  if (active <= 0) return 'SEM JOGOS';
  final next = items.where((i) => i.startsAt.isAfter(clock)).fold<DateTime?>(
    null,
    (prev, curr) {
      if (prev == null || curr.startsAt.isBefore(prev)) return curr.startsAt;
      return prev;
    },
  );
  if (next == null) return '$active JOGOS';
  final mins = next.difference(clock).inMinutes;
  if (mins >= 0 && mins <= 180) {
    return '$active JOGOS · PRÓXIMO EM $mins MIN';
  }
  return '$active JOGOS';
}

List<AthleteAgendaDaySection> groupItemsByDaySection(
  List<AthleteAgendaItem> items, {
  DateTime? now,
  bool reverseDays = false,
}) {
  if (items.isEmpty) return const [];
  final byDay = <DateTime, List<AthleteAgendaItem>>{};
  for (final item in items) {
    final key = dateOnly(item.startsAt);
    byDay.putIfAbsent(key, () => []).add(item);
  }
  final keys = byDay.keys.toList()..sort();
  if (reverseDays) {
    keys.sort((a, b) => b.compareTo(a));
  }
  return keys
      .map(
        (day) => AthleteAgendaDaySection(
          date: day,
          title: formatSectionTitle(day, now: now),
          subtitle: formatSectionSubtitle(
            byDay[day]!,
            now: now,
            pastOnly: reverseDays,
          ),
          items: byDay[day]!
            ..sort(
              (a, b) => reverseDays
                  ? b.startsAt.compareTo(a.startsAt)
                  : a.startsAt.compareTo(b.startsAt),
            ),
        ),
      )
      .toList(growable: false);
}

List<AthleteAgendaTimelineRow> buildAgendaTimelineRows({
  required List<AthleteAgendaItem> items,
}) {
  if (items.isEmpty) return const [];
  return [
    for (var i = 0; i < items.length; i++)
      AthleteAgendaTimelineRow.item(
        items[i],
        isFirst: i == 0,
        isLast: i == items.length - 1,
      ),
  ];
}

AthleteAgendaItem? findNextAgendaItem(
  List<AthleteAgendaItem> items, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  AthleteAgendaItem? next;
  for (final item in items) {
    if (!item.startsAt.isAfter(clock)) continue;
    if (next == null || item.startsAt.isBefore(next.startsAt)) {
      next = item;
    }
  }
  return next;
}

bool isTournamentOngoingForAgenda(TournamentListingStatus status) {
  return !isTournamentTerminal(status);
}
