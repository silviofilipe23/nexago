import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/homework_progress.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/homework_progress_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_homework_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_lesson_plans_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';

/// Feedback ter 20/10 21:00 em SP; "agora" qui 22/10 12:00.
final _sent = DateTime.utc(2026, 10, 21);
final _now = DateTime.utc(2026, 10, 22, 15);

LessonPlanView _view({LessonHomework? homework}) => LessonPlanView(
      id: 'v1',
      planId: 'tm_session_s1',
      professorUid: 'tm',
      professorName: 'Thiago Mendes',
      lessonTitle: 'Intermediário B',
      date: '2026-10-20',
      feedback: LessonViewFeedback(
        text: 'Joelho melhor',
        sentAt: _sent,
        homework: homework ??
            const LessonHomework(
              name: 'Lançamento + flexão',
              detail: 'Lança a bola à frente e só estica a perna quando cair.',
              sets: 3,
              daysTarget: 3,
              category: LessonPlanCategory.saque,
              videoUrl: 'https://v.example/x.mp4',
            ),
      ),
    );

class _FakeRepo implements HomeworkProgressRepository {
  final saved = <int>[];

  @override
  Future<void> save({required String viewId, required int setsDone}) async {
    saved.add(setsDone);
  }

  @override
  Stream<HomeworkProgress> watch(String viewId) =>
      Stream.value(const HomeworkProgress());
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('domínio', () {
    test('janela de 7 dias a partir do envio (calendário de SP)', () {
      final w = homeworkWindowDays(_sent);
      expect(w.first, '2026-10-20');
      expect(w.last, '2026-10-26');
      expect(homeworkOpenOn(_sent, '2026-10-26'), isTrue);
      expect(homeworkOpenOn(_sent, '2026-10-27'), isFalse);
    });

    test('dias completos e rodada', () {
      expect(homeworkDaysDone({'a': 3, 'b': 2, 'c': 4}, 3), 2);
      const p = HomeworkProgress(
        days: {'2026-10-21': 3},
        startKey: '2026-10-20',
        homeworkName: 'A',
      );
      expect(p.forRound('2026-10-20', 'A').days, isNotEmpty);
      expect(p.forRound('2026-10-22', 'A').days, isEmpty);
      expect(p.forRound('2026-10-20', 'B').days, isEmpty);
    });

    test('tarefa antiga (só nome e detalhe) ganha 3×3', () {
      final hw = LessonHomework.fromMap({'name': 'X', 'detail': 'y'})!;
      expect(hw.sets, 3);
      expect(hw.daysTarget, 3);
      expect(hw.category, isNull);
      expect(hw.videoUrl, isNull);
      final full = LessonHomework.fromMap({
        'name': 'X',
        'sets': 5,
        'daysTarget': 2,
        'category': 'saque',
        'videoUrl': 'http://inseguro',
      })!;
      expect(full.sets, 5);
      expect(full.category, LessonPlanCategory.saque);
      expect(full.videoUrl, isNull);
      expect(full.toMap()['sets'], 5);
    });
  });

  group('T9 · tela', () {
    Future<(_FakeRepo, List<Uri>)> pump(
      WidgetTester tester, {
      LessonPlanView? view,
      HomeworkProgress progress = const HomeworkProgress(),
      DateTime? now,
    }) async {
      tester.view.physicalSize = const Size(400, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final repo = _FakeRepo();
      final opened = <Uri>[];
      final router = GoRouter(
        initialLocation: '/treinos/tarefa/v1',
        routes: [
          GoRoute(
            path: AppRoutes.athleteTrainingHomework,
            name: AppRouteNames.athleteTrainingHomework,
            builder: (_, s) => AthleteTrainingHomeworkPage(
              viewId: s.pathParameters['viewId']!,
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          professorLinksUidProvider.overrideWithValue('me'),
          professorLinksClockProvider.overrideWithValue(() => now ?? _now),
          athleteLessonPlanViewProvider
              .overrideWith((ref, id) => Stream.value(view ?? _view())),
          homeworkProgressProvider
              .overrideWith((ref, id) => Stream.value(progress)),
          homeworkProgressRepositoryProvider.overrideWithValue(repo),
          homeworkVideoLauncherProvider.overrideWithValue((uri) async {
            opened.add(uri);
            return true;
          }),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      return (repo, opened);
    }

    testWidgets('marca as séries e conclui o dia', (tester) async {
      final (repo, opened) = await pump(
        tester,
        progress: const HomeworkProgress(
          days: {'2026-10-21': 3},
          startKey: '2026-10-20',
          homeworkName: 'Lançamento + flexão',
        ),
      );
      expect(find.text('PROF. THIAGO · ATÉ SEG 26'), findsOneWidget);
      expect(find.text('HOJE · 0 DE 3 SÉRIES'), findsOneWidget);
      expect(find.text('SEMANA · 1 DE 3 DIAS'), findsOneWidget);
      expect(find.text('Faltam 3 séries'), findsOneWidget);

      await tester.tap(find.byKey(const Key('homework-set-1')));
      await tester.pump();
      expect(find.text('Salvar 2 de 3'), findsOneWidget);
      await tester.tap(find.byKey(const Key('homework-set-2')));
      await tester.pump();
      expect(find.text('Concluir o dia'), findsOneWidget);
      expect(find.text('SEMANA · 2 DE 3 DIAS'), findsOneWidget);

      await tester.tap(find.byKey(const Key('homework-save')));
      await tester.pump();
      expect(repo.saved, [3]);

      await tester.tap(find.byKey(const Key('homework-video')));
      await tester.pump();
      expect(opened.single.toString(), 'https://v.example/x.mp4');
    });

    testWidgets('tocar na última série feita desmarca', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('homework-set-0')));
      await tester.pump();
      expect(find.text('HOJE · 1 DE 3 SÉRIES'), findsOneWidget);
      await tester.tap(find.byKey(const Key('homework-set-0')));
      await tester.pump();
      expect(find.text('HOJE · 0 DE 3 SÉRIES'), findsOneWidget);
    });

    testWidgets('prazo encerrado não deixa marcar', (tester) async {
      final (repo, _) = await pump(tester, now: DateTime.utc(2026, 10, 28, 15));
      expect(find.byKey(const Key('homework-closed')), findsOneWidget);
      expect(find.byKey(const Key('homework-set-0')), findsNothing);
      expect(find.text('Prazo encerrado'), findsWidgets);
      expect(repo.saved, isEmpty);
    });

    testWidgets('sem vídeo, sem cartão de vídeo', (tester) async {
      await pump(
        tester,
        view: _view(homework: const LessonHomework(name: 'Alongamento')),
      );
      expect(find.byKey(const Key('homework-video')), findsNothing);
      expect(find.text('Alongamento'), findsOneWidget);
    });
  });
}
