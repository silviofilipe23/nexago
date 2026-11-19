import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Lado nativo: `MainActivity.kt` (Android) e `HomeWidgetChannel` no
/// `AppDelegate.swift` (iOS), que grava no App Group lido pela extensão
/// `NexagoWidgets`.
const agendaWidgetChannelName = 'nexago/home_widget';

/// Ponte com o widget "Próximo jogo" da tela inicial: grava o snapshot da
/// Agenda (`encodeAgendaWidgetSnapshot`) para o widget nativo ler e se
/// redesenhar sem o app aberto.
class AgendaWidgetChannel {
  AgendaWidgetChannel({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel(agendaWidgetChannelName);

  final MethodChannel _channel;
  String? _lastSent;

  static bool get _supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// Grava o snapshot. Idempotente: o mesmo JSON não volta ao nativo.
  Future<void> saveSnapshot(String json) async {
    if (!_supported || json == _lastSent) return;
    _lastSent = json;
    try {
      await _channel.invokeMethod<void>('saveAgendaSnapshot', {'json': json});
    } on MissingPluginException {
      // Build sem o canal (ex.: testes de widget): não há widget a gravar.
    } on PlatformException catch (e) {
      _lastSent = null;
      debugPrint('agendaWidget: saveAgendaSnapshot falhou: ${e.code}');
    }
  }
}

final agendaWidgetChannelProvider = Provider<AgendaWidgetChannel>(
  (ref) => AgendaWidgetChannel(),
);
