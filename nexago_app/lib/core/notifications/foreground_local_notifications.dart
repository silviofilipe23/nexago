import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'match_live_notification.dart';

typedef LocalNotificationTapHandler = void Function(Map<String, dynamic> data);

/// Exibe notificações locais quando o FCM chega com o app em foreground.
///
/// Android e iOS: o banner em foreground é responsabilidade deste plugin
/// (o sistema/APNs só exibe com o app em background ou fechado).
class ForegroundLocalNotifications {
  ForegroundLocalNotifications();

  static const androidChannelId = 'default';
  static const androidChannelName = 'NexaGO';

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  bool _pluginAvailable = true;
  LocalNotificationTapHandler? _onTap;

  Future<void> initialize({LocalNotificationTapHandler? onTap}) async {
    if (_initialized || !_pluginAvailable || kIsWeb) return;
    _onTap = onTap;

    try {
      const androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const darwinSettings = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );

      await _plugin.initialize(
        settings: const InitializationSettings(
          android: androidSettings,
          iOS: darwinSettings,
          macOS: darwinSettings,
        ),
        onDidReceiveNotificationResponse: _onNotificationResponse,
      );

      if (Platform.isAndroid) {
        await _plugin
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(
          const AndroidNotificationChannel(
            androidChannelId,
            androidChannelName,
            description: 'Notificações do NexaGO',
            importance: Importance.high,
          ),
        );
      }

      // Canais do placar ao vivo junto dos demais: o isolate principal também
      // exibe a notificação fixa quando o push chega com o app aberto.
      await MatchLiveNotification.ensureChannels();

      final launchDetails = await _plugin.getNotificationAppLaunchDetails();
      final response = launchDetails?.notificationResponse;
      if (launchDetails?.didNotificationLaunchApp == true && response != null) {
        _dispatchTap(response);
      }

      _initialized = true;
    } on MissingPluginException catch (e) {
      _pluginAvailable = false;
      debugPrint(
        'Local notifications indisponível (faça cold start após pub get): $e',
      );
    } on PlatformException catch (e) {
      _pluginAvailable = false;
      debugPrint('Local notifications init falhou: ${e.message}');
    }
  }

  Future<void> showFromRemoteMessage(RemoteMessage message) async {
    if (!_initialized || !_pluginAvailable || kIsWeb) return;

    final content = foregroundNotificationContent(message);
    if (content == null) return;

    final androidDetails = AndroidNotificationDetails(
      androidChannelId,
      androidChannelName,
      channelDescription: 'Notificações do NexaGO',
      importance: Importance.high,
      priority: Priority.high,
    );
    const darwinDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    try {
      await _plugin.show(
        id: _notificationIdFor(message),
        title: content.title,
        body: content.body,
        notificationDetails: NotificationDetails(
          android: androidDetails,
          iOS: darwinDetails,
          macOS: darwinDetails,
        ),
        payload: jsonEncode(message.data),
      );
    } on MissingPluginException catch (e) {
      _pluginAvailable = false;
      debugPrint('Local notifications show falhou: $e');
    }
  }

  /// Tira da bandeja do Android as notificações já entregues.
  ///
  /// No Android o número no ícone do app é a contagem da bandeja: os pushes
  /// que chegaram com o app fechado ficavam lá depois de lidos no app, e o
  /// ícone seguia mostrando o mesmo número para sempre.
  Future<void> clearDelivered() async {
    if (!_initialized || !_pluginAvailable || kIsWeb || !Platform.isAndroid) {
      return;
    }
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;

    try {
      final active = await android.getActiveNotifications();
      for (final notification in active.where(clearsOnAppOpen)) {
        await android.cancel(id: notification.id!, tag: notification.tag);
      }
    } on PlatformException catch (e) {
      debugPrint('Local notifications clear falhou: ${e.message}');
    }
  }

  bool shouldPresentLocally(RemoteMessage message) {
    if (!_pluginAvailable || kIsWeb) return false;
    return Platform.isAndroid || Platform.isIOS || Platform.isMacOS;
  }

  void _onNotificationResponse(NotificationResponse response) {
    _dispatchTap(response);
  }

  void _dispatchTap(NotificationResponse response) {
    final data = decodeNotificationPayload(response.payload);
    if (data == null || data.isEmpty) return;
    _onTap?.call(data);
  }
}

/// Título e corpo para banner local a partir de um [RemoteMessage].
ForegroundNotificationContent? foregroundNotificationContent(
  RemoteMessage message,
) {
  final push = message.notification;
  final title = (push?.title ?? message.data['title'] as String? ?? '').trim();
  final body = (push?.body ?? message.data['body'] as String? ?? '').trim();
  if (title.isEmpty && body.isEmpty) return null;
  return ForegroundNotificationContent(
    title: title.isEmpty ? 'NexaGO' : title,
    body: body,
  );
}

/// Sai da bandeja quando o app abre: tudo menos o placar ao vivo fixo, que
/// acompanha a partida e some sozinho no fim dela.
bool clearsOnAppOpen(ActiveNotification notification) {
  return notification.id != null &&
      notification.channelId != MatchLiveNotification.ongoingChannelId;
}

Map<String, dynamic>? decodeNotificationPayload(String? payload) {
  if (payload == null || payload.trim().isEmpty) return null;
  try {
    final decoded = jsonDecode(payload);
    if (decoded is! Map) return null;
    return Map<String, dynamic>.from(decoded);
  } catch (_) {
    return null;
  }
}

int _notificationIdFor(RemoteMessage message) {
  final id = message.messageId;
  if (id != null && id.isNotEmpty) {
    return id.hashCode.abs() % 100000;
  }
  return message.hashCode.abs() % 100000;
}

class ForegroundNotificationContent {
  const ForegroundNotificationContent({
    required this.title,
    required this.body,
  });

  final String title;
  final String body;
}
