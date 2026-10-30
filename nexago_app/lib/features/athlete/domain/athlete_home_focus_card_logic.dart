import 'package:intl/intl.dart';

import '../../../core/time/nexago_event_timezone.dart';
import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_display.dart';
import '../../tournaments/domain/tournament_match_status.dart';

/// O que o card do Modo Focus na Home mostra, conforme o dia do atleta.
enum HomeFocusCardMode {
  /// A mesa chamou a dupla para a quadra: vermelho, ação imediata.
  called,

  /// A partida do atleta está rolando.
  live,

  /// Próxima partida com horário: contagem regressiva (ou atraso).
  countdown,

  /// Próxima partida ainda sem horário (fila da mesa).
  unscheduled,

  /// Nada pendente agora: entre jogos ou esperando a próxima fase.
  waiting,
}

/// Estado do card a partir da partida mais fresca do atleta.
///
/// "Ao vivo" vem antes da chamada: a partida em andamento pode continuar com
/// `queueStatus == on_court`, e aí "Vá para a quadra" seria mentira. Partida
/// já encerrada (o stream chegou antes da próxima leitura do dia) vira
/// intervalo, nunca contagem de um jogo que acabou.
HomeFocusCardMode homeFocusCardModeOf(TournamentMatch? match) {
  if (match == null) return HomeFocusCardMode.waiting;
  if (TournamentMatchStatus.isCompleted(match.status) ||
      TournamentMatchStatus.isCanceled(match.status)) {
    return HomeFocusCardMode.waiting;
  }
  if (TournamentMatchStatus.isInProgress(match.status)) {
    return HomeFocusCardMode.live;
  }
  if (match.isOnCourt) return HomeFocusCardMode.called;
  if (match.scheduleTime != null) return HomeFocusCardMode.countdown;
  return HomeFocusCardMode.unscheduled;
}

/// "Jogo 14 · Quadra 3 · 12:10" — o onde/quando da partida, sem os vazios.
String homeFocusMatchMeta(TournamentMatch match) {
  final time = match.scheduleTime;
  return [
    if (match.matchNumber > 0) 'Jogo ${match.matchNumber}',
    matchCourtLabelForCard(match),
    if (time != null)
      DateFormat('HH:mm', 'pt_BR').format(toNexagoEventLocal(time)),
  ].where((part) => part.isNotEmpty).join(' · ');
}

/// Fração da última hora já percorrida até a partida (0 a 1); `null` quando
/// falta mais de uma hora ou não há horário — a barra só aparece na reta final.
double? homeFocusFinalHourProgress(DateTime? scheduleTime, DateTime now) {
  if (scheduleTime == null) return null;
  final remaining = scheduleTime.difference(now);
  if (remaining.isNegative) return 1;
  if (remaining > const Duration(hours: 1)) return null;
  return 1 - remaining.inSeconds / const Duration(hours: 1).inSeconds;
}
