import 'dart:async';
import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'pix_live_activity_models.dart';

/// Canal com `LiveActivityChannel` (ios/Runner/LiveActivityChannel.swift).
const pixLiveActivityChannelName = 'nexago/live_activity';

/// Onde o token da activity vai parar para o servidor mandar os pushes.
abstract interface class PixLiveActivityStore {
  Future<void> saveToken({
    required String paymentId,
    required PixLiveActivityKind kind,
    required DateTime expiresAt,
    required String liveActivityToken,
  });

  /// Token trocado pelo iOS de uma activity que esta sessão não iniciou (app
  /// reaberto com o card vivo): só atualiza o doc que já existe.
  Future<void> refreshToken({
    required String paymentId,
    required String liveActivityToken,
  });

  Future<void> remove(String paymentId);
}

/// Live Activity do Pix pendente no iPhone (iOS 16.2+).
///
/// A tela do Pix chama [start] quando a cobrança nasce e [end] quando ela
/// mesma descobre o desfecho. Fora do iOS, ou com Live Activities desligadas
/// pelo atleta, tudo vira no-op: a activity é um extra, nunca pode quebrar o
/// pagamento.
class PixLiveActivityService {
  PixLiveActivityService({
    required PixLiveActivityStore store,
    MethodChannel channel = const MethodChannel(pixLiveActivityChannelName),
    bool? isSupportedPlatform,
  })  : _store = store,
        _channel = channel,
        _isSupportedPlatform =
            isSupportedPlatform ?? (!kIsWeb && Platform.isIOS) {
    if (!_isSupportedPlatform) return;
    _channel.setMethodCallHandler(_onNativeCall);
    // App reaberto com um card vivo: o Swift volta a observar o token dele.
    unawaited(_invoke('resumePix'));
  }

  final PixLiveActivityStore _store;
  final MethodChannel _channel;
  final bool _isSupportedPlatform;

  /// Activities pedidas nesta sessão, à espera do token do iOS.
  final Map<String, PixLiveActivityRequest> _requests = {};

  Future<void> start(PixLiveActivityRequest request) async {
    if (!_isSupportedPlatform || !request.isValid) return;
    final id = request.paymentId.trim();
    // O Swift aposenta o card de um Pix anterior: o doc dele sai junto, senão
    // a varredura ainda mandaria o "últimos 2 min" para um card que não existe.
    final retired = _requests.keys.where((key) => key != id).toList();
    for (final key in retired) {
      _requests.remove(key);
      await _store.remove(key);
    }
    _requests[id] = request;
    await _invoke('startPix', request.toChannelArgs());
  }

  Future<void> _invoke(String method, [Object? arguments]) async {
    try {
      await _channel.invokeMethod<Object?>(method, arguments);
    } on PlatformException catch (e) {
      debugPrint('PixLiveActivity: $method falhou (${e.code})');
    } on MissingPluginException {
      // Build sem a extensão (ex.: teste de widget).
    }
  }

  Future<void> end(String paymentId, PixLiveActivityOutcome outcome) async {
    final id = paymentId.trim();
    if (!_isSupportedPlatform || id.isEmpty) return;
    _requests.remove(id);
    await _invoke('endPix', {
      'paymentId': id,
      'phase': switch (outcome) {
        PixLiveActivityOutcome.paid => 'paid',
        PixLiveActivityOutcome.expired => 'expired',
        PixLiveActivityOutcome.dismissed => null,
      },
    });
    // Desistência: o servidor não tem mais nada a dizer a essa activity.
    if (outcome == PixLiveActivityOutcome.dismissed) {
      await _store.remove(id);
    }
  }

  Future<void> _onNativeCall(MethodCall call) async {
    if (call.method != 'onPushToken') return;
    final args = call.arguments;
    if (args is! Map) return;
    final paymentId = (args['paymentId'] as String? ?? '').trim();
    final token = (args['token'] as String? ?? '').trim();
    if (paymentId.isEmpty || token.isEmpty) return;
    final request = _requests[paymentId];
    if (request == null) {
      await _store.refreshToken(
        paymentId: paymentId,
        liveActivityToken: token,
      );
      return;
    }
    await _store.saveToken(
      paymentId: paymentId,
      kind: request.kind,
      expiresAt: request.expiresAt,
      liveActivityToken: token,
    );
  }
}

/// Grava em `pixLiveActivities/{uid}_{paymentId}` com o token FCM do aparelho — o
/// FCM exige os dois para entregar o push de Live Activity.
class FirestorePixLiveActivityStore implements PixLiveActivityStore {
  FirestorePixLiveActivityStore({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
    FirebaseMessaging? messaging,
  })  : _firestoreOverride = firestore,
        _authOverride = auth,
        _messagingOverride = messaging;

  // Preguiçosos: o provider nasce em telas que também rodam em teste de
  // widget, sem Firebase inicializado — e fora do iOS o store nem é usado.
  final FirebaseFirestore? _firestoreOverride;
  final FirebaseAuth? _authOverride;
  final FirebaseMessaging? _messagingOverride;

  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;
  FirebaseMessaging get _messaging =>
      _messagingOverride ?? FirebaseMessaging.instance;

  DocumentReference<Map<String, dynamic>> _ref(String uid, String paymentId) =>
      _firestore
          .collection(pixLiveActivitiesCollection)
          .doc(pixLiveActivityDocId(uid: uid, paymentId: paymentId));

  @override
  Future<void> saveToken({
    required String paymentId,
    required PixLiveActivityKind kind,
    required DateTime expiresAt,
    required String liveActivityToken,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      final fcmToken = (await _messaging.getToken())?.trim() ?? '';
      if (fcmToken.isEmpty) return;
      final ref = _ref(uid, paymentId);
      final snap = await ref.get();
      if (snap.exists) {
        await ref.update(pixLiveActivityTokenUpdate(
          fcmToken: fcmToken,
          liveActivityToken: liveActivityToken,
          serverTimestamp: FieldValue.serverTimestamp(),
        ));
        return;
      }
      await ref.set(pixLiveActivityCreateData(
        uid: uid,
        paymentId: paymentId,
        kind: kind,
        fcmToken: fcmToken,
        liveActivityToken: liveActivityToken,
        expiresAt: expiresAt,
        serverTimestamp: FieldValue.serverTimestamp(),
      ));
    } on FirebaseException catch (e) {
      // Sem o doc a activity segue contando sozinha; só perde os pushes.
      debugPrint('PixLiveActivity: token não gravado (${e.code})');
    }
  }

  @override
  Future<void> refreshToken({
    required String paymentId,
    required String liveActivityToken,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      final ref = _ref(uid, paymentId);
      if (!(await ref.get()).exists) return;
      final fcmToken = (await _messaging.getToken())?.trim() ?? '';
      if (fcmToken.isEmpty) return;
      await ref.update(pixLiveActivityTokenUpdate(
        fcmToken: fcmToken,
        liveActivityToken: liveActivityToken,
        serverTimestamp: FieldValue.serverTimestamp(),
      ));
    } on FirebaseException catch (e) {
      debugPrint('PixLiveActivity: token não renovado (${e.code})');
    }
  }

  @override
  Future<void> remove(String paymentId) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      await _ref(uid, paymentId).delete();
    } on FirebaseException catch (e) {
      debugPrint('PixLiveActivity: doc não apagado (${e.code})');
    }
  }
}

final pixLiveActivityServiceProvider = Provider<PixLiveActivityService>(
  (ref) => PixLiveActivityService(store: FirestorePixLiveActivityStore()),
);
