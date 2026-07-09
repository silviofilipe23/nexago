import 'package:intl/intl.dart';

import '../../athlete/domain/athlete_firestore_codes.dart';
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

String friendlyMatchSportLabel(String sportCode) {
  final trimmed = sportCode.trim();
  if (trimmed.isEmpty) return '';
  return AthleteFirestoreCodes.sportFirestoreToLabel(trimmed) ?? trimmed;
}

/// Linha principal do card: objetivo · esporte · data/hora.
String friendlyMatchSummaryLine(FriendlyMatch match) {
  final when = DateFormat("EEE, d 'de' MMM · HH:mm", 'pt_BR')
      .format(match.scheduledAt.toLocal());
  final sport = friendlyMatchSportLabel(match.sport);
  final parts = <String>[match.objective.label];
  if (sport.isNotEmpty) parts.add(sport);
  parts.add(when);
  return parts.join(' · ');
}

/// Subtítulo do card de perfil no detalhe: objetivo · esporte.
String friendlyMatchProfileSubtitle(FriendlyMatch match) {
  final sport = friendlyMatchSportLabel(match.sport);
  if (sport.isEmpty) return match.objective.label;
  return '${match.objective.label} · $sport';
}

/// Data/hora do jogo no detalhe — "sábado, 11 de julho · 17:00".
String friendlyMatchDetailWhenLabel(DateTime at) {
  final formatted =
      DateFormat("EEEE, d 'de' MMMM · HH:mm", 'pt_BR').format(at.toLocal());
  return formatted.replaceAll('.', '');
}

/// Rótulo de evento no passado — "hoje às 09:12", "ontem às 18:30".
String friendlyMatchEventTimeLabel(DateTime at, DateTime now) {
  final local = at.toLocal();
  final reference = now.toLocal();
  final today = DateTime(reference.year, reference.month, reference.day);
  final eventDay = DateTime(local.year, local.month, local.day);
  final time = DateFormat('HH:mm').format(local);
  if (eventDay == today) return 'hoje às $time';
  if (eventDay == today.subtract(const Duration(days: 1))) {
    return 'ontem às $time';
  }
  final date =
      DateFormat("d 'de' MMM · HH:mm", 'pt_BR').format(local).replaceAll('.', '');
  return date;
}

/// Tempo relativo curto — "há 4 min", "há 2 h".
String friendlyMatchRelativeTimeLabel(DateTime at, DateTime now) {
  final diff = now.difference(at);
  if (diff.inMinutes < 1) return 'agora';
  if (diff.inMinutes < 60) return 'há ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'há ${diff.inHours} h';
  if (diff.inDays == 1) return 'ontem';
  if (diff.inDays < 7) return 'há ${diff.inDays} dias';
  return friendlyMatchEventTimeLabel(at, now);
}

enum FriendlyMatchTimelineStepState { done, current }

class FriendlyMatchTimelineStep {
  const FriendlyMatchTimelineStep({
    required this.title,
    this.subtitle,
    required this.state,
  });

  final String title;
  final String? subtitle;
  final FriendlyMatchTimelineStepState state;
}

/// Passos da linha do tempo no detalhe do convite.
List<FriendlyMatchTimelineStep> friendlyMatchTimelineSteps({
  required FriendlyMatch match,
  required String uid,
  required FriendlyMatchNextAction action,
  required DateTime now,
}) {
  final otherName = match.otherName(uid);
  final created = match.createdAt ?? match.scheduledAt;

  switch (action) {
    case FriendlyMatchNextAction.waitingResponse:
      if (match.status == FriendlyMatchStatus.countered) {
        return [
          FriendlyMatchTimelineStep(
            title: 'Contraproposta enviada',
            subtitle: friendlyMatchEventTimeLabel(created, now),
            state: FriendlyMatchTimelineStepState.done,
          ),
          const FriendlyMatchTimelineStep(
            title: 'Aguardando resposta',
            state: FriendlyMatchTimelineStepState.current,
          ),
        ];
      }
      final steps = <FriendlyMatchTimelineStep>[
        FriendlyMatchTimelineStep(
          title: 'Convite enviado',
          subtitle: friendlyMatchEventTimeLabel(created, now),
          state: FriendlyMatchTimelineStepState.done,
        ),
      ];
      final viewedAt = match.viewedByRecipientAt;
      if (viewedAt != null) {
        steps.add(
          FriendlyMatchTimelineStep(
            title: 'Visualizado por $otherName',
            subtitle: friendlyMatchRelativeTimeLabel(viewedAt, now),
            state: FriendlyMatchTimelineStepState.done,
          ),
        );
      }
      steps.add(
        const FriendlyMatchTimelineStep(
          title: 'Aguardando resposta',
          state: FriendlyMatchTimelineStepState.current,
        ),
      );
      return steps;

    case FriendlyMatchNextAction.respond:
      return [
        FriendlyMatchTimelineStep(
          title: match.status == FriendlyMatchStatus.countered
              ? 'Contraproposta recebida'
              : 'Convite recebido',
          subtitle: friendlyMatchEventTimeLabel(created, now),
          state: FriendlyMatchTimelineStepState.done,
        ),
        const FriendlyMatchTimelineStep(
          title: 'Aguardando sua resposta',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.expired:
      return [
        FriendlyMatchTimelineStep(
          title: 'Convite enviado',
          subtitle: friendlyMatchEventTimeLabel(created, now),
          state: FriendlyMatchTimelineStepState.done,
        ),
        const FriendlyMatchTimelineStep(
          title: 'Convite expirado',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.waitingCheckInWindow:
      return [
        const FriendlyMatchTimelineStep(
          title: 'Jogo confirmado',
          state: FriendlyMatchTimelineStepState.done,
        ),
        const FriendlyMatchTimelineStep(
          title: 'Check-in abre 30 min antes',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.checkInAvailable:
      return [
        const FriendlyMatchTimelineStep(
          title: 'Jogo confirmado',
          state: FriendlyMatchTimelineStepState.done,
        ),
        const FriendlyMatchTimelineStep(
          title: 'Faça check-in na arena',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.checkInWaitingOther:
      return [
        FriendlyMatchTimelineStep(
          title: 'Check-in feito',
          subtitle: friendlyMatchRelativeTimeLabel(
            match.checkIns[uid] ?? now,
            now,
          ),
          state: FriendlyMatchTimelineStepState.done,
        ),
        FriendlyMatchTimelineStep(
          title: 'Aguardando check-in de $otherName',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.review:
      return [
        const FriendlyMatchTimelineStep(
          title: 'Jogo realizado',
          state: FriendlyMatchTimelineStepState.done,
        ),
        const FriendlyMatchTimelineStep(
          title: 'Avalie o jogo',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.reviewWaitingOther:
      return [
        const FriendlyMatchTimelineStep(
          title: 'Avaliação enviada',
          state: FriendlyMatchTimelineStepState.done,
        ),
        FriendlyMatchTimelineStep(
          title: 'Aguardando avaliação de $otherName',
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];

    case FriendlyMatchNextAction.finished:
      final title = switch (match.status) {
        FriendlyMatchStatus.declined => 'Convite recusado',
        FriendlyMatchStatus.expired => 'Convite expirado',
        FriendlyMatchStatus.cancelled => 'Jogo cancelado',
        FriendlyMatchStatus.noShow => 'Jogo não realizado',
        FriendlyMatchStatus.reviewed => 'Jogo concluído',
        _ => 'Encerrado',
      };
      return [
        FriendlyMatchTimelineStep(
          title: title,
          state: FriendlyMatchTimelineStepState.current,
        ),
      ];
  }
}
