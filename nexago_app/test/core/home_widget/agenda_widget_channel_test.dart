import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/home_widget/agenda_widget_channel.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<MethodCall> calls;

  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel(agendaWidgetChannelName),
      (call) async {
        calls.add(call);
        return null;
      },
    );
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel(agendaWidgetChannelName),
      null,
    );
  });

  test('no Android grava o snapshot e não repete o mesmo', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final channel = AgendaWidgetChannel();

    await channel.saveSnapshot('{"v":1}');
    await channel.saveSnapshot('{"v":1}');
    await channel.saveSnapshot('{"v":1,"items":[]}');

    expect(calls.map((c) => c.method), [
      'saveAgendaSnapshot',
      'saveAgendaSnapshot',
    ]);
    expect(calls.first.arguments, {'json': '{"v":1}'});
  });

  test('no iOS ainda não grava (falta o App Group da extensão)', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;

    await AgendaWidgetChannel().saveSnapshot('{"v":1}');

    expect(calls, isEmpty);
  });

  test('falha do nativo não derruba o app e tenta de novo depois', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    var fail = true;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel(agendaWidgetChannelName),
      (call) async {
        calls.add(call);
        if (fail) throw PlatformException(code: 'io');
        return null;
      },
    );
    final channel = AgendaWidgetChannel();

    await channel.saveSnapshot('{"v":1}');
    fail = false;
    await channel.saveSnapshot('{"v":1}');

    expect(calls, hasLength(2));
  });
}
