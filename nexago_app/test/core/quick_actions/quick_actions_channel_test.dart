import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';
import 'package:nexago_app/core/quick_actions/quick_actions_channel.dart';

const _channel = MethodChannel(quickActionsChannelName);

const _reservar = QuickActionItem(
  type: 'nexago.quick.reservar',
  title: 'Reservar quadra',
  sfSymbol: 'plus.circle',
);

const _mensagens = QuickActionItem(
  type: 'nexago.quick.mensagens',
  title: 'Mensagens',
  subtitle: '2 não lidas',
  sfSymbol: 'bubble.left.and.bubble.right',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  late List<MethodCall> calls;
  Object? Function(MethodCall call) reply = (_) => null;

  setUp(() {
    calls = [];
    reply = (_) => null;
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    messenger.setMockMethodCallHandler(_channel, (call) async {
      calls.add(call);
      return reply(call);
    });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    messenger.setMockMethodCallHandler(_channel, null);
  });

  group('setItems', () {
    test('manda os itens no formato do lado nativo', () async {
      await QuickActionsChannel().setItems(const [_reservar, _mensagens]);

      expect(calls.single.method, 'setItems');
      expect(calls.single.arguments, [
        _reservar.toChannelMap(),
        _mensagens.toChannelMap(),
      ]);
    });

    test('não regrava a mesma lista', () async {
      final channel = QuickActionsChannel();

      await channel.setItems(const [_reservar]);
      await channel.setItems(const [_reservar]);
      await channel.setItems(const [_reservar, _mensagens]);

      expect(calls.length, 2);
    });

    test('regrava depois de uma falha do lado nativo', () async {
      final channel = QuickActionsChannel();
      reply = (_) => throw PlatformException(code: 'boom');

      await channel.setItems(const [_reservar]);
      reply = (_) => null;
      await channel.setItems(const [_reservar]);

      expect(calls.length, 2);
    });

    test('fora do iOS não chama o canal', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      await QuickActionsChannel().setItems(const [_reservar]);

      expect(calls, isEmpty);
    });

    test('sem o canal (build de teste) não quebra', () async {
      messenger.setMockMethodCallHandler(_channel, null);

      await expectLater(
        QuickActionsChannel().setItems(const [_reservar]),
        completes,
      );
    });
  });

  group('takePendingAction', () {
    test('devolve o toque guardado pelo lado nativo', () async {
      reply = (_) => {
            'type': 'nexago.quick.booking',
            'payload': {'bookingId': 'bk-1', 'validUntil': '123'},
          };

      final tap = await QuickActionsChannel().takePendingAction();

      expect(calls.single.method, 'takePendingAction');
      expect(tap?.type, 'nexago.quick.booking');
      expect(tap?.payload, {'bookingId': 'bk-1', 'validUntil': '123'});
    });

    test('sem toque pendente devolve null', () async {
      expect(await QuickActionsChannel().takePendingAction(), isNull);
    });

    test('ignora valores que não são texto no payload', () async {
      reply = (_) => {
            'type': 'nexago.quick.focus',
            'payload': {'tournamentId': 'cup-1', 'n': 3},
          };

      final tap = await QuickActionsChannel().takePendingAction();

      expect(tap?.payload, {'tournamentId': 'cup-1'});
    });

    test('tipo vazio devolve null', () async {
      reply = (_) => {'type': ' '};

      expect(await QuickActionsChannel().takePendingAction(), isNull);
    });
  });

  test('avisa quando o lado nativo recebe um toque', () async {
    var notified = 0;
    QuickActionsChannel().listen(() => notified++);

    await messenger.handlePlatformMessage(
      quickActionsChannelName,
      const StandardMethodCodec().encodeMethodCall(
        const MethodCall('actionAvailable'),
      ),
      (_) {},
    );

    expect(notified, 1);
  });
}
