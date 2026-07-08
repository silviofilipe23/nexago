import 'friendly_match_models.dart';

/// Bora Jogar — lógica pura de apresentação/ação (testável sem Firestore).

enum FriendlyMatchCheckInWindow { notOpen, open, closed }

enum FriendlyMatchNextAction {
  /// É a vez deste atleta responder (aceitar/recusar/contrapor).
  respond,

  /// Aguardando a resposta do outro atleta.
  waitingResponse,

  /// Convite pendente venceu (a UI mostra antes do sweeper rodar).
  expired,

  /// Jogo confirmado, mas a janela de check-in ainda não abriu.
  waitingCheckInWindow,

  /// Janela aberta e este atleta ainda não fez check-in.
  checkInAvailable,

  /// Este atleta já fez check-in; falta o outro.
  checkInWaitingOther,

  /// Jogo realizado e este atleta ainda não avaliou.
  review,

  /// Já avaliou; aguardando a avaliação do outro (ou o prazo do reveal).
  reviewWaitingOther,

  /// Nada a fazer (estados terminais ou janela encerrada).
  finished,
}

/// Convite pendente vencido — a UI usa isto para renderizar "Expirado"
/// imediatamente; o sweeper (a cada 5 min) persiste a transição depois.
bool isClientExpired(FriendlyMatch match, DateTime now) {
  if (!match.status.isPendingResponse) return false;
  final expiresAt = match.expiresAt;
  return expiresAt != null && now.isAfter(expiresAt);
}

FriendlyMatchCheckInWindow checkInWindowState(FriendlyMatch match, DateTime now) {
  final openAt = match.checkInOpenAt;
  final closeAt = match.checkInCloseAt;
  if (openAt == null || closeAt == null) return FriendlyMatchCheckInWindow.notOpen;
  if (now.isBefore(openAt)) return FriendlyMatchCheckInWindow.notOpen;
  if (now.isAfter(closeAt)) return FriendlyMatchCheckInWindow.closed;
  return FriendlyMatchCheckInWindow.open;
}

/// Espelho de isCancellationPenalized do backend: cancelar faltando menos
/// que a janela de antecedência (ou depois do horário) penaliza a reputação.
bool cancellationIsPenalized(
  FriendlyMatch match,
  FriendlyMatchConfig config,
  DateTime now,
) {
  final window = Duration(hours: config.cancellationPenaltyWindowHours);
  return match.scheduledAt.difference(now) < window;
}

FriendlyMatchNextAction nextActionFor(String uid, FriendlyMatch match, DateTime now) {
  switch (match.status) {
    case FriendlyMatchStatus.sent:
    case FriendlyMatchStatus.countered:
      if (isClientExpired(match, now)) return FriendlyMatchNextAction.expired;
      return match.responderUid == uid
          ? FriendlyMatchNextAction.respond
          : FriendlyMatchNextAction.waitingResponse;
    case FriendlyMatchStatus.confirmed:
      switch (checkInWindowState(match, now)) {
        case FriendlyMatchCheckInWindow.notOpen:
          return FriendlyMatchNextAction.waitingCheckInWindow;
        case FriendlyMatchCheckInWindow.open:
          return match.hasCheckedIn(uid)
              ? FriendlyMatchNextAction.checkInWaitingOther
              : FriendlyMatchNextAction.checkInAvailable;
        case FriendlyMatchCheckInWindow.closed:
          return FriendlyMatchNextAction.finished;
      }
    case FriendlyMatchStatus.completed:
      return match.hasReviewed(uid)
          ? FriendlyMatchNextAction.reviewWaitingOther
          : FriendlyMatchNextAction.review;
    case FriendlyMatchStatus.declined:
    case FriendlyMatchStatus.expired:
    case FriendlyMatchStatus.cancelled:
    case FriendlyMatchStatus.noShow:
    case FriendlyMatchStatus.reviewed:
      return FriendlyMatchNextAction.finished;
  }
}

String? compatibilityLabel(int? scoreAtSend) {
  if (scoreAtSend == null) return null;
  return '$scoreAtSend% compatível';
}
