import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_app_installations/firebase_app_installations.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';

import '../../firebase_options.dart';

typedef NotificationMessageHandler = void Function(RemoteMessage message);

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

  bool _initialized = false;
  String? _activeUserId;
  NotificationMessageHandler? _onOpenMessage;
  NotificationMessageHandler? _onForegroundMessage;

  StreamSubscription<RemoteMessage>? _messageOpenSub;
  StreamSubscription<RemoteMessage>? _messageForegroundSub;
  StreamSubscription<String>? _tokenRefreshSub;
  String? _installationIdCache;
  bool _pluginAvailable = true;

  Future<void> initialize({
    NotificationMessageHandler? onOpenMessage,
    NotificationMessageHandler? onForegroundMessage,
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

      await _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      return true;
    });
    if (ok != true) return;

    _messageForegroundSub = FirebaseMessaging.onMessage.listen((message) {
      debugPrint('FCM foreground message: ${message.messageId}');
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

    _initialized = true;
  }

  Future<void> syncUserToken(String? userId) async {
    final uid = userId?.trim();
    if (uid == null || uid.isEmpty) {
      _activeUserId = null;
      return;
    }
    _activeUserId = uid;

    if (!_pluginAvailable) return;
    if (!kIsWeb && Platform.isIOS) {
      final apnsToken =
          await _safeMessagingCall<String?>(() => _messaging.getAPNSToken());
      if (apnsToken == null || apnsToken.isEmpty) {
        debugPrint(
            'APNS token ainda não disponível; pulando sync FCM por agora.');
        return;
      }
    }
    final token =
        await _safeMessagingCall<String?>(() => _messaging.getToken());
    if (token == null || token.isEmpty) return;
    await saveUserToken(token);
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
    await _messageOpenSub?.cancel();
    await _messageForegroundSub?.cancel();
    await _tokenRefreshSub?.cancel();
  }
}
