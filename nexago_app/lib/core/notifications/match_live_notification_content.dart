/// Conteúdo da notificação de placar ao vivo, montado a partir do `data` que
/// `buildMatchLiveMessages` envia (`functions/src/match-live-follow-notify.ts`).
///
/// Puro de propósito: nada aqui toca no plugin de notificação, então a
/// composição do texto e o id da notificação ficam sob teste. Quem exibe é
/// `match_live_notification.dart`.
///
/// Ver `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`.
library;

/// Discriminador do `data`; qualquer outro tipo de push passa direto.
const matchLiveNotificationType = 'match_live_score';

/// Acima disso o placar exibido ganha "há Xmin" em vez de se passar por atual.
const _freshnessThreshold = Duration(seconds: 60);

enum MatchLiveAction {
  start('start'),
  setEnded('set'),
  matchPoint('matchPoint'),
  score('score'),
  ended('end'),
  dismiss('dismiss');

  const MatchLiveAction(this.wire);

  /// Valor gravado em `data.action` pelo servidor.
  final String wire;

  static MatchLiveAction? fromWire(String raw) {
    for (final action in MatchLiveAction.values) {
      if (action.wire == raw) return action;
    }
    return null;
  }

  /// Momento-chave vibra uma vez; ponto comum atualiza calado.
  bool get alerts =>
      this != MatchLiveAction.score && this != MatchLiveAction.dismiss;

  /// Estado terminal: o placar é definitivo e não envelhece.
  bool get isFinal =>
      this == MatchLiveAction.ended || this == MatchLiveAction.dismiss;
}

class MatchLiveNotificationContent {
  const MatchLiveNotificationContent({
    required this.action,
    required this.matchId,
    required this.title,
    required this.body,
    required this.url,
  });

  final MatchLiveAction action;
  final String matchId;
  final String title;
  final String body;

  /// Rota interna aberta no toque (`resolveNotificationRoute` já a devolve).
  final String url;

  bool get alerts => action.alerts;

  /// Id estável por partida: o push seguinte SUBSTITUI a notificação fixa em
  /// vez de empilhar outra. Positivo e dentro de 32 bits, como o Android exige.
  int get notificationId => matchId.hashCode & 0x7fffffff;

  /// O alerta transitório de momento-chave usa id próprio para não derrubar a
  /// notificação fixa do placar, que continua na tela.
  int get alertNotificationId => '$matchId#alert'.hashCode & 0x7fffffff;
}

String _text(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value == null) return '';
  return value.toString().trim();
}

/// "há 2min" quando o placar já tem idade; vazio quando está fresco.
///
/// Existe por causa do throttle de 20s do servidor: entre um push e outro o
/// número na tela bloqueada fica para trás, e é melhor admitir isso do que
/// exibir um placar velho como se fosse o atual. É o `staleDate` do
/// ActivityKit feito à mão, um nível abaixo.
String freshnessSuffix(DateTime updatedAt, DateTime now) {
  final elapsed = now.difference(updatedAt);
  if (elapsed < _freshnessThreshold) return '';

  final minutes = elapsed.inMinutes;
  if (minutes < 60) return 'há ${minutes}min';
  return 'há ${elapsed.inHours}h';
}

String _pointAlertText(Map<String, dynamic> data) {
  final side = _text(data, 'pointAlertSide');
  final closesMatch = _text(data, 'pointAlertClosesMatch') == 'true';
  final label = closesMatch ? 'Match point' : 'Set point';

  final team = switch (side) {
    'A' => _text(data, 'teamA'),
    'B' => _text(data, 'teamB'),
    _ => '',
  };
  return team.isEmpty ? label : '$label para $team';
}

String _body(
  MatchLiveAction action,
  Map<String, dynamic> data,
  DateTime now,
) {
  final scoreLine = _text(data, 'scoreLine');
  final setsLine = _text(data, 'setsLine');
  final statusLabel = _text(data, 'statusLabel');
  final courtName = _text(data, 'courtName');

  final parts = <String>[];

  switch (action) {
    case MatchLiveAction.dismiss:
      return 'Partida cancelada';
    case MatchLiveAction.ended:
      parts.add('Encerrada');
      if (setsLine.isNotEmpty) parts.add('Sets $setsLine');
    case MatchLiveAction.start:
      parts.add('Começou');
      if (courtName.isNotEmpty) parts.add(courtName);
    case MatchLiveAction.setEnded:
      parts.add('Fim do set');
      if (setsLine.isNotEmpty) parts.add('Sets $setsLine');
    case MatchLiveAction.matchPoint:
      parts.add(_pointAlertText(data));
      if (scoreLine.isNotEmpty) parts.add(scoreLine);
    case MatchLiveAction.score:
      parts.add(statusLabel.isEmpty ? scoreLine : '$statusLabel: $scoreLine');
      if (setsLine.isNotEmpty) parts.add('Sets $setsLine');
      if (courtName.isNotEmpty) parts.add(courtName);
  }

  if (!action.isFinal) {
    final updatedAtMs = int.tryParse(_text(data, 'updatedAt'));
    if (updatedAtMs != null && updatedAtMs > 0) {
      final suffix = freshnessSuffix(
        DateTime.fromMillisecondsSinceEpoch(updatedAtMs, isUtc: true),
        now.toUtc(),
      );
      if (suffix.isNotEmpty) parts.add(suffix);
    }
  }

  return parts.where((part) => part.isNotEmpty).join(' · ');
}

/// Devolve `null` para qualquer push que não seja placar ao vivo — inclusive
/// ação desconhecida, para uma versão nova do servidor não virar notificação
/// sem sentido num app antigo.
MatchLiveNotificationContent? matchLiveNotificationContentFrom(
  Map<String, dynamic> data, {
  DateTime? now,
}) {
  if (_text(data, 'type') != matchLiveNotificationType) return null;

  final action = MatchLiveAction.fromWire(_text(data, 'action'));
  if (action == null) return null;

  final matchId = _text(data, 'matchId');
  if (matchId.isEmpty) return null;

  final teamA = _text(data, 'teamA');
  final teamB = _text(data, 'teamB');
  final title =
      (teamA.isEmpty || teamB.isEmpty) ? 'Partida ao vivo' : '$teamA x $teamB';

  return MatchLiveNotificationContent(
    action: action,
    matchId: matchId,
    title: title,
    body: _body(action, data, now ?? DateTime.now()),
    url: _text(data, 'url'),
  );
}
