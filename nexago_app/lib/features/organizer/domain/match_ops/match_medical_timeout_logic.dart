import '../../../tournaments/domain/tournament_match_medical_timeout.dart';

/// Regras do TEMPO MÉDICO — o atendimento de 5 minutos que para a partida.
///
/// Espelha `medical-timeout.ts` (mesas web). A contagem é sempre DERIVADA de `startedAt`, nunca
/// um cronômetro gravado: é o que faz o app, as duas mesas web e o telão mostrarem o mesmo
/// número sem nenhuma escrita durante o atendimento — e por isso não existe "pausar", que
/// exigiria escrever a cada toque e faria as telas divergirem.
abstract final class MatchMedicalTimeoutLogic {
  MatchMedicalTimeoutLogic._();

  /// Chave de quem já usou o atendimento — "A1", "B2". Mora no domínio porque o mapper do doc
  /// também precisa dela (ver `tournament_match_medical_timeout.dart`).
  static String playerKey(String side, int slot) =>
      medicalTimeoutPlayerKey(side, slot);

  /// Quanto falta, em segundos. `startedAt` só chega nulo na janela entre a escrita local e o
  /// carimbo do servidor voltar pelo snapshot — nessa fração mostramos o tempo cheio, e não
  /// zero, que pareceria atendimento encerrado.
  static int remainingSeconds(MatchMedicalTimeout timeout, DateTime now) {
    final startedAt = timeout.startedAt;
    if (startedAt == null) return timeout.durationSec;
    final elapsed = now.difference(startedAt).inSeconds;
    return (timeout.durationSec - elapsed).clamp(0, timeout.durationSec);
  }

  /// Acabou o tempo, mas o overlay segue aberto até o mesário encerrar — quem decide se o
  /// atleta volta é a mesa, não o relógio.
  static bool isEnded(MatchMedicalTimeout timeout, DateTime now) =>
      remainingSeconds(timeout, now) <= 0;

  static bool hasUsed(List<String> usedKeys, String side, int slot) =>
      usedKeys.contains(playerKey(side, slot));

  /// Pode chamar atendimento pra este atleta? Um por atleta na partida, e nunca com outro
  /// atendimento em andamento.
  static bool canRequest({
    required List<String> usedKeys,
    required MatchMedicalTimeout? active,
    required String side,
    required int slot,
  }) {
    if (active != null) return false;
    if (slot != 1 && slot != 2) return false;
    return !hasUsed(usedKeys, side, slot);
  }

  /// "04:37" — a contagem do overlay.
  static String formatMmSs(int totalSec) {
    final safe = totalSec.clamp(0, 5999);
    final minutes = (safe ~/ 60).toString().padLeft(2, '0');
    final seconds = (safe % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
}
