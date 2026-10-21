import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_homework.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';

import 'professor_agenda_test_support.dart' show agendaNow;
import 'professor_homework_test_support.dart';
import 'professor_lesson_plans_test_support.dart';
import 'professor_students_test_support.dart';

// Hoje = 20/10 (agendaNow). Feedback enviado 19/10 às 20h em SP:
// a semana da tarefa vai de 19 a 25/10.
final _sentAt = DateTime.utc(2026, 10, 19, 23);
const _refId = 'class_c1_2026-10-19';
final _planId = lessonPlanId(lessonPlanUid, LessonPlanKind.session, _refId);
const _hw = LessonHomework(name: 'Saque por baixo', sets: 3, daysTarget: 3);

String _text(WidgetTester tester, Key key) =>
    tester.widget<Text>(find.byKey(key)).data!;

void main() {
  group('domínio', () {
    test('junta a tarefa ao progresso da mesma rodada', () {
      final w = professorHomeworkWeek(
        viewId: 'v',
        homework: _hw,
        sentAt: _sentAt,
        progress: homeworkProgress(
          planId: 'p',
          athleteId: 'a',
          startKey: '2026-10-19',
          days: const {'2026-10-19': 3, '2026-10-20': 1, '2026-10-21': 3},
        ),
      );
      expect(w.windowDays.first, '2026-10-19');
      expect(w.windowDays.last, '2026-10-25');
      expect(w.daysDone, 2);
      expect(w.complete, isFalse);
      expect(w.openOn('2026-10-25'), isTrue);
      expect(w.openOn('2026-10-26'), isFalse);
    });

    test('progresso de outra rodada (outro exercício ou outro envio) zera', () {
      for (final p in [
        homeworkProgress(
          planId: 'p',
          athleteId: 'a',
          startKey: '2026-10-12',
          days: const {'2026-10-12': 3},
        ),
        homeworkProgress(
          planId: 'p',
          athleteId: 'a',
          startKey: '2026-10-19',
          name: 'Outro exercício',
          days: const {'2026-10-19': 3},
        ),
      ]) {
        final w = professorHomeworkWeek(
          viewId: 'v',
          homework: _hw,
          sentAt: _sentAt,
          progress: p,
        );
        expect(w.daysDone, 0);
        expect(w.days, isEmpty);
      }
    });

    test('lê o documento como a callable grava', () {
      final p = ProfessorHomeworkProgress.fromMap('p_a', {
        'athleteId': 'a',
        'professorUid': 'prof',
        'planId': 'p',
        'homeworkName': 'Saque por baixo',
        'sets': 2,
        'daysTarget': 4,
        'startKey': '2026-10-19',
        'endKey': '2026-10-25',
        'days': {'2026-10-19': 2, 'lixo': 'x'},
        'daysDone': 1,
      });
      expect(p.viewId, 'p_a');
      expect(p.sets, 2);
      expect(p.daysTarget, 4);
      expect(p.days, {'2026-10-19': 2});
    });

    test('rótulo', () {
      expect(professorHomeworkDaysLabel(2, 3), '2 de 3 dias');
      expect(professorHomeworkDaysLabel(0, 1), '0 de 1 dia');
    });
  });

  group('H7 · registro da aula', () {
    LessonPlan plan({LessonHomework? homework = _hw, DateTime? sentAt}) =>
        lessonPlan(
          refId: _refId,
          date: '2026-10-19',
          review: LessonReview(
            blockRatings: const {},
            generalNote: '',
            feedback: [
              LessonFeedbackEntry(
                athleteId: 'ath-1',
                name: 'Marina Teles',
                text: 'Joelho bem melhor!',
                send: true,
                homework: homework,
                sentAt: sentAt,
              ),
            ],
          ),
        );

    Future<void> pump(
      WidgetTester tester,
      LessonPlan p, {
      List<ProfessorHomeworkProgress> progress = const [],
    }) =>
        pumpLessonPlansApp(
          tester,
          plans: FakeProfessorLessonPlansRepository(plans: [p]),
          homework: FakeProfessorHomeworkRepository(progress: [...progress]),
          location: '${AppRoutes.professorLessonReview}?planId=$_planId',
        );

    final viewKey = Key(
      'professor-homework-progress-${lessonPlanViewId(_planId, 'ath-1')}',
    );

    testWidgets('tarefa enviada mostra os dias feitos', (tester) async {
      await pump(
        tester,
        plan(sentAt: _sentAt),
        progress: [
          homeworkProgress(
            planId: _planId,
            athleteId: 'ath-1',
            startKey: '2026-10-19',
            days: const {'2026-10-19': 3, '2026-10-20': 3},
          ),
        ],
      );
      expect(_text(tester, viewKey), 'TREINO EM CASA · 2 de 3 dias');
    });

    testWidgets('sem marcação ainda: 0 de 3', (tester) async {
      await pump(tester, plan(sentAt: _sentAt));
      expect(_text(tester, viewKey), 'TREINO EM CASA · 0 de 3 dias');
    });

    testWidgets('tarefa ainda não enviada não tem progresso', (tester) async {
      await pump(tester, plan());
      expect(
        find.byKey(const Key('lesson-review-homework-set-ath-1')),
        findsOneWidget,
      );
      expect(find.byKey(viewKey), findsNothing);
    });
  });

  group('ficha do aluno', () {
    Future<void> open(
      WidgetTester tester,
      FakeProfessorHomeworkRepository homework,
    ) =>
        pumpProfessorStudentsApp(
          tester,
          repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
          homeworkRepo: homework,
          location: '${AppRoutes.professorStudents}/arena-cfc/s1',
          overrides: [
            professorLinksClockProvider.overrideWithValue(() => agendaNow),
          ],
        );

    testWidgets('tarefas da semana com os dias feitos', (tester) async {
      final view = homeworkView(
        planId: _planId,
        athleteId: 'ath-1',
        professorUid: lessonPlanUid,
        sentAt: _sentAt,
      );
      final repo = FakeProfessorHomeworkRepository(
        views: [
          view,
          // Semana passada: já acabou.
          homeworkView(
            planId: 'old',
            athleteId: 'ath-1',
            professorUid: lessonPlanUid,
            sentAt: DateTime.utc(2026, 10, 10, 15),
            name: 'Toque na parede',
          ),
          // Outro aluno.
          homeworkView(
            planId: _planId,
            athleteId: 'ath-9',
            professorUid: lessonPlanUid,
            sentAt: _sentAt,
          ),
        ],
        progress: [
          homeworkProgress(
            planId: _planId,
            athleteId: 'ath-1',
            startKey: '2026-10-19',
            days: const {'2026-10-19': 3, '2026-10-20': 1},
          ),
        ],
      );
      await open(tester, repo);

      expect(find.text('TREINO EM CASA'), findsOneWidget);
      expect(find.text('Saque por baixo'), findsOneWidget);
      expect(find.text('Toque na parede'), findsNothing);
      expect(find.text('INICIANTE A · 3 SÉRIES/DIA'), findsOneWidget);
      expect(
        _text(tester, Key('professor-homework-days-${view.id}')),
        '1 de 3 dias',
      );
      final today = find.byKey(
        Key('professor-homework-day-${view.id}-2026-10-20'),
      );
      expect(
        find.descendant(of: today, matching: find.text('1/3')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: today, matching: find.text('HOJE')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(Key('professor-homework-day-${view.id}-2026-10-19')),
          matching: find.byIcon(Icons.check_rounded),
        ),
        findsOneWidget,
      );

      // O aluno fecha o dia: a ficha atualiza ao vivo.
      repo.progress = [
        homeworkProgress(
          planId: _planId,
          athleteId: 'ath-1',
          startKey: '2026-10-19',
          days: const {'2026-10-19': 3, '2026-10-20': 3},
        ),
      ];
      repo.emit();
      await settleProfessorStudents(tester);
      expect(
        _text(tester, Key('professor-homework-days-${view.id}')),
        '2 de 3 dias',
      );
    });

    testWidgets('sem tarefa na semana', (tester) async {
      await open(tester, FakeProfessorHomeworkRepository());
      expect(find.text('TREINO EM CASA'), findsOneWidget);
      expect(
        find.textContaining('Nenhuma tarefa para casa nesta semana'),
        findsOneWidget,
      );
    });
  });
}
