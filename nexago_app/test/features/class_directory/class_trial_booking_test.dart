import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/class_directory/application/class_directory_providers.dart';
import 'package:nexago_app/features/class_directory/domain/class_directory.dart';
import 'package:nexago_app/features/class_directory/domain/class_trial.dart';
import 'package:nexago_app/features/class_directory/infrastructure/class_directory_repository.dart';
import 'package:nexago_app/features/class_directory/presentation/class_trial_booking_page.dart';

final _arena = ClassProviderDetail.fromMap({
  'kind': 'arena',
  'id': 'cfc',
  'name': 'Arena CFC',
  'contactPhone': '62999990000',
  'trial': {'enabled': true, 'priceReais': 0, 'note': ''},
});

final _ct = ClassProviderDetail.fromMap({
  'kind': 'center',
  'id': 'elv',
  'name': 'CT Elevate',
  'trial': {'enabled': true, 'priceReais': 50, 'note': ''},
});

Map<String, Object?> _opt(String id, String classId, String date, String time,
        [String name = 'Iniciante']) =>
    {
      'sessionId': id,
      'classId': classId,
      'className': name,
      'date': date,
      'startTime': time,
      'endTime': '20:00',
      'level': 'iniciante',
      'teacherName': 'Thiago',
      'place': 'Quadra 2',
      'spotsLeft': 2,
    };

final _options = ClassTrialOptions.fromMap({
  'booking': 'app',
  'options': [
    _opt('s1', 'c1', '2026-10-22', '19:00'),
    _opt('s2', 'c2', '2026-10-22', '07:00', 'Manhã'),
    _opt('s3', 'c1', '2026-10-29', '19:00'),
  ],
});

class _FakeRepo implements ClassDirectoryRepository {
  final booked = <String>[];

  @override
  Future<void> bookArenaTrial(String sessionId) async => booked.add(sessionId);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('lógica', () {
    test('lê a resposta e agrupa por dia', () {
      expect(_options.bookInApp, isTrue);
      expect(_options.booked, isNull);
      expect(trialDays(_options.options), ['2026-10-22', '2026-10-29']);
      expect(
        trialOptionsOn(_options.options, '2026-10-22').map((o) => o.sessionId),
        ['s2', 's1'],
      );
      expect(initialTrialOption(_options.options, 'c2')?.sessionId, 's2');
      expect(initialTrialOption(_options.options, 'zz')?.sessionId, 's1');
      expect(initialTrialOption(const [], null), isNull);
      expect(trialOptionWhen(_options.options.first), 'Qui 22 · 19:00');
    });

    test('CT confirma pelo contato com dia e hora', () {
      final o = ClassTrialOptions.fromMap({
        'booking': 'contact',
        'options': [_opt('k1', 'k', '2026-10-22', '18:00', 'Kids')],
      });
      expect(o.bookInApp, isFalse);
      expect(
        classTrialContactMessage(_ct, o.options.first),
        contains('turma Kids, dia 22/10 às 18:00'),
      );
    });
  });

  Future<_FakeRepo> pump(
    WidgetTester tester,
    ClassProviderDetail detail,
    ClassTrialOptions options, {
    String? classId,
  }) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final repo = _FakeRepo();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        classDirectoryRepositoryProvider.overrideWithValue(repo),
        classTrialOptionsProvider.overrideWith((ref, key) async => options),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: ClassTrialBookingPage(detail: detail, classId: classId),
        ),
      ),
    ));
    await settle(tester);
    return repo;
  }

  testWidgets('arena: abre no 1º dia, troca de dia e agenda pelo app',
      (tester) async {
    final repo = await pump(tester, _arena, _options);
    expect(find.byKey(const Key('class-trial-day-2026-10-22')), findsOneWidget);
    expect(find.byKey(const Key('class-trial-option-s2')), findsOneWidget);
    expect(find.byKey(const Key('class-trial-option-s3')), findsNothing);
    expect(find.text('Agendar Qui 22 · 19:00'), findsOneWidget);

    await tester.tap(find.byKey(const Key('class-trial-option-s2')));
    await settle(tester);
    expect(find.text('Agendar Qui 22 · 07:00'), findsOneWidget);

    await tester.tap(find.byKey(const Key('class-trial-day-2026-10-29')));
    await settle(tester);
    expect(find.byKey(const Key('class-trial-option-s3')), findsOneWidget);
    await tester.tap(find.byKey(const Key('class-trial-submit')));
    await settle(tester);
    expect(repo.booked, ['s3']);
  });

  testWidgets('começa na turma escolhida no detalhe', (tester) async {
    await pump(tester, _arena, _options, classId: 'c2');
    expect(find.text('Agendar Qui 22 · 07:00'), findsOneWidget);
  });

  testWidgets('já marcada mostra a experimental, sem botão de agendar',
      (tester) async {
    final booked = ClassTrialOptions.fromMap({
      'booking': 'app',
      'options': const [],
      'booked': _opt('s1', 'c1', '2026-10-22', '19:00'),
    });
    await pump(tester, _arena, booked);
    expect(find.byKey(const Key('class-trial-booked')), findsOneWidget);
    expect(find.text('Qui 22 · 19:00'), findsOneWidget);
    expect(find.byKey(const Key('class-trial-submit')), findsNothing);
  });

  testWidgets('CT sem telefone: escolhe o horário, mas não confirma',
      (tester) async {
    final o = ClassTrialOptions.fromMap({
      'booking': 'contact',
      'options': [_opt('k1', 'k', '2026-10-22', '18:00', 'Kids')],
    });
    await pump(tester, _ct, o);
    expect(find.text('Confirmar pelo WhatsApp'), findsOneWidget);
    final button = tester.widget<FilledButton>(find.descendant(
      of: find.byKey(const Key('class-trial-submit')),
      matching: find.byType(FilledButton),
    ));
    expect(button.onPressed, isNull);
  });

  testWidgets('sem aula com vaga', (tester) async {
    await pump(
      tester,
      _arena,
      ClassTrialOptions.fromMap(const {'booking': 'app', 'options': []}),
    );
    expect(find.byKey(const Key('class-trial-empty')), findsOneWidget);
    expect(find.byKey(const Key('class-trial-submit')), findsNothing);
  });
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}
