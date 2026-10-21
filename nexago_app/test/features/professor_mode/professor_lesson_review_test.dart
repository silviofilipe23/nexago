import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/messages/infrastructure/messages_repository.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';

import '../messages/messages_test_support.dart' show FakeMessagesRepository;
import 'professor_agenda_test_support.dart';
import 'professor_lesson_plans_test_support.dart';
import 'professor_students_test_support.dart';

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await settleProfessorStudents(tester);
}

const _today = 'class_c1_2026-10-20';
const _yesterday = 'class_c1_2026-10-19';

String _planId(String refId) =>
    lessonPlanId(lessonPlanUid, LessonPlanKind.session, refId);

LessonPlan _todayPlan() => lessonPlan(
      refId: _today,
      blocks: [
        planBlock(note: 'Joelho flexionado na batida'),
        planBlock(
          id: 'b2',
          name: 'Jogo reduzido',
          category: LessonPlanCategory.jogo,
          minutes: 20,
        ),
      ],
      focus: const [
        LessonPlanFocus(
          athleteId: 'ath-1',
          name: 'Marina Teles',
          text: 'Anunciar a zona antes de sacar',
        ),
      ],
    );

Map<String, LessonPlanLesson> _lessons(String refId) => {
      'session:$refId': LessonPlanLesson(
        planId: _planId(refId),
        title: 'Iniciante A',
        date: '2026-10-19',
        startTime: '19:00',
        endTime: '20:00',
        students: const [
          LessonPlanStudent(athleteId: 'ath-1', name: 'Marina Teles'),
          LessonPlanStudent(athleteId: 'ath-2', name: 'Caio Ramos'),
        ],
      ),
    };

String _clock(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('lesson-live-clock'))).data!;

void main() {
  group('H6 · Modo aula', () {
    // 19:00 em SP.
    late DateTime now;
    setUp(() => now = DateTime.utc(2026, 10, 20, 22));

    Future<void> pumpLive(WidgetTester tester) => pumpLessonPlansApp(
          tester,
          plans: FakeProfessorLessonPlansRepository(plans: [_todayPlan()]),
          location:
              '${AppRoutes.professorLessonLive}?planId=${_planId(_today)}',
          liveClock: () => now,
        );

    testWidgets('cronômetro, pausa, excedente e próximo bloco', (tester) async {
      await pumpLive(tester);
      expect(find.text('Saque em zonas-alvo'), findsOneWidget);
      expect(_clock(tester), '15:00');
      expect(find.text('AO VIVO · 19:00 · BLOCO 1 DE 2'), findsOneWidget);
      // A nota privada aparece: a tela é do professor.
      expect(find.byKey(const Key('lesson-live-note')), findsOneWidget);
      expect(find.text('FOCO INDIVIDUAL'), findsOneWidget);
      expect(find.byKey(const Key('lesson-live-next-block')), findsOneWidget);

      now = now.add(const Duration(seconds: 61));
      await tester.pump(const Duration(seconds: 1));
      expect(_clock(tester), '13:59');

      // Pausado o tempo não anda.
      await tap(tester, find.byKey(const Key('lesson-live-toggle')));
      now = now.add(const Duration(minutes: 5));
      await tester.pump(const Duration(seconds: 1));
      expect(_clock(tester), '13:59');
      await tap(tester, find.byKey(const Key('lesson-live-toggle')));

      // Passou do tempo: conta o excedente e não avança sozinho.
      now = now.add(const Duration(minutes: 14, seconds: 5));
      await tester.pump(const Duration(seconds: 1));
      expect(_clock(tester), '+00:06');
      expect(find.text('Saque em zonas-alvo'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-live-next')));
      expect(find.byKey(const Key('lesson-live-name')), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const Key('lesson-live-name'))).data,
        'Jogo reduzido',
      );
      expect(_clock(tester), '20:00');
      expect(find.byKey(const Key('lesson-live-next-block')), findsNothing);
      expect(find.text('Encerrar aula'), findsOneWidget);
    });

    testWidgets('"Encerrar aula" abre o registro', (tester) async {
      await pumpLive(tester);
      await tap(tester, find.byKey(const Key('lesson-live-next')));
      await tap(tester, find.byKey(const Key('lesson-live-next')));
      expect(find.text('Registro da aula'), findsOneWidget);
    });

    testWidgets('sair pede confirmação', (tester) async {
      await pumpLive(tester);
      await tap(tester, find.bySemanticsLabel('Voltar'));
      expect(find.text('Sair do modo aula?'), findsOneWidget);
      await tap(tester, find.text('Continuar aula'));
      expect(find.byKey(const Key('lesson-live-clock')), findsOneWidget);

      await tap(tester, find.bySemanticsLabel('Voltar'));
      await tap(tester, find.byKey(const Key('lesson-live-leave')));
      expect(find.byKey(const Key('lesson-live-clock')), findsNothing);
      expect(find.text('Planos de aula'), findsOneWidget);
    });

    testWidgets('H1: "Iniciar aula" no plano de hoje', (tester) async {
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(plans: [_todayPlan()]),
        liveClock: () => now,
      );
      await tap(tester, find.byKey(const Key('lesson-plan-start-$_today')));
      expect(find.byKey(const Key('lesson-live-clock')), findsOneWidget);
    });
  });

  group('H7 · Registro da aula', () {
    LessonPlan pastPlan({LessonReview? review}) => lessonPlan(
          refId: _yesterday,
          date: '2026-10-19',
          review: review,
        );

    testWidgets('notas dos blocos, anotação e feedback com exercício',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(
        plans: [pastPlan()],
        lessons: _lessons(_yesterday),
      );
      await pumpLessonPlansApp(tester, plans: repo);

      // Aula de ontem sem registro aparece em "Para registrar".
      expect(find.text('PARA REGISTRAR'), findsOneWidget);
      await tap(
          tester, find.byKey(const Key('lesson-plan-review-$_yesterday')));
      expect(find.text('Registro da aula'), findsOneWidget);
      expect(find.text('INICIANTE A · SEG 19'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-review-rate-0-ok')));
      await tap(tester, find.byKey(const Key('lesson-review-rate-1-no')));
      await tester.enterText(
        find.byKey(const Key('lesson-review-note')),
        'Duas zonas nos primeiros 5 minutos',
      );
      await tester.enterText(
        find.byKey(const Key('lesson-review-text-ath-1')),
        'Joelho bem melhor!',
      );
      await tap(tester, find.byKey(const Key('lesson-review-homework-ath-1')));
      await tap(
        tester,
        find.byKey(const Key('lesson-homework-pick-nexago-saque-zonas')),
      );
      expect(find.byKey(const Key('lesson-review-homework-set-ath-1')),
          findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('lesson-review-text-ath-2')),
        'Ombro: seguir sem smash',
      );
      await tap(tester, find.byKey(const Key('lesson-review-send-ath-2')));
      await settleProfessorStudents(tester);
      expect(find.text('Salvar e enviar 1 feedback'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-review-save')));
      final p = repo.savedReviews.single.toPayload();
      expect(p['planId'], _planId(_yesterday));
      expect(p['blockRatings'], {'b1': 'ok', 'b2': 'no'});
      expect(p['generalNote'], 'Duas zonas nos primeiros 5 minutos');
      final fb = p['feedback']! as List;
      expect(fb, hasLength(2));
      expect(fb[0], {
        'athleteId': 'ath-1',
        'text': 'Joelho bem melhor!',
        'send': true,
        'homework': {
          'name': 'Saque em zonas-alvo',
          'detail': kNexagoExerciseLibrary
              .firstWhere((e) => e.id == 'nexago-saque-zonas')
              .steps
              .first,
          // Dose da tarefa (T9): padrão 3 séries × 3 dias; categoria da
          // biblioteca.
          'sets': 3,
          'daysTarget': 3,
          'category': 'saque',
        },
      });
      expect(fb[1], {
        'athleteId': 'ath-2',
        'text': 'Ombro: seguir sem smash',
        'send': false,
        'homework': null,
      });
      expect(find.text('Registro salvo · 1 feedback enviado.'), findsOneWidget);
    });

    testWidgets('abre com o registro salvo; enviado só reenvia se mudar',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(
        plans: [
          pastPlan(
            review: LessonReview(
              blockRatings: const {'b1': LessonBlockRating.adjust},
              generalNote: 'Turma cansada',
              feedback: [
                LessonFeedbackEntry(
                  athleteId: 'ath-1',
                  name: 'Marina Teles',
                  text: 'Joelho bem melhor!',
                  send: true,
                  sentAt: DateTime.utc(2026, 10, 19, 23),
                ),
              ],
            ),
          ),
        ],
        lessons: _lessons(_yesterday),
      );
      await pumpLessonPlansApp(
        tester,
        plans: repo,
        location:
            '${AppRoutes.professorLessonReview}?planId=${_planId(_yesterday)}',
      );

      expect(find.text('Turma cansada'), findsOneWidget);
      expect(find.text('Joelho bem melhor!'), findsOneWidget);
      expect(find.byKey(const Key('lesson-review-sent-ath-1')), findsOneWidget);
      expect(find.text('ENVIADO 19/10'), findsOneWidget);
      expect(find.text('Salvar'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('lesson-review-text-ath-1')),
        'Joelho bem melhor! Agora a paralela.',
      );
      await settleProfessorStudents(tester);
      expect(find.byKey(const Key('lesson-review-sent-ath-1')), findsNothing);
      expect(find.text('Salvar e enviar 1 feedback'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-review-save')));
      final p = repo.savedReviews.single.toPayload();
      expect(p['blockRatings'], {'b1': 'adjust'});
      expect(p['generalNote'], 'Turma cansada');
    });

    testWidgets('E4: "Registrar aula" no card da aula de hoje', (tester) async {
      final router = await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(plans: [_todayPlan()]),
        location: AppRoutes.professorAgenda,
      );
      router.pushNamed(
        AppRouteNames.professorAgendaSession,
        pathParameters: {'sessionId': _today},
        extra: agendaSession(id: _today),
      );
      await settleProfessorStudents(tester);
      expect(
          find.byKey(const Key('lesson-plan-start-$_today')), findsOneWidget);
      await tap(tester, find.byKey(const Key('lesson-plan-review-$_today')));
      expect(router.state.uri.path, AppRoutes.professorLessonReview);
    });
  });

  group('H9 · feedback do aluno', () {
    LessonPlanView feedbackView({bool planVisible = true, int? stars}) =>
        lessonView(
          planVisible: planVisible,
          ratingStars: stars,
          feedback: LessonViewFeedback(
            text: 'Joelho bem melhor! Próximo passo: saque na paralela.',
            homework: const LessonHomework(
              name: 'Lançamento + flexão',
              detail: '3×10 sem bola',
            ),
            sentAt: agendaNow.subtract(const Duration(minutes: 12)),
          ),
        );

    testWidgets('feedback, exercício, estrelas e o plano recolhido',
        (tester) async {
      final view = feedbackView(stars: 3);
      final repo = FakeProfessorLessonPlansRepository(views: [view]);
      await pumpLessonPlansApp(
        tester,
        plans: repo,
        location: '/aula/plano/${view.id}',
        uid: 'ath-1',
      );

      expect(find.text('Feedback da aula'), findsOneWidget);
      expect(find.text('Prof. Thiago Mendes'), findsOneWidget);
      expect(find.text('Enviado há 12 min'), findsOneWidget);
      expect(find.byKey(const Key('lesson-feedback-text')), findsOneWidget);
      expect(find.text('Lançamento + flexão'), findsOneWidget);
      expect(find.text('3×10 sem bola'), findsOneWidget);
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(3));

      // O plano fica recolhido abaixo do feedback.
      expect(find.text('Aquecimento'), findsNothing);
      await tap(tester, find.byKey(const Key('lesson-feedback-plan-toggle')));
      expect(find.text('Aquecimento'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-feedback-star-5')));
      expect(repo.ratings, [(viewId: view.id, stars: 5)]);
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(5));
    });

    testWidgets('"Responder ao professor" abre a conversa direta',
        (tester) async {
      final view = feedbackView();
      final messages = FakeMessagesRepository();
      final router = await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [view]),
        location: '/aula/plano/${view.id}',
        uid: 'ath-1',
        overrides: [messagesRepositoryProvider.overrideWithValue(messages)],
      );
      await tap(tester, find.byKey(const Key('lesson-feedback-reply')));
      expect(messages.opened, ['professor:prof-9']);
      expect(router.state.uri.path, startsWith('/mensagens/'));
    });

    testWidgets('sem plano visível mostra só o feedback', (tester) async {
      final view = feedbackView(planVisible: false);
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [view]),
        location: '/aula/plano/${view.id}',
        uid: 'ath-1',
      );
      expect(find.byKey(const Key('lesson-feedback-card')), findsOneWidget);
      expect(
          find.byKey(const Key('lesson-feedback-plan-toggle')), findsNothing);
      expect(find.text('ROTEIRO'), findsNothing);
    });

    testWidgets('sem plano e sem feedback: aviso', (tester) async {
      final view = lessonView(planVisible: false);
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [view]),
        location: '/aula/plano/${view.id}',
        uid: 'ath-1',
      );
      expect(
          find.byKey(const Key('athlete-lesson-plan-hidden')), findsOneWidget);
    });

    testWidgets('lista marca os planos com feedback', (tester) async {
      final view = feedbackView();
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [view]),
        location: AppRoutes.athleteLessonPlans,
        uid: 'ath-1',
      );
      expect(find.byKey(Key('athlete-lesson-plan-feedback-${view.id}')),
          findsOneWidget);
    });
  });

  test('push lesson_feedback vai para o url', () {
    expect(
      resolveNotificationRoute(const {
        'type': 'lesson_feedback',
        'url': '/aula/plano/v1',
        'viewId': 'v1',
        'arenaId': 'arena-1',
      }),
      '/aula/plano/v1',
    );
    expect(
      resolveNotificationRoute(
          const {'type': 'lesson_feedback', 'viewId': 'v2'}),
      '/aula/plano/v2',
    );
  });

  test('envio: só com texto novo marcado para enviar', () {
    final sent = LessonFeedbackEntry(
      athleteId: 'a',
      name: 'A',
      text: 'Oi',
      sentAt: DateTime.utc(2026),
    );
    LessonFeedbackEntry e(String text, {bool send = true}) =>
        LessonFeedbackEntry(athleteId: 'a', name: 'A', text: text, send: send);
    expect(lessonFeedbackWillSend(e('Oi'), sent), isFalse);
    expect(lessonFeedbackWillSend(e('Oi de novo'), sent), isTrue);
    expect(lessonFeedbackWillSend(e('Oi', send: false), null), isFalse);
    expect(lessonFeedbackWillSend(e(' '), null), isFalse);
    expect(lessonLiveClockLabel(const Duration(minutes: 12, seconds: 47)),
        '12:47');
    expect(lessonLiveClockLabel(const Duration(seconds: -65)), '+01:05');
    expect(
      lessonRelativeAgo(DateTime.utc(2026, 1, 1), DateTime.utc(2026, 1, 3)),
      'há 2 dias',
    );
  });
}
