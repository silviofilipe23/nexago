import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../firebase/functions_region.dart';

/// Canal próprio da Live Activity da próxima partida
/// (`NextMatchLiveActivityChannel` em ios/Runner/LiveActivityChannel.swift).
///
/// Não divide o canal do Pix: o Flutter aceita um handler só por canal, e o
/// segundo serviço a registrar o dele roubaria os tokens do primeiro.
const nextMatchLiveActivityChannelName = 'nexago/live_activity_next_match';

/// Coleção que o servidor lê para mandar os pushes (`{uid}_{tournamentId}`).
const nextMatchActivitiesCollection = 'nextMatchActivities';

/// O que a callable `startNextMatchActivity` devolve para a activity nascer.
///
/// O estado vem pronto do servidor e segue como JSON até o Swift: o mesmo
/// construtor (`buildNextMatchState`) monta o estado inicial e os pushes, então
/// o texto do card não muda de forma no primeiro push.
class NextMatchActivityStart {
  const NextMatchActivityStart({
    required this.tournamentName,
    required this.categoryName,
    required this.state,
  });

  final String tournamentName;
  final String categoryName;
  final Map<String, Object?> state;

  /// `null` quando o servidor diz que não há o que mostrar hoje.
  static NextMatchActivityStart? fromCallable(Object? data) {
    if (data is! Map) return null;
    final state = data['state'];
    if (state is! Map) return null;
    final attributes = data['attributes'];
    final attrs = attributes is Map ? attributes : const {};
    return NextMatchActivityStart(
      tournamentName: (attrs['tournamentName'] as String? ?? '').trim(),
      categoryName: (attrs['categoryName'] as String? ?? '').trim(),
      state: Map<String, Object?>.from(state),
    );
  }

  /// CONTRATO com `NextMatchLiveActivityController.start` no Swift.
  Map<String, Object> toChannelArgs(String tournamentId) => {
        'tournamentId': tournamentId,
        'tournamentName': tournamentName,
        'categoryName': categoryName,
        'state': jsonEncode(state),
      };
}

/// O servidor: pede o estado inicial e guarda o token da activity.
abstract interface class NextMatchLiveActivityBackend {
  Future<NextMatchActivityStart?> requestStart({
    required String tournamentId,
    required List<String> teamIds,
  });

  Future<void> saveToken({
    required String tournamentId,
    required String liveActivityToken,
  });
}

/// Live Activity "minha próxima partida" no iPhone (iOS 16.2+).
///
/// O Focus chama [startForFocus] ao abrir; o servidor decide se há o que
/// mostrar hoje. Fora do iOS, ou com Live Activities desligadas, tudo vira
/// no-op: o card é um extra e nunca pode atrapalhar o Focus.
class NextMatchLiveActivityService {
  NextMatchLiveActivityService({
    required NextMatchLiveActivityBackend backend,
    MethodChannel channel =
        const MethodChannel(nextMatchLiveActivityChannelName),
    bool? isSupportedPlatform,
    DateTime Function()? clock,
  })  : _backend = backend,
        _channel = channel,
        _clock = clock ?? DateTime.now,
        _isSupportedPlatform =
            isSupportedPlatform ?? (!kIsWeb && Platform.isIOS) {
    if (!_isSupportedPlatform) return;
    _channel.setMethodCallHandler(_onNativeCall);
    // App reaberto com o card vivo: o Swift volta a observar o token dele.
    unawaited(_invoke<Object?>('resumeNextMatch'));
  }

  /// Reabrir o Focus logo em seguida (voltar de uma seção, trocar de aba) não
  /// precisa de outra ida ao servidor: o card já está vivo e o gatilho cuida
  /// das mudanças.
  static const restartCooldown = Duration(minutes: 2);

  final NextMatchLiveActivityBackend _backend;
  final MethodChannel _channel;
  final DateTime Function() _clock;
  final bool _isSupportedPlatform;

  final Map<String, DateTime> _lastStart = {};

  Future<void> startForFocus({
    required String tournamentId,
    required Set<String> teamIds,
  }) async {
    final id = tournamentId.trim();
    final teams = teamIds.map((t) => t.trim()).where((t) => t.isNotEmpty);
    if (!_isSupportedPlatform || id.isEmpty || teams.isEmpty) return;

    final now = _clock();
    final last = _lastStart[id];
    if (last != null && now.difference(last) < restartCooldown) return;
    _lastStart[id] = now;

    // Atleta que desligou Live Activities no iPhone: nem chama o servidor.
    if (await _invoke<bool>('isSupported') != true) return;

    final NextMatchActivityStart? start;
    try {
      start = await _backend.requestStart(
        tournamentId: id,
        teamIds: teams.toList(),
      );
    } on Exception catch (e) {
      debugPrint('NextMatchLiveActivity: estado não obtido ($e)');
      return;
    }
    if (start == null) return;
    await _invoke<Object?>('startNextMatch', start.toChannelArgs(id));
  }

  Future<T?> _invoke<T>(String method, [Object? arguments]) async {
    try {
      return await _channel.invokeMethod<T>(method, arguments);
    } on PlatformException catch (e) {
      debugPrint('NextMatchLiveActivity: $method falhou (${e.code})');
    } on MissingPluginException {
      // Build sem a extensão (ex.: teste de widget).
    }
    return null;
  }

  Future<void> _onNativeCall(MethodCall call) async {
    if (call.method != 'onPushToken') return;
    final args = call.arguments;
    if (args is! Map) return;
    final tournamentId = (args['tournamentId'] as String? ?? '').trim();
    final token = (args['token'] as String? ?? '').trim();
    if (tournamentId.isEmpty || token.isEmpty) return;
    await _backend.saveToken(
      tournamentId: tournamentId,
      liveActivityToken: token,
    );
  }
}

/// Callable `startNextMatchActivity` + tokens em
/// `nextMatchActivities/{uid}_{tournamentId}` (a regra libera só os tokens).
class FirebaseNextMatchLiveActivityBackend
    implements NextMatchLiveActivityBackend {
  FirebaseNextMatchLiveActivityBackend({
    FirebaseFunctions? functions,
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
    FirebaseMessaging? messaging,
  })  : _functionsOverride = functions,
        _firestoreOverride = firestore,
        _authOverride = auth,
        _messagingOverride = messaging;

  // Preguiçosos: o provider nasce no Focus, que também roda em teste de
  // widget sem Firebase inicializado — e fora do iOS nada disto é usado.
  final FirebaseFunctions? _functionsOverride;
  final FirebaseFirestore? _firestoreOverride;
  final FirebaseAuth? _authOverride;
  final FirebaseMessaging? _messagingOverride;

  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;
  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;
  FirebaseMessaging get _messaging =>
      _messagingOverride ?? FirebaseMessaging.instance;

  @override
  Future<NextMatchActivityStart?> requestStart({
    required String tournamentId,
    required List<String> teamIds,
  }) async {
    final result = await _functions
        .httpsCallable('startNextMatchActivity')
        .call<Object?>({'tournamentId': tournamentId, 'teamIds': teamIds});
    return NextMatchActivityStart.fromCallable(result.data);
  }

  @override
  Future<void> saveToken({
    required String tournamentId,
    required String liveActivityToken,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      final ref = _firestore
          .collection(nextMatchActivitiesCollection)
          .doc('${uid}_$tournamentId');
      // Quem cria o doc é a callable; sem ele não há o que atualizar.
      if (!(await ref.get()).exists) return;
      final fcmToken = (await _messaging.getToken())?.trim() ?? '';
      if (fcmToken.isEmpty) return;
      await ref.update({
        'fcmToken': fcmToken,
        'liveActivityToken': liveActivityToken,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      // Sem o token o card segue contando sozinho; só perde as atualizações.
      debugPrint('NextMatchLiveActivity: token não gravado (${e.code})');
    }
  }
}

final nextMatchLiveActivityServiceProvider =
    Provider<NextMatchLiveActivityService>(
  (ref) => NextMatchLiveActivityService(
    backend: FirebaseNextMatchLiveActivityBackend(),
  ),
);
