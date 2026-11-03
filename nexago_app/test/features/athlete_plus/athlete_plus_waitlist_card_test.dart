import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete_plus/application/athlete_plus_providers.dart';
import 'package:nexago_app/features/athlete_plus/domain/athlete_plus_waitlist.dart';
import 'package:nexago_app/features/athlete_plus/presentation/widgets/athlete_plus_waitlist_card.dart';

import '../../support/recording_analytics.dart';

/// Dublê da lista de espera: o doc do atleta é um stream controlado pelo
/// teste, e `join`/`dismiss` o preenchem como o Firestore faria.
class _FakeRepo implements AthletePlusRepository {
  _FakeRepo({this.flag = true, this.failWrites = false});

  final bool flag;
  final bool failWrites;
  final entry = StreamController<AthletePlusWaitlistEntry?>.broadcast();
  AthletePlusWaitlistEntry? _current;
  final joins = <({
    String uid,
    Set<AthletePlusInterest> interests,
    AthletePlusPriceBand? band
  })>[];
  final dismissals = <String>[];

  @override
  Stream<bool> watchWaitlistEnabled() => Stream.value(flag);

  @override
  Stream<AthletePlusWaitlistEntry?> watchMyEntry(String uid) async* {
    yield _current;
    yield* entry.stream;
  }

  void _answer(AthletePlusWaitlistStatus status) {
    _current = AthletePlusWaitlistEntry(status: status);
    entry.add(_current);
  }

  @override
  Future<void> join({
    required String uid,
    required Set<AthletePlusInterest> interests,
    AthletePlusPriceBand? priceBand,
  }) async {
    if (failWrites) throw Exception('offline');
    joins.add((uid: uid, interests: {...interests}, band: priceBand));
    _answer(AthletePlusWaitlistStatus.joined);
  }

  @override
  Future<void> dismiss(String uid) async {
    if (failWrites) throw Exception('offline');
    dismissals.add(uid);
    _answer(AthletePlusWaitlistStatus.dismissed);
  }
}

/// Início mínima: um texto acima e abaixo para conferir que o card não ocupa
/// espaço quando some.
const _home = Scaffold(
  body: SingleChildScrollView(
    child: Column(
      children: [
        Text('acima', key: Key('acima')),
        AthletePlusWaitlistCard(),
        Text('abaixo', key: Key('abaixo')),
      ],
    ),
  ),
);

Future<RecordingAnalytics> _pump(
  WidgetTester tester,
  _FakeRepo repo, {
  String uid = 'atleta-1',
}) async {
  // Alta o bastante para a folha inteira caber sem rolar (a lista é preguiçosa).
  tester.view.physicalSize = const Size(390, 1500);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final analytics = RecordingAnalytics();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athletePlusUidProvider.overrideWith((ref) => uid),
        athletePlusRepositoryProvider.overrideWithValue(repo),
        analyticsServiceProvider.overrideWithValue(analytics),
      ],
      child: MaterialApp(theme: AppTheme.dark, home: _home),
    ),
  );
  await _settle(tester);
  return analytics;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 30; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void _expectNoSpace(WidgetTester tester) {
  expect(find.byKey(const Key('athlete-plus-card')), findsNothing);
  expect(
    tester.getTopLeft(find.byKey(const Key('abaixo'))).dy,
    tester.getBottomLeft(find.byKey(const Key('acima'))).dy,
  );
}

void main() {
  setUp(resetAthletePlusCardShownLog);

  testWidgets('flag desligada: card some sem ocupar espaço', (tester) async {
    await _pump(tester, _FakeRepo(flag: false));
    _expectNoSpace(tester);
  });

  testWidgets('deslogado: card some', (tester) async {
    await _pump(tester, _FakeRepo(), uid: '');
    _expectNoSpace(tester);
  });

  testWidgets('quem já respondeu não vê o card', (tester) async {
    final repo = _FakeRepo()
      .._current = const AthletePlusWaitlistEntry(
        status: AthletePlusWaitlistStatus.dismissed,
      );
    await _pump(tester, repo);
    _expectNoSpace(tester);
  });

  testWidgets('status desconhecido conta como respondido', (tester) async {
    expect(
      AthletePlusWaitlistEntry.fromMap(const {'status': 'subscribed'}).status,
      AthletePlusWaitlistStatus.dismissed,
    );
  });

  testWidgets(
      'flag ligada e sem resposta: card aparece e registra exibição '
      'uma vez', (tester) async {
    final analytics = await _pump(tester, _FakeRepo());
    expect(find.byKey(const Key('athlete-plus-card')), findsOneWidget);
    expect(find.text('nexaGO+'), findsOneWidget);
    expect(analytics.of(#logAthletePlusCardShown), hasLength(1));
  });

  testWidgets('"Agora não" grava dismissed e o card some', (tester) async {
    final repo = _FakeRepo();
    final analytics = await _pump(tester, repo);
    await tester.tap(find.byKey(const Key('athlete-plus-dismiss')));
    await _settle(tester);

    expect(repo.dismissals, ['atleta-1']);
    expect(analytics.of(#logAthletePlusCardDismissed), hasLength(1));
    _expectNoSpace(tester);
  });

  testWidgets('folha: entra na lista com interesses e faixa escolhidos', (
    tester,
  ) async {
    final repo = _FakeRepo();
    final analytics = await _pump(tester, repo);
    await tester.tap(find.byKey(const Key('athlete-plus-card')));
    await _settle(tester);
    expect(analytics.of(#logAthletePlusSheetOpened), hasLength(1));
    expect(find.text('nexaGO+ vem aí'), findsOneWidget);
    // A folha não promete número: preço e benefícios estão em definição.
    expect(find.textContaining('em definição'), findsOneWidget);

    await tester.tap(find.byKey(const Key('athlete-plus-interest-evolution')));
    await tester.tap(find.byKey(const Key('athlete-plus-interest-savings')));
    await tester.pump();
    await tester
        .ensureVisible(find.byKey(const Key('athlete-plus-price-up_to_20')));
    await tester.tap(find.byKey(const Key('athlete-plus-price-up_to_20')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('athlete-plus-join')));
    await _settle(tester);

    expect(repo.joins, hasLength(1));
    expect(repo.joins.single.uid, 'atleta-1');
    expect(repo.joins.single.interests, {
      AthletePlusInterest.savings,
      AthletePlusInterest.evolution,
    });
    expect(repo.joins.single.band, AthletePlusPriceBand.upTo20);

    final joined = analytics.of(#logAthletePlusWaitlistJoined).single;
    // Ordem do catálogo, não a dos toques.
    expect(joined.namedArguments[#interests], 'savings,evolution');
    expect(joined.namedArguments[#priceBand], 'up_to_20');

    expect(find.text('nexaGO+ vem aí'), findsNothing);
    expect(find.textContaining('Você está na lista'), findsOneWidget);
    _expectNoSpace(tester);
  });

  testWidgets('folha: entrar sem responder as perguntas opcionais', (
    tester,
  ) async {
    final repo = _FakeRepo();
    await _pump(tester, repo);
    await tester.tap(find.byKey(const Key('athlete-plus-card')));
    await _settle(tester);
    await tester.tap(find.byKey(const Key('athlete-plus-join')));
    await _settle(tester);

    expect(repo.joins.single.interests, isEmpty);
    expect(repo.joins.single.band, isNull);
  });

  testWidgets('falha ao gravar: folha fica aberta com texto amigável', (
    tester,
  ) async {
    await _pump(tester, _FakeRepo(failWrites: true));
    await tester.tap(find.byKey(const Key('athlete-plus-card')));
    await _settle(tester);
    await tester.tap(find.byKey(const Key('athlete-plus-join')));
    await _settle(tester);

    expect(find.text('nexaGO+ vem aí'), findsOneWidget);
    expect(
      find.textContaining('Não foi possível entrar na lista.'),
      findsOneWidget,
    );
    expect(find.textContaining('offline'), findsNothing);
  });
}
