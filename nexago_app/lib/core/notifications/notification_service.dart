import 'dart:async';
import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_app_installations/firebase_app_installations.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';

import '../../firebase_options.dart';
import 'foreground_local_notifications.dart';

typedef NotificationMessageHandler = void Function(RemoteMessage message);
typedef NotificationDataHandler = void Function(Map<String, dynamic> data);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  }
  debugPrint('FCM background message: ${message.messageId}');
}

class NotificationService {
  NotificationService(
    this._messaging,
    this._firestore,
    this._installations,
  );

  final FirebaseMessaging _messaging;
  final FirebaseFirestore _firestore;
  final FirebaseInstallations _installations;
  final ForegroundLocalNotifications _localNotifications =
      ForegroundLocalNotifications();

  bool _initialized = false;
  String? _activeUserId;
  NotificationMessageHandler? _onOpenMessage;
  NotificationMessageHandler? _onForegroundMessage;

  StreamSubscription<RemoteMessage>? _messageOpenSub;
  StreamSubscription<RemoteMessage>? _messageForegroundSub;
  StreamSubscription<String>? _tokenRefreshSub;
  String? _installationIdCache;
  bool _pluginAvailable = true;
  Timer? _apnsRetryTimer;
  int _apnsRetryCount = 0;

  static const _apnsMaxRetries = 12;
  static const _apnsRetryDelay = Duration(seconds: 5);

  Future<void> initialize({
    NotificationMessageHandler? onOpenMessage,
    NotificationMessageHandler? onForegroundMessage,
    NotificationDataHandler? onNotificationTap,
  }) async {
    _onOpenMessage = onOpenMessage;
    _onForegroundMessage = onForegroundMessage;
    if (_initialized) return;

    if (!_pluginAvailable) return;
    final ok = await _safeMessagingCall<bool>(() async {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      debugPrint('FCM permission: ${settings.authorizationStatus.name}');

      // iOS/macOS: banner em foreground via flutter_local_notifications.
      // Desliga apresentação nativa do FCM para evitar banner duplicado.
      final presentNatively = !kIsWeb && !Platform.isIOS && !Platform.isMacOS;
      await _messaging.setForegroundNotificationPresentationOptions(
        alert: presentNatively,
        badge: presentNatively,
        sound: presentNatively,
      );
      return true;
    });
    if (ok != true) return;

    _messageForegroundSub = FirebaseMessaging.onMessage.listen((message) async {
      debugPrint('FCM foreground message: ${message.messageId}');
      if (_localNotifications.shouldPresentLocally(message)) {
        await _localNotifications.showFromRemoteMessage(message);
      }
      _onForegroundMessage?.call(message);
    });

    _messageOpenSub = FirebaseMessaging.onMessageOpenedApp.listen((message) {
      debugPrint('FCM opened from background: ${message.messageId}');
      _onOpenMessage?.call(message);
    });

    final initialMessage = await _safeMessagingCall<RemoteMessage?>(() {
      return _messaging.getInitialMessage();
    });
    if (initialMessage != null) {
      debugPrint('FCM opened from terminated: ${initialMessage.messageId}');
      _onOpenMessage?.call(initialMessage);
    }

    _tokenRefreshSub = _messaging.onTokenRefresh.listen((token) async {
      final uid = _activeUserId;
      if (uid == null || uid.isEmpty) return;
      await saveUserToken(token);
    });

    // Depois do FCM: banner local em foreground (Android). Falha aqui não bloqueia push.
    await _localNotifications.initialize(onTap: onNotificationTap);

    _initialized = true;
  }

  /// Remove o token FCM do dispositivo atual em `users/{uid}/tokens/{installationId}`.
  Future<void> clearCurrentDeviceToken([String? userId]) async {
    final uid = userId?.trim() ?? _activeUserId?.trim();
    if (uid == null || uid.isEmpty) return;

    try {
      final tokenId = await _getInstallationTokenId();
      await _firestore
          .collection('users')
          .doc(uid)
          .collection('tokens')
          .doc(tokenId)
          .delete();
    } catch (e) {
      debugPrint('FCM clear token failed: $e');
    }
  }

  Future<bool> _readPushChannelEnabled(String uid) async {
    try {
      final snap = await _firestore.collection('users').doc(uid).get();
      if (!snap.exists) return true;
      final prefs = snap.data()?['notificationPreferences'];
      if (prefs is! Map) return true;
      final channels = prefs['channels'];
      if (channels is! Map) return true;
      return channels['push'] as bool? ?? true;
    } catch (e) {
      debugPrint('FCM read push preference failed: $e');
      return true;
    }
  }

  Future<void> syncUserToken(String? userId) async {
    final uid = userId?.trim();
    if (uid == null || uid.isEmpty) {
      cancelApnsRetry();
      _activeUserId = null;
      return;
    }
    _activeUserId = uid;
    await _syncUserTokenAttempt(uid);
  }

  void cancelApnsRetry() {
    _apnsRetryTimer?.cancel();
    _apnsRetryTimer = null;
    _apnsRetryCount = 0;
  }

  Future<void> _syncUserTokenAttempt(String uid) async {
    if (!_pluginAvailable) return;
    if (!await _readPushChannelEnabled(uid)) return;

    if (!kIsWeb && Platform.isIOS) {
      final apnsToken =
          await _safeMessagingCall<String?>(() => _messaging.getAPNSToken());
      if (apnsToken == null || apnsToken.isEmpty) {
        if (_apnsRetryCount < _apnsMaxRetries) {
          debugPrint(
            'APNS token ainda não disponível; pulando sync FCM por agora.',
          );
          _scheduleApnsRetry(uid);
          return;
        }
        debugPrint(
          'APNS token indisponível após $_apnsMaxRetries tentativas; '
          'tentando getToken mesmo assim.',
        );
      } else {
        debugPrint('APNS token disponível.');
        cancelApnsRetry();
      }
    } else {
      cancelApnsRetry();
    }

    final token =
        await _safeMessagingCall<String?>(() => _messaging.getToken());
    if (token == null || token.isEmpty) return;
    debugPrint('FCM TOKEN: $token');
    await saveUserToken(token);
  }

  void _scheduleApnsRetry(String uid) {
    if (_apnsRetryCount >= _apnsMaxRetries) {
      debugPrint('APNS retry esgotado após $_apnsMaxRetries tentativas.');
      return;
    }
    if (_apnsRetryTimer?.isActive ?? false) return;

    _apnsRetryTimer = Timer(_apnsRetryDelay, () async {
      _apnsRetryCount += 1;
      debugPrint('APNS retry $_apnsRetryCount/$_apnsMaxRetries');
      await _syncUserTokenAttempt(uid);
    });
  }

  /// Salva/atualiza o token no usuário ativo:
  /// `users/{userId}/tokens/{tokenId}`.
  ///
  /// - `tokenId` é o ID de instalação do app (1 doc por dispositivo);
  /// - atualizações de token no mesmo dispositivo sobrescrevem o mesmo doc;
  /// - múltiplos dispositivos criam múltiplos docs.
  Future<void> saveUserToken(String token) async {
    final uid = _activeUserId?.trim();
    if (uid == null || uid.isEmpty) return;
    final safeToken = token.trim();
    if (safeToken.isEmpty) return;

    final tokenId = await _getInstallationTokenId();
    await _firestore
        .collection('users')
        .doc(uid)
        .collection('tokens')
        .doc(tokenId)
        .set(
      <String, dynamic>{
        'token': safeToken,
        'platform': _platformLabel(),
        'tokenId': tokenId,
        'updatedAt': FieldValue.serverTimestamp(),
        'createdAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<String> _getInstallationTokenId() async {
    final cached = _installationIdCache;
    if (cached != null && cached.isNotEmpty) {
      return cached;
    }
    final id = await _safeMessagingCall<String>(() => _installations.getId());
    if (id == null || id.isEmpty) {
      return 'installation_unknown';
    }
    _installationIdCache = id;
    return id;
  }

  Future<T?> _safeMessagingCall<T>(Future<T> Function() task) async {
    try {
      return await task();
    } on MissingPluginException catch (e) {
      _pluginAvailable = false;
      debugPrint('FCM plugin indisponível: $e');
      return null;
    } on PlatformException catch (e) {
      if (e.code == 'channel-error') {
        _pluginAvailable = false;
        debugPrint('FCM channel indisponível: ${e.message}');
        return null;
      }
      if (e.code == 'firebase_messaging/apns-token-not-set' ||
          e.code == 'apns-token-not-set') {
        debugPrint('FCM aguardando APNS token no iOS.');
        return null;
      }
      rethrow;
    } on FirebaseException catch (e) {
      if (e.code == 'apns-token-not-set') {
        debugPrint('FCM aguardando APNS token no iOS.');
        return null;
      }
      rethrow;
    }
  }

  String _platformLabel() {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    if (Platform.isMacOS) return 'macos';
    return 'unknown';
  }

  Future<void> dispose() async {
    cancelApnsRetry();
    await _messageOpenSub?.cancel();
    await _messageForegroundSub?.cancel();
    await _tokenRefreshSub?.cancel();
  }
}
