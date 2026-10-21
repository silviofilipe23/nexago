import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_story.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/class_session_detail_page.dart';
import 'package:nexago_app/features/athlete/presentation/class_story_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_timeline_widgets.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/class_story_card.dart';

const mariana = AthleteProfile(
  id: 'u1',
  name: 'Mariana Alves',
  sport: '',
  level: '',
  city: '',
  nickname: 'ma.beach',
);

String key(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

ClassAgendaEntry aula({
  required int daysFromToday,
  String role = 'student',
  String? mark = 'present',
}) {
  final day = DateTime.now().add(Duration(days: daysFromToday));
  return ClassAgendaEntry(
    sessionId: 's1',
    arenaId: 'a1',
    arenaName: 'Praia BT',
    classId: 'c1',
    className: 'Treino técnico',
    teacherName: 'Júnior Prado',
    courtName: 'Quadra central',
    date: key(day),
    startTime: '07:00',
    endTime: '08:30',
    startAt: null,
    status: 'completed',
    role: role,
    kind: 'regular',
    myMark: mark,
    classType: 'turma',
  );
}

List<Override> overrides() => [
      athleteProfileProvider.overrideWith((ref) => Stream.value(mariana)),
      myClassAgendaProvider.overrideWith((ref) async => const []),
      classStoryHistoryProvider.overrideWith((ref, _) async => const []),
    ];

Future<void> abrirAgenda(WidgetTester tester, ClassAgendaEntry e) async {
  tester.view.physicalSize = const Size(400, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides(),
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: ListView(
            children: [
              AgendaTimelineRow(
                row: AthleteAgendaTimelineRow.item(
                  mapClassEntryToAgendaItem(e)!,
                  isFirst: true,
                  isLast: true,
                ),
                highlightNextId: null,
                onCancelBooking: (_) async {},
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

const storyButton = Key('agenda-class-story-s1');

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('aula concluída: "Postar no story" abre o editor do treino', (
    tester,
  ) async {
    await abrirAgenda(tester, aula(daysFromToday: -1));

    expect(find.byKey(storyButton), findsOneWidget);
    await tester.tap(find.byKey(storyButton));
    await tester.pumpAndSettle();

    expect(find.byType(ClassStoryPage), findsOneWidget);
    // A frase é sorteada: qualquer uma da lista.
    expect(
      find.byWidgetPredicate(
        (w) => w is Text && kClassStoryHeadlines.contains(w.data),
      ),
      findsOneWidget,
    );
    expect(find.text('TREINO FEITO'), findsOneWidget);
    expect(find.text('AULA · TREINO TÉCNICO'), findsOneWidget);
    expect(
      find.textContaining('@ma.beach', findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining('com Prof. Júnior e a turma', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('duas aberturas seguidas não repetem a frase', (tester) async {
    await abrirAgenda(tester, aula(daysFromToday: -1));
    String headline() => tester
        .widget<Text>(
          find.byWidgetPredicate(
            (w) => w is Text && kClassStoryHeadlines.contains(w.data),
          ),
        )
        .data!;

    await tester.tap(find.byKey(storyButton));
    await tester.pumpAndSettle();
    final first = headline();
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(storyButton));
    await tester.pumpAndSettle();
    expect(headline(), isNot(first));
  });

  // Com a Sora real: nenhuma frase pode depender do FittedBox para caber.
  testWidgets('toda frase cabe nos 312 px da arte sem encolher', (
    tester,
  ) async {
    final sora = FontLoader('Sora')
      ..addFont(rootBundle.load('assets/fonts/Sora/Sora-Variable.ttf'));
    await sora.load();
    for (final h in kClassStoryHeadlines) {
      final painter = TextPainter(
        text: TextSpan(
          text: h,
          style: AppTypography.soraRegular(
            fontSize: 54,
            fontWeight: FontWeight.w800,
            letterSpacing: -2.16,
            height: 0.92,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      expect(painter.width, lessThanOrEqualTo(312), reason: h);
      expect(h.split('\n'), hasLength(2), reason: h);
      painter.dispose();
    }
  });

  testWidgets('desligar "Números" e "Coach e turma" tira os dois da arte', (
    tester,
  ) async {
    await abrirAgenda(tester, aula(daysFromToday: -1));
    await tester.tap(find.byKey(storyButton));
    await tester.pumpAndSettle();

    expect(find.text('DO MÊS'), findsOneWidget);
    await tester.tap(find.byKey(const Key('class-story-info-numbers')));
    await tester.tap(find.byKey(const Key('class-story-info-people')));
    await tester.pump();

    expect(find.text('DO MÊS'), findsNothing);
    expect(
      find.textContaining('com Prof. Júnior', findRichText: true),
      findsNothing,
    );
    expect(
      find.textContaining('Treino técnico · ', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('aula futura, com falta ou dada como professor: sem story', (
    tester,
  ) async {
    await abrirAgenda(tester, aula(daysFromToday: 2, mark: null));
    expect(find.byKey(storyButton), findsNothing);

    await abrirAgenda(tester, aula(daysFromToday: -1, mark: 'absent'));
    expect(find.byKey(storyButton), findsNothing);

    await abrirAgenda(tester, aula(daysFromToday: -1, role: 'teacher'));
    expect(find.byKey(storyButton), findsNothing);
  });

  testWidgets('toque no card do aluno abre o detalhe, com o story no rodapé', (
    tester,
  ) async {
    await abrirAgenda(tester, aula(daysFromToday: -1));
    await tester.tap(find.text('Treino técnico'));
    await tester.pumpAndSettle();

    expect(find.byType(ClassSessionDetailPage), findsOneWidget);
    expect(find.text('Treino do mês'), findsOneWidget);
    expect(find.text('Presença confirmada na chamada'), findsOneWidget);

    await tester.tap(find.byKey(const Key('class-detail-story')));
    await tester.pumpAndSettle();
    expect(find.byType(ClassStoryPage), findsOneWidget);
  });

  // Como no story da reserva: o PNG não pode sair transparente em nenhum fundo.
  for (final theme in BookingStoryTheme.values) {
    testWidgets('arte do treino com fundo ${theme.label} sai opaca', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final session = aula(daysFromToday: -1);
      final boundaryKey = GlobalKey();
      await tester.pumpWidget(
        Center(
          child: RepaintBoundary(
            key: boundaryKey,
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: ClassStoryCard(
                data: classStoryDataFrom(
                  session: session,
                  stats: classStoryStats(session, const []),
                  athleteName: 'Mariana Alves',
                ),
                theme: theme,
                infos: ClassStoryInfo.values.toSet(),
              ),
            ),
          ),
        ),
      );

      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(boundaryKey),
      );
      final alphas = await tester.runAsync(() async {
        final image = await boundary.toImage();
        final bytes = await image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        final w = image.width;
        final h = image.height;
        image.dispose();
        int alphaAt(int x, int y) => bytes!.getUint8((y * w + x) * 4 + 3);
        return [
          alphaAt(0, 0),
          alphaAt(w - 1, 0),
          alphaAt(w ~/ 2, h ~/ 2),
          alphaAt(0, h - 1),
          alphaAt(w - 1, h - 1),
        ];
      });
      expect(alphas, everyElement(255));
      expect(tester.takeException(), isNull);
    });
  }
}
