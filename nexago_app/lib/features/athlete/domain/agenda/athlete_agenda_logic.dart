import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../arenas/domain/arena_club_session.dart';
import '../../../arenas/domain/my_booking_item.dart';
import '../../../friendly_match/domain/friendly_match_models.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/text/safe_display_text.dart';
import '../../../tournaments/domain/my_tournaments_models.dart';
import '../../../tournaments/domain/tournament_discovery_models.dart';
import '../../../tournaments/domain/tournament_listing_status.dart';
import 'athlete_agenda_models.dart';
import 'class_agenda_entry.dart';

/// Cores por tipo de evento (cards, chips, pontos do seletor de data).
const athleteAgendaRentalAccent = Color(0xFF6EB5FF);
const athleteAgendaTournamentAccent = Color(0xFF9B8CFF);
const athleteAgendaChallengeAccent = Color(0xFFFF6B9D);
const athleteAgendaFriendlyMatchAccent = Color(0xFF57C785);
const athleteAgendaClubSessionAccent = Color(0xFFFFB74D);

/// Aulas/treinos: verde-limão, longe dos azuis do aluguel e do verde do amistoso.
const athleteAgendaClassSessionAccent = Color(0xFFD4E157);

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
  // Convidado (entrou pela lista `participantUids`): presença e pagamento são
  // do dono da reserva — nada de "Pagar" nem "confirmar presença" para ele.
  final viewer = currentAthleteUid?.trim() ?? '';
  final owner = item.ownerAthleteId?.trim() ?? '';
  final isGuest = viewer.isNotEmpty && owner.isNotEmpty && owner != viewer;
  final attendancePending = !isGuest &&
      !item.attendanceConfirmed &&
      item.attendanceStatus == 'pending';
  final partner = pickAgendaPartnerPreview(item, currentAthleteUid);
  final court = (item.courtName?.trim().isNotEmpty ?? false)
      ? item.courtName!.trim()
      : 'Locação de quadra';

  return AthleteAgendaItem(
    id: 'rental-${item.id}',
    kind: AthleteAgendaItemKind.rental,
    startsAt: start,
    endsAt: end,
    title: item.arenaName.trim().isNotEmpty ? item.arenaName.trim() : 'Arena',
    // A reserva não guarda esporte — afirmar "Vôlei de praia" mentia nas
    // quadras de beach tennis/tênis (multiesporte). Só a quadra; sem ela, um
    // genérico — o card reserva a linha do subtítulo mesmo vazia.
    subtitle: isGuest ? '$court · convidado' : court,
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
      needsPayment: !isGuest && agendaRentalNeedsPayment(item),
    ),
  );
}

/// Reservas do atleta + as de outros em que ele entrou por convite, sem
/// repetir (a própria reserva ganha se aparecer nas duas listas).
List<MyBookingItem> mergeOwnAndGuestBookings(
  List<MyBookingItem> own,
  List<MyBookingItem> asGuest,
) {
  if (asGuest.isEmpty) return own;
  final ids = {for (final b in own) b.id};
  return [
    ...own,
    for (final b in asGuest)
      if (!ids.contains(b.id)) b,
  ];
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
        ? '${parts.first} ${firstGraphemesUpper(parts.last, 1)}.'
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
  final rawStart = enrollment.startDate ??
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
    subtitle: [match.objective.label, match.location.displayLabel].join(' · '),
    statusLabel: awaitingReview ? 'AVALIAR' : 'CONFIRMADO',
    accentColor: athleteAgendaFriendlyMatchAccent,
    friendlyMatch: AthleteAgendaFriendlyMatchPayload(
      matchId: match.id,
      otherName: other,
    ),
  );
}

/// Converte uma participação em Clubinho (confirmada ou com PIX pendente)
/// em item da agenda. Retorna `null` sem horário de início utilizável.
AthleteAgendaItem? mapClubParticipationToAgendaItem(ClubParticipant p) {
  final start = p.startAt ?? parseBookingDateTime(p.date, p.startTime);
  if (start == null) return null;
  final end = parseBookingDateTime(p.date, p.endTime);
  final pending = p.isPendingPayment;

  return AthleteAgendaItem(
    id: 'club-${p.sessionId}',
    kind: AthleteAgendaItemKind.clubSession,
    startsAt: start,
    endsAt: end != null && end.isAfter(start) ? end : null,
    title: p.clubName,
    subtitle: '${p.arenaName} · Clubinho',
    statusLabel: pending ? 'PAGAR PIX' : 'NA LISTA',
    accentColor: athleteAgendaClubSessionAccent,
    clubSession: AthleteAgendaClubSessionPayload(
      sessionId: p.sessionId,
      arenaName: p.arenaName,
      clubName: p.clubName,
      pendingPayment: pending,
    ),
  );
}

/// Converte uma aula de `getMyClassAgenda` em item da agenda. Usa data e hora
/// de parede da arena (não o `startAt` UTC). `null` sem horário utilizável.
AthleteAgendaItem? mapClassEntryToAgendaItem(ClassAgendaEntry e) {
  final start = parseBookingDateTime(e.date, e.startTime);
  if (start == null) return null;
  final end = parseBookingDateTime(e.date, e.endTime);
  return AthleteAgendaItem(
    id: 'class-${e.sessionId}',
    kind: AthleteAgendaItemKind.classSession,
    startsAt: start,
    endsAt: end != null && end.isAfter(start) ? end : null,
    title: e.className,
    subtitle: classAgendaSubtitle(e),
    statusLabel: classAgendaStatusLabel(e),
    accentColor: athleteAgendaClassSessionAccent,
    classSession: AthleteAgendaClassPayload(
      sessionId: e.sessionId,
      arenaName: e.arenaName,
      className: e.className,
      teacherName: e.teacherName,
      courtName: e.courtName,
      isTeacher: e.isTeacher,
      kind: e.kind,
      myMark: e.myMark,
      studentCount: e.studentCount,
      canceled: e.isCanceled,
      entry: e,
    ),
  );
}

/// Experimental pedida num CT como aula da agenda. `status`: `pending`,
/// `confirmed` ou `declined`.
AthleteAgendaItem? mapCenterTrialToAgendaItem({
  required String centerId,
  required String centerName,
  required String sessionId,
  required String className,
  required String date,
  required String startTime,
  required String endTime,
  required String coachName,
  required String locationName,
  required String status,
  DateTime? now,
}) {
  final start = parseBookingDateTime(date, startTime);
  if (start == null) return null;
  final end = parseBookingDateTime(date, endTime);
  final endsAt = end != null && end.isAfter(start) ? end : null;
  final past = !(endsAt ?? start.add(const Duration(hours: 1)))
      .isAfter(now ?? DateTime.now());
  // Pendente que passou sem resposta não aconteceu.
  final canceled = status == 'declined' || (status == 'pending' && past);
  return AthleteAgendaItem(
    id: 'ct-trial-$centerId-$sessionId',
    kind: AthleteAgendaItemKind.classSession,
    startsAt: start,
    endsAt: endsAt,
    title: className,
    subtitle: [
      centerName,
      if (locationName.isNotEmpty) locationName,
      if (coachName.isNotEmpty) 'Prof. ${coachName.split(' ').first}',
    ].join(' · '),
    statusLabel: switch (status) {
      'declined' => 'RECUSADA',
      'pending' => past ? 'NÃO CONFIRMADA' : 'AGUARDANDO O CENTRO',
      _ => past ? 'REALIZADA' : 'EXPERIMENTAL',
    },
    accentColor: athleteAgendaClassSessionAccent,
    classSession: AthleteAgendaClassPayload(
      sessionId: sessionId,
      arenaName: centerName,
      className: className,
      teacherName: coachName,
      courtName: locationName,
      isTeacher: false,
      kind: 'trial',
      canceled: canceled,
      trialCenterId: centerId,
    ),
  );
}

String classAgendaSubtitle(ClassAgendaEntry e) {
  final parts = <String>[
    e.arenaName,
    if (e.courtName.isNotEmpty) e.courtName,
    if (e.isTeacher)
      '${e.studentCount ?? 0} aluno${(e.studentCount ?? 0) == 1 ? '' : 's'}'
    else if (e.teacherName.isNotEmpty)
      'Prof. ${e.teacherName.split(' ').first}',
  ];
  return parts.join(' · ');
}

String classAgendaStatusLabel(ClassAgendaEntry e) {
  if (e.isCanceled) return 'CANCELADA';
  if (e.isTeacher) return 'VOCÊ DÁ AULA';
  switch (e.myMark) {
    case 'present':
      return 'PRESENTE';
    case 'absent':
      return 'FALTA';
    case 'excused':
      return 'JUSTIFICADA';
  }
  return switch (e.kind) {
    'makeup' => 'REPOSIÇÃO',
    'trial' => 'EXPERIMENTAL',
    _ => 'AULA',
  };
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
  List<AthleteAgendaItem> clubSessions = const [],
  List<AthleteAgendaItem> classSessions = const [],
}) {
  final merged = [
    ...bookings,
    ...tournaments,
    ...challenges,
    ...friendlyMatches,
    ...clubSessions,
    ...classSessions,
  ];
  merged.sort((a, b) => a.startsAt.compareTo(b.startsAt));
  return merged;
}

AthleteAgendaFilterCounts countAgendaFilters(List<AthleteAgendaItem> items) {
  var rentals = 0;
  var trainings = 0;
  var tournaments = 0;
  var challenges = 0;
  for (final item in items) {
    switch (item.kind) {
      case AthleteAgendaItemKind.rental:
      case AthleteAgendaItemKind.clubSession:
        rentals++;
      case AthleteAgendaItemKind.classSession:
        trainings++;
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
    trainings: trainings,
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
    final end = item.endsAt ??
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

/// O item ocupa [day] na agenda? Torneio de vários dias ocupa do primeiro ao
/// último dia do evento: no domingo das finais ele continua em Próximos e
/// nos pontos do seletor de data. O resto ocupa só o dia em que começa,
/// mesmo que a reserva atravesse a meia-noite.
bool agendaItemOccursOn(AthleteAgendaItem item, DateTime day) {
  final target = dateOnly(day);
  final (first, last) = _agendaItemDaySpan(item);
  return !target.isBefore(first) && !target.isAfter(last);
}

/// Primeiro e último dia civil que o item ocupa na agenda.
(DateTime, DateTime) _agendaItemDaySpan(AthleteAgendaItem item) {
  final first = dateOnly(item.startsAt);
  final end = item.endsAt;
  if (item.kind != AthleteAgendaItemKind.tournament || end == null) {
    return (first, first);
  }
  final last = dateOnly(end);
  return (first, last.isBefore(first) ? first : last);
}

/// O item entra no filtro da fileira de chips? "Reservas" inclui o Clubinho;
/// "Desafios" são os jogos do Bora Jogar (desafio de ranking ainda não existe).
bool matchesAgendaFilter(AthleteAgendaItem item, AthleteAgendaFilter filter) =>
    switch (filter) {
      AthleteAgendaFilter.all => true,
      AthleteAgendaFilter.rentals =>
        item.kind == AthleteAgendaItemKind.rental ||
            item.kind == AthleteAgendaItemKind.clubSession,
      AthleteAgendaFilter.trainings =>
        item.kind == AthleteAgendaItemKind.classSession,
      AthleteAgendaFilter.tournaments =>
        item.kind == AthleteAgendaItemKind.tournament,
      AthleteAgendaFilter.challenges =>
        item.kind == AthleteAgendaItemKind.challenge ||
            item.kind == AthleteAgendaItemKind.friendlyMatch,
    };

/// Busca no título e no subtítulo, sem diferenciar maiúsculas.
bool matchesAgendaQuery(AthleteAgendaItem item, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return true;
  return item.title.toLowerCase().contains(q) ||
      item.subtitle.toLowerCase().contains(q);
}

AthleteAgendaDaySummary buildDaySummary(
  List<AthleteAgendaItem> items, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  var rentals = 0;
  var trainings = 0;
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
      case AthleteAgendaItemKind.clubSession:
        rentals++;
      case AthleteAgendaItemKind.classSession:
        trainings++;
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

  final total = rentals + trainings + tournaments + challenges;
  final nextMinutes = nextStart?.difference(clock).inMinutes;

  return AthleteAgendaDaySummary(
    totalToday: total,
    rentalsToday: rentals,
    trainingsToday: trainings,
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
    final dayItems =
        items.where((i) => agendaItemOccursOn(i, date)).toList(growable: false);
    var rentals = 0;
    var trainings = 0;
    var tournaments = 0;
    var challenges = 0;
    for (final item in dayItems) {
      switch (item.kind) {
        case AthleteAgendaItemKind.rental:
        case AthleteAgendaItemKind.clubSession:
          rentals++;
        case AthleteAgendaItemKind.classSession:
          trainings++;
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
      trainingDots: trainings,
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
  final suffix =
      phrase.isNotEmpty ? '$arenaLabel $phrase.' : '$arenaLabel hoje.';
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
