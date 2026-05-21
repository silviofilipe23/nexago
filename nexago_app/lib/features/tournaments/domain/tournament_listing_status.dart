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
  if (fromRaw != null) return fromRaw;

  final clock = now ?? DateTime.now();
  if (liveMatchesNow > 0) return TournamentListingStatus.live;
  if (endAt != null && endAt.isBefore(clock)) {
    return TournamentListingStatus.completed;
  }
  if (spotsLeft <= 0) return TournamentListingStatus.completed;
  if (spotsLeft <= 5) return TournamentListingStatus.almostFull;
  if (startAt != null && startAt.isBefore(clock.add(const Duration(hours: 2)))) {
    return TournamentListingStatus.live;
  }
  return TournamentListingStatus.open;
}
