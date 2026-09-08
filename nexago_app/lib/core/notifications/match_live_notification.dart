import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'match_live_notification_content.dart';

/// Notificação fixa do placar ao vivo na tela bloqueada do Android.
///
/// Recebe o push data-only de `match-live-follow-notify.ts` e mantém UMA
/// notificação por partida, substituída a cada atualização. Momento-chave
/// (set, match point, fim) posta ainda um alerta transitório em canal separado,
/// para vibrar sem derrubar o placar que está na tela.
///
/// iOS não passa por aqui na Fase 1: lá o push é alerta comum, montado pelo
/// servidor e exibido pelo sistema. Ver
/// `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`.
abstract final class MatchLiveNotification {
  MatchLiveNotification._();

  /// Canal do placar fixo.
  ///
  /// `Importance.low` é o ponto de equilíbrio e não é acidente: `min` sumiria
  /// da barra de status, `default` faria heads-up a cada ponto. `min` ainda
  /// desqualificaria a promoção a Live Update do Android 16.
  static const ongoingChannelId = 'match_live';
  static const ongoingChannelName = 'Placar ao vivo';
  static const ongoingChannelDescription =
      'Placar da partida que você está acompanhando';

  /// Canal dos momentos que merecem vibrar.
  static const alertChannelId = 'match_live_alerts';
  static const alertChannelName = 'Momentos do jogo';
  static const alertChannelDescription = 'Set, match point e fim de jogo';

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static bool _pluginAvailable = true;

  /// Estado POR ISOLATE: o handler de background roda em outro isolate, onde
  /// nada do app principal foi inicializado.
  static bool _backgroundReady = false;

  /// Cria os dois canais. Idempotente — o Android ignora recriação.
  static Future<void> ensureChannels() async {
    if (kIsWeb || !_pluginAvailable || !Platform.isAndroid) return;

    try {
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      if (android == null) return;

      await android.createNotificationChannel(
        const AndroidNotificationChannel(
          ongoingChannelId,
          ongoingChannelName,
          description: ongoingChannelDescription,
          importance: Importance.low,
        ),
      );
      await android.createNotificationChannel(
        const AndroidNotificationChannel(
          alertChannelId,
          alertChannelName,
          description: alertChannelDescription,
          importance: Importance.high,
        ),
      );
    } on MissingPluginException catch (e) {
      _pluginAvailable = false;
      debugPrint('MatchLiveNotification: canais indisponíveis: $e');
    } on PlatformException catch (e) {
      debugPrint('MatchLiveNotification: canais falharam: ${e.message}');
    }
  }

  /// Caminho do isolate de background (app fechado ou em segundo plano).
  ///
  /// Inicializa o plugin aqui porque neste isolate ele não existe. Não registra
  /// handler de toque: o toque acorda o app e o isolate principal o resolve por
  /// `getNotificationAppLaunchDetails`.
  static Future<void> handleFromBackground(Map<String, dynamic> data) async {
    if (kIsWeb || !_pluginAvailable || !Platform.isAndroid) return;

    if (!_backgroundReady) {
      try {
        await _plugin.initialize(
          settings: const InitializationSettings(
            android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          ),
        );
        await ensureChannels();
        _backgroundReady = true;
      } on MissingPluginException catch (e) {
        _pluginAvailable = false;
        debugPrint('MatchLiveNotification: plugin indisponível: $e');
        return;
      } on PlatformException catch (e) {
        debugPrint('MatchLiveNotification: init falhou: ${e.message}');
        return;
      }
    }

    await _apply(data);
  }

  /// Caminho do app em primeiro plano.
  ///
  /// NÃO reinicializa o plugin: `ForegroundLocalNotifications.initialize` já o
  /// fez e registrou o handler de toque — reinicializar aqui derrubaria esse
  /// handler e o toque em push pararia de navegar.
  static Future<void> handleFromForeground(Map<String, dynamic> data) async {
    if (kIsWeb || !_pluginAvailable || !Platform.isAndroid) return;
    await _apply(data);
  }

  /// `true` quando o payload era de placar ao vivo e foi tratado aqui.
  static bool handles(Map<String, dynamic> data) {
    return matchLiveNotificationContentFrom(data) != null;
  }

  static Future<void> _apply(Map<String, dynamic> data) async {
    final content = matchLiveNotificationContentFrom(data);
    if (content == null) return;

    try {
      // Terminal derruba o placar fixo; `end` ainda alerta o resultado logo
      // abaixo, `dismiss` sai calado.
      if (content.action.isFinal) {
        await _plugin.cancel(id: content.notificationId);
      } else {
        await _show(
          content: content,
          data: data,
          id: content.notificationId,
          channelId: ongoingChannelId,
          channelName: ongoingChannelName,
          channelDescription: ongoingChannelDescription,
          importance: Importance.low,
          priority: Priority.low,
          ongoing: true,
        );
      }

      if (content.alerts) {
        await _show(
          content: content,
          data: data,
          id: content.alertNotificationId,
          channelId: alertChannelId,
          channelName: alertChannelName,
          channelDescription: alertChannelDescription,
          importance: Importance.high,
          priority: Priority.high,
          ongoing: false,
        );
      }
    } on MissingPluginException catch (e) {
      _pluginAvailable = false;
      debugPrint('MatchLiveNotification: show falhou: $e');
    } on PlatformException catch (e) {
      debugPrint('MatchLiveNotification: show falhou: ${e.message}');
    }
  }

  static Future<void> _show({
    required MatchLiveNotificationContent content,
    required Map<String, dynamic> data,
    required int id,
    required String channelId,
    required String channelName,
    required String channelDescription,
    required Importance importance,
    required Priority priority,
    required bool ongoing,
  }) {
    // `BigTextStyleInformation` de propósito: `RemoteViews` customizado
    // desqualificaria a promoção a Live Update do Android 16 (ver spec).
    final android = AndroidNotificationDetails(
      channelId,
      channelName,
      channelDescription: channelDescription,
      importance: importance,
      priority: priority,
      ongoing: ongoing,
      autoCancel: !ongoing,
      // Sem isto o Android trata cada atualização como notificação nova e
      // vibra a cada ponto.
      onlyAlertOnce: ongoing,
      showWhen: false,
      // Mostra o placar na tela bloqueada mesmo com conteúdo sensível oculto.
      visibility: NotificationVisibility.public,
      category: AndroidNotificationCategory.event,
      styleInformation: BigTextStyleInformation(
        content.body,
        contentTitle: content.title,
      ),
    );

    return _plugin.show(
      id: id,
      title: content.title,
      body: content.body,
      notificationDetails: NotificationDetails(android: android),
      // Mesmo payload dos demais pushes: `decodeNotificationPayload` no toque
      // devolve o `data`, e `resolveNotificationRoute` já lê o `url`.
      payload: jsonEncode(data),
    );
  }
}
