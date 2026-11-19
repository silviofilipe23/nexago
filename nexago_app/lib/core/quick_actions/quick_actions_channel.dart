import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';

/// Lado nativo: `QuickActionsChannel` em `ios/Runner/AppDelegate.swift`.
const quickActionsChannelName = 'nexago/quick_actions';

/// Toque numa Quick Action, como o iOS entregou.
@immutable
class QuickActionTap {
  const QuickActionTap({required this.type, this.payload = const {}});

  final String type;
  final Map<String, String> payload;
}

/// Ponte com as Quick Actions do iOS (toque longo no ícone).
///
/// O lado nativo guarda o último toque até o Dart buscar com
/// [takePendingAction]: no cold start ele chega antes de o Dart estar pronto.
/// Com o app aberto, o nativo também avisa por `actionAvailable` ([listen]).
class QuickActionsChannel {
  QuickActionsChannel({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel(quickActionsChannelName);

  final MethodChannel _channel;
  List<QuickActionItem>? _lastSent;

  static bool get _supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  /// Grava o menu. Idempotente: a mesma lista não volta ao nativo.
  Future<void> setItems(List<QuickActionItem> items) async {
    if (!_supported) return;
    if (_lastSent != null && listEquals(_lastSent, items)) return;
    _lastSent = List.unmodifiable(items);
    try {
      await _channel.invokeMethod<void>(
        'setItems',
        items.map((item) => item.toChannelMap()).toList(),
      );
    } on MissingPluginException {
      // Build sem o canal (ex.: testes de widget): não há menu a gravar.
    } on PlatformException catch (e) {
      _lastSent = null;
      debugPrint('quickActions: setItems falhou: ${e.code}');
    }
  }

  /// Busca (e consome) o toque guardado pelo nativo, se houver.
  Future<QuickActionTap?> takePendingAction() async {
    if (!_supported) return null;
    try {
      final raw = await _channel.invokeMethod<Object?>('takePendingAction');
      return _parseTap(raw);
    } on MissingPluginException {
      return null;
    } on PlatformException catch (e) {
      debugPrint('quickActions: takePendingAction falhou: ${e.code}');
      return null;
    }
  }

  /// [onActionAvailable] roda quando o nativo recebe um toque com o app vivo.
  void listen(VoidCallback onActionAvailable) {
    if (!_supported) return;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'actionAvailable') onActionAvailable();
    });
  }
}

QuickActionTap? _parseTap(Object? raw) {
  if (raw is! Map) return null;
  final type = raw['type'];
  if (type is! String || type.trim().isEmpty) return null;

  final payload = <String, String>{};
  final rawPayload = raw['payload'];
  if (rawPayload is Map) {
    for (final entry in rawPayload.entries) {
      final key = entry.key;
      final value = entry.value;
      if (key is String && value is String) payload[key] = value;
    }
  }
  return QuickActionTap(type: type, payload: Map.unmodifiable(payload));
}
