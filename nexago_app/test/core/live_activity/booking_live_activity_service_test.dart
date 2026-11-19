import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/live_activity/booking_live_activity_models.dart';
import 'package:nexago_app/core/live_activity/booking_live_activity_service.dart';

class _FakeStore implements BookingLiveActivityStore {
  final saved = <({String bookingId, String token})>[];
  final refreshed = <({String bookingId, String token})>[];
  final removed = <String>[];

  @override
  Future<void> saveToken({
    required BookingLiveActivityRequest request,
    required String liveActivityToken,
  }) async =>
      saved.add((bookingId: request.bookingId, token: liveActivityToken));

  @override
  Future<void> refreshToken({
    required String bookingId,
    required String liveActivityToken,
  }) async =>
      refreshed.add((bookingId: bookingId, token: liveActivityToken));

  @override
  Future<void> remove(String bookingId) async => removed.add(bookingId);
}

final _request = BookingLiveActivityRequest(
  bookingId: 'bk-1',
  arenaName: 'Arena Orla',
  courtName: 'Quadra 2',
  startAt: DateTime(2026, 11, 21, 19),
  endAt: DateTime(2026, 11, 21, 20),
  confirmed: 3,
);

BookingLiveActivityPlan _plan({
  BookingLiveActivityRequest? request,
  Set<String> canceled = const {},
}) =>
    BookingLiveActivityPlan(request: request, canceledBookingIds: canceled);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel(bookingLiveActivityChannelName);
  late List<MethodCall> calls;
  late bool hadActivity;
  late _FakeStore store;

  setUp(() {
    calls = [];
    hadActivity = true;
    store = _FakeStore();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'endBooking') return hadActivity;
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  BookingLiveActivityService service({bool supported = true}) =>
      BookingLiveActivityService(store: store, isSupportedPlatform: supported);

  Iterable<String> methods() => calls.map((c) => c.method);

  Future<void> deliverToken(String bookingId, String token) async {
    await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .handlePlatformMessage(
      bookingLiveActivityChannelName,
      const StandardMethodCodec().encodeMethodCall(
        MethodCall('onPushToken', {'bookingId': bookingId, 'token': token}),
      ),
      (_) {},
    );
  }

  test('ao nascer, volta a observar o token dos cards vivos', () {
    service();
    expect(methods(), ['resumeBooking']);
  });

  test('plano com reserva inicia o card com os argumentos do contrato', () async {
    await service().sync(_plan(request: _request));
    final start = calls.singleWhere((c) => c.method == 'startBooking');
    expect(start.arguments, _request.toChannelArgs());
  });

  test('o token entregue pelo iOS cria o doc da reserva pedida', () async {
    await service().sync(_plan(request: _request));
    await deliverToken('bk-1', 'tok');
    expect(store.saved.single.bookingId, 'bk-1');
    expect(store.saved.single.token, 'tok');
  });

  test('token de card que esta sessão não pediu só renova o doc', () async {
    service();
    await deliverToken('bk-velho', 'tok');
    expect(store.saved, isEmpty);
    expect(store.refreshed.single.bookingId, 'bk-velho');
  });

  test('reserva cancelada: tira o card e apaga o doc, uma vez só', () async {
    final s = service();
    await s.sync(_plan(canceled: {'bk-1'}));
    await s.sync(_plan(canceled: {'bk-1'}));
    expect(methods().where((m) => m == 'endBooking'), hasLength(1));
    expect(store.removed, ['bk-1']);
  });

  test('cancelada sem card na tela não mexe no Firestore', () async {
    hadActivity = false;
    await service().sync(_plan(canceled: {'bk-1'}));
    expect(store.removed, isEmpty);
  });

  test('todo sync acerta a etapa do card vivo pelo relógio antes de tudo', () async {
    final s = service();
    calls.clear();
    await s.sync(_plan(request: _request));
    expect(methods().first, 'settleBooking');
  });

  test('plano nulo (carregando) não faz nada', () async {
    final s = service();
    calls.clear();
    await s.sync(null);
    expect(calls, isEmpty);
  });

  test('fora do iOS não fala com ninguém', () async {
    await service(supported: false).sync(_plan(request: _request, canceled: {'x'}));
    expect(calls, isEmpty);
  });
}
