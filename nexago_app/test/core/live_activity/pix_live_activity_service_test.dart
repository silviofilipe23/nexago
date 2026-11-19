import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/live_activity/pix_live_activity_models.dart';
import 'package:nexago_app/core/live_activity/pix_live_activity_service.dart';

class _SavedToken {
  _SavedToken(this.paymentId, this.kind, this.expiresAt, this.token);
  final String paymentId;
  final PixLiveActivityKind kind;
  final DateTime expiresAt;
  final String token;
}

class _FakeStore implements PixLiveActivityStore {
  final saved = <_SavedToken>[];
  final refreshed = <(String, String)>[];
  final removed = <String>[];

  @override
  Future<void> refreshToken({
    required String paymentId,
    required String liveActivityToken,
  }) async {
    refreshed.add((paymentId, liveActivityToken));
  }

  @override
  Future<void> saveToken({
    required String paymentId,
    required PixLiveActivityKind kind,
    required DateTime expiresAt,
    required String liveActivityToken,
  }) async {
    saved.add(_SavedToken(paymentId, kind, expiresAt, liveActivityToken));
  }

  @override
  Future<void> remove(String paymentId) async => removed.add(paymentId);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(pixLiveActivityChannelName);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  late List<MethodCall> calls;
  late int resumes;
  late _FakeStore store;

  final createdAt = DateTime(2026, 11, 19, 14, 18);
  final expiresAt = createdAt.add(const Duration(minutes: 15));

  PixLiveActivityRequest request({String paymentId = 'pay_1'}) {
    return PixLiveActivityRequest(
      paymentId: paymentId,
      kind: PixLiveActivityKind.booking,
      amountReais: 120,
      summary: 'Reserva · Arena Sol',
      detail: 'Sáb, 21/11 · 9h',
      createdAt: createdAt,
      expiresAt: expiresAt,
    );
  }

  /// Simula o Swift chamando o Dart (`invokeMethod("onPushToken")`).
  Future<void> nativeSendsToken(String paymentId, String token) async {
    await messenger.handlePlatformMessage(
      pixLiveActivityChannelName,
      const StandardMethodCodec().encodeMethodCall(
        MethodCall('onPushToken', {'paymentId': paymentId, 'token': token}),
      ),
      (_) {},
    );
  }

  setUp(() {
    calls = [];
    resumes = 0;
    store = _FakeStore();
    messenger.setMockMethodCallHandler(channel, (call) async {
      // O `resumePix` do construtor é conferido à parte.
      if (call.method == 'resumePix') {
        resumes++;
        return null;
      }
      calls.add(call);
      return call.method == 'startPix' ? 'activity-1' : null;
    });
  });

  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test('ao nascer no iOS pede ao Swift para retomar cards vivos', () async {
    PixLiveActivityService(store: store, isSupportedPlatform: true);
    await Future<void>.delayed(Duration.zero);

    expect(resumes, 1);
  });

  test('novo Pix aposenta o doc do anterior desta sessão', () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);

    await service.start(request(paymentId: 'pay_1'));
    await service.start(request(paymentId: 'pay_2'));
    await service.start(request(paymentId: 'pay_2'));

    expect(store.removed, ['pay_1']);
  });

  test('inicia a activity no iOS com os argumentos do contrato', () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);

    await service.start(request());

    expect(calls.single.method, 'startPix');
    expect(calls.single.arguments, request().toChannelArgs());
  });

  test('fora do iOS não fala com o nativo', () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: false);

    await service.start(request());
    await service.end('pay_1', PixLiveActivityOutcome.paid);

    expect(calls, isEmpty);
    expect(resumes, 0);
    expect(store.removed, isEmpty);
  });

  test('pedido inválido não inicia nada', () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);

    await service.start(request(paymentId: ''));

    expect(calls, isEmpty);
  });

  test('token do iOS vai para o store com a origem e o prazo do pedido',
      () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);
    await service.start(request());

    await nativeSendsToken('pay_1', 'abc123');

    expect(store.saved, hasLength(1));
    expect(store.saved.single.paymentId, 'pay_1');
    expect(store.saved.single.kind, PixLiveActivityKind.booking);
    expect(store.saved.single.expiresAt, expiresAt);
    expect(store.saved.single.token, 'abc123');
  });

  test('token de card vivo de outra sessão (app reaberto) só renova o doc',
      () async {
    PixLiveActivityService(store: store, isSupportedPlatform: true);

    await nativeSendsToken('pay_antigo', 'abc123');

    expect(store.saved, isEmpty);
    expect(store.refreshed, [('pay_antigo', 'abc123')]);
  });

  test('pago e expirado encerram com a fase; o doc fica para o servidor',
      () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);

    await service.end('pay_1', PixLiveActivityOutcome.paid);
    await service.end('pay_2', PixLiveActivityOutcome.expired);

    expect(calls.map((c) => c.arguments), [
      {'paymentId': 'pay_1', 'phase': 'paid'},
      {'paymentId': 'pay_2', 'phase': 'expired'},
    ]);
    expect(store.removed, isEmpty);
  });

  test('desistência some com o card na hora e apaga o doc', () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);

    await service.end('pay_1', PixLiveActivityOutcome.dismissed);

    expect(calls.single.arguments, {'paymentId': 'pay_1', 'phase': null});
    expect(store.removed, ['pay_1']);
  });

  test('depois de encerrar, token atrasado não recria o doc', () async {
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);
    await service.start(request());
    await service.end('pay_1', PixLiveActivityOutcome.dismissed);

    await nativeSendsToken('pay_1', 'abc123');

    expect(store.saved, isEmpty, reason: 'só renova o doc, nunca recria');
  });

  test('falha do nativo não estoura na tela do pagamento', () async {
    messenger.setMockMethodCallHandler(channel, (call) async {
      throw PlatformException(code: 'start_failed');
    });
    final service =
        PixLiveActivityService(store: store, isSupportedPlatform: true);

    await expectLater(service.start(request()), completes);
    await expectLater(
      service.end('pay_1', PixLiveActivityOutcome.paid),
      completes,
    );
  });
}
