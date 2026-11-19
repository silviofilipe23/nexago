import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/live_activity/next_match_live_activity_service.dart';

class _FakeBackend implements NextMatchLiveActivityBackend {
  NextMatchActivityStart? response;
  Object? error;
  final requests = <({String tournamentId, List<String> teamIds})>[];
  final tokens = <({String tournamentId, String token})>[];

  @override
  Future<NextMatchActivityStart?> requestStart({
    required String tournamentId,
    required List<String> teamIds,
  }) async {
    requests.add((tournamentId: tournamentId, teamIds: teamIds));
    final failure = error;
    if (failure != null) throw failure;
    return response;
  }

  @override
  Future<void> saveToken({
    required String tournamentId,
    required String liveActivityToken,
  }) async {
    tokens.add((tournamentId: tournamentId, token: liveActivityToken));
  }
}

const _state = <String, Object?>{
  'phase': 'scheduled',
  'matchId': 'm1',
  'courtLabel': 'Quadra 3',
  'courtShort': 'Q3',
  'opponent': 'Rafa / Bruno',
  'phaseLabel': 'Grupo A · Rodada 2',
  'scheduleTimeMs': 1795800000000,
  'day': [
    {'kind': 'next', 'label': '15:40'},
  ],
  'summary': null,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel(nextMatchLiveActivityChannelName);
  late List<MethodCall> calls;
  late bool activitiesEnabled;
  late _FakeBackend backend;
  late DateTime now;

  setUp(() {
    calls = [];
    activitiesEnabled = true;
    backend = _FakeBackend()
      ..response = NextMatchActivityStart.fromCallable({
        'attributes': {
          'tournamentId': 't1',
          'tournamentName': 'Copa Verão',
          'categoryName': 'Masculino B',
        },
        'state': _state,
      });
    now = DateTime(2026, 11, 21, 15, 16);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'isSupported') return activitiesEnabled;
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  NextMatchLiveActivityService service({bool supported = true}) =>
      NextMatchLiveActivityService(
        backend: backend,
        isSupportedPlatform: supported,
        clock: () => now,
      );

  Iterable<String> methods() => calls.map((c) => c.method);

  group('NextMatchActivityStart.fromCallable', () {
    test('sem estado (nada hoje) não inicia nada', () {
      expect(NextMatchActivityStart.fromCallable({'state': null}), isNull);
      expect(NextMatchActivityStart.fromCallable(null), isNull);
    });

    test('CONTRATO: o estado vai ao Swift como o JSON do servidor', () {
      final start = NextMatchActivityStart.fromCallable({
        'attributes': {'tournamentName': 'Copa Verão', 'categoryName': ''},
        'state': _state,
      })!;
      final args = start.toChannelArgs('t1');
      expect(args['tournamentId'], 't1');
      expect(args['tournamentName'], 'Copa Verão');
      expect(args['categoryName'], '');
      expect(jsonDecode(args['state']! as String), _state);
    });
  });

  group('startForFocus', () {
    test('pede o estado ao servidor e inicia a activity com ele', () async {
      final s = service();
      await s.startForFocus(tournamentId: ' t1 ', teamIds: {'team-1'});

      expect(backend.requests.single.tournamentId, 't1');
      expect(backend.requests.single.teamIds, ['team-1']);
      final start = calls.singleWhere((c) => c.method == 'startNextMatch');
      final args = start.arguments as Map;
      expect(args['tournamentId'], 't1');
      expect(jsonDecode(args['state'] as String), _state);
    });

    test('fora do iOS não fala com ninguém', () async {
      await service(supported: false)
          .startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      expect(calls, isEmpty);
      expect(backend.requests, isEmpty);
    });

    test('Live Activities desligadas no iPhone: nem chama o servidor', () async {
      activitiesEnabled = false;
      await service().startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      expect(backend.requests, isEmpty);
      expect(methods(), isNot(contains('startNextMatch')));
    });

    test('sem partida hoje (servidor devolve nada) não inicia', () async {
      backend.response = null;
      await service().startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      expect(methods(), isNot(contains('startNextMatch')));
    });

    test('sem dupla não pergunta nada', () async {
      await service().startForFocus(tournamentId: 't1', teamIds: const {});
      expect(backend.requests, isEmpty);
    });

    test('falha do servidor não quebra o Focus', () async {
      backend.error = Exception('offline');
      await service().startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      expect(methods(), isNot(contains('startNextMatch')));
    });

    test('reabrir o Focus em seguida não repete a chamada; depois do intervalo, sim',
        () async {
      final s = service();
      await s.startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      now = now.add(const Duration(seconds: 30));
      await s.startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      expect(backend.requests, hasLength(1));

      now = now.add(const Duration(minutes: 3));
      await s.startForFocus(tournamentId: 't1', teamIds: {'team-1'});
      expect(backend.requests, hasLength(2));
    });
  });

  group('token da activity', () {
    test('o iOS entrega o token e ele vai para o doc do torneio', () async {
      service();
      await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .handlePlatformMessage(
        nextMatchLiveActivityChannelName,
        const StandardMethodCodec().encodeMethodCall(
          const MethodCall('onPushToken', {'tournamentId': 't1', 'token': 'abc'}),
        ),
        (_) {},
      );
      expect(backend.tokens.single.tournamentId, 't1');
      expect(backend.tokens.single.token, 'abc');
    });

    test('ao nascer, o serviço volta a observar o token dos cards vivos', () {
      service();
      expect(methods(), contains('resumeNextMatch'));
    });
  });
}
