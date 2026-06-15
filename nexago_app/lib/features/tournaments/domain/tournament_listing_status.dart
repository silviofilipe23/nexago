import 'tournament_discovery_models.dart';

/// Normaliza `status` / `listingStatus` do Firestore (PascalCase, PT, etc.).
String normalizeListingStatusRaw(String raw) {
  return raw.trim().toLowerCase().replaceAll('_', ' ');
}

/// Mapeia valor bruto do documento → status de listagem do app.
TournamentListingStatus? listingStatusFromRaw(String? listingStatusRaw) {
  final raw = listingStatusRaw?.trim();
  if (raw == null || raw.isEmpty) return null;

  final n = normalizeListingStatusRaw(raw);
  return switch (n) {
    'draft' || 'programado' => TournamentListingStatus.scheduled,
    'closed' ||
    'inscrições encerradas' ||
    'inscricoes encerradas' =>
      TournamentListingStatus.bracketsReady,
    'cancelled' || 'canceled' || 'cancelado' =>
      TournamentListingStatus.ended,
    'open' ||
    'inscrições abertas' ||
    'inscricoes abertas' =>
      TournamentListingStatus.open,
    'brackets ready' ||
    'bracketsready' ||
    'chaves prontas' =>
      TournamentListingStatus.bracketsReady,
    'almost full' ||
    'almostfull' ||
    'quase_lotado' ||
    'quase lotado' =>
      TournamentListingStatus.almostFull,
    'in progress' ||
    'inprogress' ||
    'em andamento' ||
    'live' ||
    'ao_vivo' ||
    'ao vivo' =>
      TournamentListingStatus.live,
    'completed' || 'concluido' || 'concluído' =>
      TournamentListingStatus.completed,
    'ended' || 'encerrado' || 'finalizado' => TournamentListingStatus.ended,
    _ => null,
  };
}

bool isTournamentTerminal(TournamentListingStatus status) {
  return status == TournamentListingStatus.completed ||
      status == TournamentListingStatus.ended;
}

bool canRegisterForTournament(TournamentListingStatus status) {
  return status == TournamentListingStatus.open ||
      status == TournamentListingStatus.almostFull;
}

/// `listingStatus` bruto indica inscrições encerradas pelo organizador.
bool isRegistrationListingClosed(String? listingStatusRaw) {
  final n = normalizeListingStatusRaw(listingStatusRaw ?? '');
  return n == 'closed' ||
      n == 'inscrições encerradas' ||
      n == 'inscricoes encerradas';
}

/// Torneio/liga visível no catálogo público (Competir).
bool isPubliclyListedTournament(String? listingStatusRaw) {
  final raw = listingStatusRaw?.trim();
  if (raw == null || raw.isEmpty) return true;
  final n = normalizeListingStatusRaw(raw);
  if (n == 'draft' || n == 'programado') return false;
  if (n == 'cancelled' || n == 'canceled' || n == 'cancelado') return false;
  return true;
}

/// Data civil do evento (sem hora) para comparação de dia.
///
/// Timestamps UTC à meia-noite costumam representar o dia do evento no
/// calendário (ex.: `2026-06-09T00:00:00Z` = 9 de junho), sem deslocar
/// para o dia anterior em fusos como UTC-3.
DateTime tournamentEventDateLocal(DateTime dateTime) {
  if (dateTime.isUtc &&
      dateTime.hour == 0 &&
      dateTime.minute == 0 &&
      dateTime.second == 0 &&
      dateTime.millisecond == 0) {
    return DateTime(dateTime.year, dateTime.month, dateTime.day);
  }
  final local = dateTime.toLocal();
  return DateTime(local.year, local.month, local.day);
}

/// Fim efetivo do evento, corrigindo `startDate == endDate` à meia-noite (volley-track).
DateTime tournamentEffectiveEndAt(DateTime startAt, DateTime endAt) {
  final startDay = tournamentEventDateLocal(startAt);
  final endDay = tournamentEventDateLocal(endAt);
  if (startDay == endDay && !endAt.isAfter(startAt)) {
    return DateTime(startDay.year, startDay.month, startDay.day, 23, 59, 59);
  }
  return endAt.toLocal();
}

/// Torneio acontece hoje (data local) e ainda não encerrou.
bool isTournamentEventDay({
  required DateTime startAt,
  DateTime? endAt,
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  if (endAt != null) {
    final effectiveEnd = tournamentEffectiveEndAt(startAt, endAt);
    if (effectiveEnd.isBefore(clock)) return false;
  }
  return tournamentEventDateLocal(startAt) == tournamentEventDateLocal(clock);
}

/// Deriva status de listagem a partir de campos do documento Firestore.
TournamentListingStatus resolveListingStatus({
  String? listingStatusRaw,
  DateTime? startAt,
  DateTime? endAt,
  int spotsLeft = 0,
  int liveMatchesNow = 0,
  DateTime? now,
}) {
  final fromRaw = listingStatusFromRaw(listingStatusRaw);
  final clock = now ?? DateTime.now();
  final effectiveEnd = startAt != null && endAt != null
      ? tournamentEffectiveEndAt(startAt, endAt)
      : endAt?.toLocal();

  if (fromRaw != null && isTournamentTerminal(fromRaw)) {
    return fromRaw;
  }

  if (liveMatchesNow > 0) return TournamentListingStatus.live;

  if (fromRaw == TournamentListingStatus.live) {
    if (effectiveEnd != null && effectiveEnd.isBefore(clock)) {
      return TournamentListingStatus.completed;
    }
    return TournamentListingStatus.live;
  }

  if (effectiveEnd != null && effectiveEnd.isBefore(clock)) {
    return TournamentListingStatus.completed;
  }

  final onEventDay = startAt != null &&
      isTournamentEventDay(startAt: startAt, endAt: endAt, now: clock);

  if (onEventDay &&
      (fromRaw == TournamentListingStatus.open ||
          fromRaw == TournamentListingStatus.almostFull)) {
    return TournamentListingStatus.live;
  }

  if (fromRaw != null) return fromRaw;

  if (spotsLeft <= 0) return TournamentListingStatus.completed;
  if (spotsLeft <= 5) return TournamentListingStatus.almostFull;
  if (startAt != null && startAt.isBefore(clock.add(const Duration(hours: 2)))) {
    return TournamentListingStatus.live;
  }
  return TournamentListingStatus.open;
}
