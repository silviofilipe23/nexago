import 'dart:async';
import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/arenas/domain/my_bookings_providers.dart';
import '../../features/athlete/domain/agenda/athlete_agenda_logic.dart';
import '../auth/active_role_providers.dart';
import '../auth/app_mobile_role.dart';
import '../auth/auth_providers.dart';
import 'booking_live_activity_models.dart';

/// Canal próprio da Live Activity da reserva
/// (`BookingLiveActivityChannel` em ios/Runner/LiveActivityChannel.swift).
/// Não divide o canal do Pix nem o da próxima partida: o Flutter aceita um
/// handler só por canal.
const bookingLiveActivityChannelName = 'nexago/live_activity_booking';

/// Onde o token da activity vai parar para o servidor mandar as viradas.
abstract interface class BookingLiveActivityStore {
  Future<void> saveToken({
    required BookingLiveActivityRequest request,
    required String liveActivityToken,
  });

  /// Token trocado pelo iOS de uma activity que esta sessão não iniciou (app
  /// reaberto com o card vivo): só atualiza o doc que já existe.
  Future<void> refreshToken({
    required String bookingId,
    required String liveActivityToken,
  });

  Future<void> remove(String bookingId);
}

/// Live Activity da reserva no iPhone (iOS 16.2+): nasce quando o app abre até
/// 2 horas antes de uma reserva confirmada ([sync] com o plano da Agenda).
/// Fora do iOS, ou com Live Activities desligadas, tudo vira no-op.
class BookingLiveActivityService {
  BookingLiveActivityService({
    required BookingLiveActivityStore store,
    MethodChannel channel = const MethodChannel(bookingLiveActivityChannelName),
    bool? isSupportedPlatform,
  })  : _store = store,
        _channel = channel,
        _isSupportedPlatform =
            isSupportedPlatform ?? (!kIsWeb && Platform.isIOS) {
    if (!_isSupportedPlatform) return;
    _channel.setMethodCallHandler(_onNativeCall);
    // App reaberto com o card vivo: o Swift volta a observar o token dele.
    unawaited(_invoke<Object?>('resumeBooking'));
  }

  final BookingLiveActivityStore _store;
  final MethodChannel _channel;
  final bool _isSupportedPlatform;

  /// Pedidas nesta sessão, à espera do token do iOS.
  final Map<String, BookingLiveActivityRequest> _requests = {};

  /// Canceladas já tiradas da tela nesta sessão (não repete a cada sync).
  final Set<String> _ended = {};

  /// Leva o card ao plano: tira o de reserva cancelada e liga o da reserva
  /// das próximas 2 horas. Chamado a cada mudança nas reservas e ao voltar
  /// ao app.
  Future<void> sync(BookingLiveActivityPlan? plan) async {
    if (!_isSupportedPlatform || plan == null) return;

    // O card vivo acompanha o relógio quando o app abre: começou → "em
    // quadra"; acabou → "fim de jogo" por 30 min. Sem a chave .p8 (sem push),
    // é isto que troca a etapa — o redesenho por `staleDate` não é garantido.
    await _invoke<Object?>('settleBooking');

    for (final id in plan.canceledBookingIds) {
      if (!_ended.add(id)) continue;
      _requests.remove(id);
      final ended = await _invoke<bool>('endBooking', {'bookingId': id});
      if (ended == true) await _store.remove(id);
    }

    final request = plan.request;
    if (request == null) return;
    _requests[request.bookingId] = request;
    // O Swift reaproveita o card vivo da mesma reserva e aposenta os outros.
    await _invoke<Object?>('startBooking', request.toChannelArgs());
  }

  Future<T?> _invoke<T>(String method, [Object? arguments]) async {
    try {
      return await _channel.invokeMethod<T>(method, arguments);
    } on PlatformException catch (e) {
      debugPrint('BookingLiveActivity: $method falhou (${e.code})');
    } on MissingPluginException {
      // Build sem a extensão (ex.: teste de widget).
    }
    return null;
  }

  Future<void> _onNativeCall(MethodCall call) async {
    if (call.method != 'onPushToken') return;
    final args = call.arguments;
    if (args is! Map) return;
    final bookingId = (args['bookingId'] as String? ?? '').trim();
    final token = (args['token'] as String? ?? '').trim();
    if (bookingId.isEmpty || token.isEmpty) return;
    final request = _requests[bookingId];
    if (request == null) {
      await _store.refreshToken(bookingId: bookingId, liveActivityToken: token);
      return;
    }
    await _store.saveToken(request: request, liveActivityToken: token);
  }
}

/// Grava em `bookingLiveActivities/{uid}_{bookingId}` com o token FCM do
/// aparelho — o FCM exige os dois para entregar o push de Live Activity.
class FirestoreBookingLiveActivityStore implements BookingLiveActivityStore {
  FirestoreBookingLiveActivityStore({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
    FirebaseMessaging? messaging,
  })  : _firestoreOverride = firestore,
        _authOverride = auth,
        _messagingOverride = messaging;

  // Preguiçosos: o provider nasce no app inteiro, inclusive em teste de widget
  // sem Firebase — e fora do iOS o store nem é usado.
  final FirebaseFirestore? _firestoreOverride;
  final FirebaseAuth? _authOverride;
  final FirebaseMessaging? _messagingOverride;

  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;
  FirebaseMessaging get _messaging =>
      _messagingOverride ?? FirebaseMessaging.instance;

  DocumentReference<Map<String, dynamic>> _ref(String uid, String bookingId) =>
      _firestore
          .collection(bookingLiveActivitiesCollection)
          .doc(bookingLiveActivityDocId(uid: uid, bookingId: bookingId));

  @override
  Future<void> saveToken({
    required BookingLiveActivityRequest request,
    required String liveActivityToken,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      final fcmToken = (await _messaging.getToken())?.trim() ?? '';
      if (fcmToken.isEmpty) return;
      final ref = _ref(uid, request.bookingId);
      final snap = await ref.get();
      // Reserva remarcada: o doc antigo guarda o horário velho, e a regra só
      // deixa o app trocar tokens — apaga e cria de novo com o horário certo.
      if (snap.exists && !_sameWindow(snap.data(), request)) {
        await ref.delete();
      } else if (snap.exists) {
        await ref.update({
          'fcmToken': fcmToken,
          'liveActivityToken': liveActivityToken,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        return;
      }
      await ref.set(bookingLiveActivityCreateData(
        uid: uid,
        request: request,
        fcmToken: fcmToken,
        liveActivityToken: liveActivityToken,
        serverTimestamp: FieldValue.serverTimestamp(),
      ));
    } on FirebaseException catch (e) {
      // Sem o doc o card segue contando sozinho; só perde as viradas por push.
      debugPrint('BookingLiveActivity: token não gravado (${e.code})');
    }
  }

  static bool _sameWindow(
    Map<String, dynamic>? data,
    BookingLiveActivityRequest request,
  ) {
    final start = data?['startAt'];
    final end = data?['endAt'];
    return start is Timestamp &&
        end is Timestamp &&
        start.millisecondsSinceEpoch == request.startAt.millisecondsSinceEpoch &&
        end.millisecondsSinceEpoch == request.endAt.millisecondsSinceEpoch;
  }

  @override
  Future<void> refreshToken({
    required String bookingId,
    required String liveActivityToken,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      final ref = _ref(uid, bookingId);
      if (!(await ref.get()).exists) return;
      final fcmToken = (await _messaging.getToken())?.trim() ?? '';
      if (fcmToken.isEmpty) return;
      await ref.update({
        'fcmToken': fcmToken,
        'liveActivityToken': liveActivityToken,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      debugPrint('BookingLiveActivity: token não renovado (${e.code})');
    }
  }

  @override
  Future<void> remove(String bookingId) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    try {
      await _ref(uid, bookingId).delete();
    } on FirebaseException catch (e) {
      debugPrint('BookingLiveActivity: doc não apagado (${e.code})');
    }
  }
}

final bookingLiveActivityServiceProvider = Provider<BookingLiveActivityService>(
  (ref) => BookingLiveActivityService(store: FirestoreBookingLiveActivityStore()),
);

/// O plano do card a partir das reservas do atleta (dono e convidado).
/// `null` enquanto carrega ou fora do papel de atleta: o card fica como está.
final bookingLiveActivityPlanProvider =
    Provider.autoDispose<BookingLiveActivityPlan?>((ref) {
  final auth = ref.watch(authProvider);
  if (auth.valueOrNull == null) return null;
  if (ref.watch(activeMobileRoleProvider) != AppMobileRole.athlete) return null;
  final own = ref.watch(myBookingsStreamProvider);
  if (!own.hasValue) return null;
  final bookings = mergeOwnAndGuestBookings(
    own.value ?? const [],
    ref.watch(myGuestBookingsStreamProvider).valueOrNull ?? const [],
  );
  return planBookingLiveActivity(bookings, now: DateTime.now());
});
