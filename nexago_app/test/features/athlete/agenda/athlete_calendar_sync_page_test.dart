import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/data/athlete_calendar_feed_repository.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_calendar_sync_page.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';

const _url =
    'https://southamerica-east1-p.cloudfunctions.net/athleteCalendarFeed?u=u1&t=abc';
const _rotated =
    'https://southamerica-east1-p.cloudfunctions.net/athleteCalendarFeed?u=u1&t=novo';

class _FakeFeedRepository implements AthleteCalendarFeedRepository {
  _FakeFeedRepository({this.fail = false});

  final bool fail;
  final calls = <bool>[];

  @override
  Future<String> configure({bool rotate = false}) async {
    calls.add(rotate);
    if (fail) {
      throw const AthleteCalendarFeedException(
        'Não foi possível ligar a assinatura do calendário.',
      );
    }
    return rotate ? _rotated : _url;
  }
}

Future<({_FakeFeedRepository repo, List<Uri> opened})> _pump(
  WidgetTester tester, {
  bool fail = false,
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = _FakeFeedRepository(fail: fail);
  final opened = <Uri>[];
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteCalendarFeedRepositoryProvider.overrideWithValue(repo),
        athleteCalendarOpenerProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const AthleteCalendarSyncPage(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return (repo: repo, opened: opened);
}

void main() {
  testWidgets('abrir a tela liga o feed e mostra o link', (tester) async {
    final r = await _pump(tester);

    expect(r.repo.calls, [false]);
    expect(find.text(_url), findsOneWidget);
    expect(find.text('Google Agenda'), findsOneWidget);
    expect(find.text('Apple Calendário'), findsOneWidget);
    expect(find.text('Outlook'), findsOneWidget);
  });

  testWidgets('copiar põe o link na área de transferência', (tester) async {
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    await _pump(tester);

    await tester.tap(find.byKey(const Key('athlete-calendar-copy')));
    await tester.pump();

    expect(copied, [_url]);
    expect(find.text('Link copiado.'), findsOneWidget);
  });

  testWidgets('Apple abre por webcal e Google pela URL de adicionar', (
    tester,
  ) async {
    final r = await _pump(tester);

    await tester.tap(find.byKey(const Key('athlete-calendar-open-apple')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('athlete-calendar-open-google')));
    await tester.pump();

    expect(r.opened.map((u) => u.toString()), [
      professorWebcalUrl(_url),
      professorGoogleCalendarUrl(_url),
    ]);
  });

  testWidgets('gerar novo link pede confirmação e troca o link', (
    tester,
  ) async {
    final r = await _pump(tester);

    await tester
        .ensureVisible(find.byKey(const Key('athlete-calendar-rotate')));
    await tester.tap(find.byKey(const Key('athlete-calendar-rotate')));
    await tester.pumpAndSettle();
    expect(find.text('Gerar novo link?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('athlete-calendar-rotate-confirm')));
    await tester.pumpAndSettle();

    expect(r.repo.calls, [false, true]);
    expect(find.text(_rotated), findsOneWidget);
  });

  testWidgets('falha ao ligar mostra a mensagem e tenta de novo', (
    tester,
  ) async {
    final r = await _pump(tester, fail: true);

    expect(
      find.text('Não foi possível ligar a assinatura do calendário.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Tentar de novo'));
    await tester.pump();
    expect(r.repo.calls, [false, false]);
  });

  test('Outlook leva o nome do calendário do atleta', () {
    expect(
      professorOutlookCalendarUrl(_url, name: 'Agenda nexaGO'),
      endsWith('&name=Agenda%20nexaGO'),
    );
    expect(professorOutlookCalendarUrl(_url), endsWith('&name=Aulas%20nexaGO'));
  });
}
