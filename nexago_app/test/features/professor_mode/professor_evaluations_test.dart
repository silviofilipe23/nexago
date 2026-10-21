import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_evaluations.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_evaluations_test_support.dart';
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

String text(WidgetTester tester, Finder f) => tester.widget<Text>(f).data!;

Future<void> pump(
  WidgetTester tester, {
  required FakeProfessorEvaluationsRepository repo,
  required String location,
  FakeProfessorWalletRepository? wallet,
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
      walletRepo: wallet,
      evaluationsRepo: repo,
      location: location,
      extraRoutes: [...professorEvaluationRoutes, ...professorWalletRoutes],
      overrides: [
        professorLinksClockProvider
            .overrideWithValue(() => DateTime.utc(2026, 10, 20, 15)),
      ],
    );

String evaluatePath(String athleteId) =>
    AppRoutes.professorEvaluate.replaceAll(':athleteId', athleteId);

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('lógica', () {
    test('fundamentos espelham o servidor', () {
      expect(kEvaluationFundamentals.keys.toSet(), {
        'beachTennis',
        'beachVolleyball',
        'indoorVolleyball',
        'footvolley',
        'tennis',
        'padel',
        'other',
      });
      expect(evaluationFundamentals('padel').map((f) => f.$1), [
        'saque',
        'forehand',
        'backhand',
        'voleio',
        'bandeja',
        'posicionamento'
      ]);
      expect(evaluationFundamentals('???').length, 4);
    });

    test('nota geral, meio ponto, delta e meses', () {
      expect(roundHalf(7.3), 7.5);
      expect(roundHalf(11), 10);
      expect(
        evaluationOverall('other',
            const {'tecnica': 7, 'tatica': 8, 'fisico': 6.5, 'mental': 7.5}),
        7.3,
      );
      expect(evaluationDeltaLabel(0.8), '+0.8');
      expect(evaluationDeltaLabel(-0.3), '−0.3');
      expect(evaluationPreviousPeriod('2026-01'), '2025-12');
      expect(evaluationPeriodLabel('2026-10'), 'Outubro/2026');
    });

    test('payload: formulário inteiro, só os fundamentos do esporte', () {
      final p = const ProfessorEvaluationInput(
        athleteId: 'ath-1',
        period: '2026-10',
        sport: 'other',
        scores: {'tecnica': 7.3, 'tatica': 8, 'smash': 9},
        comment: '  Boa  ',
        focus: ['Smash', ' ', 'Saque', 'Defesa', 'Extra'],
        suggestedLevel: 'avancado',
        send: true,
      ).toPayload();
      expect(p, {
        'athleteId': 'ath-1',
        'period': '2026-10',
        'sport': 'other',
        'scores': {'tecnica': 7.5, 'tatica': 8.0, 'fisico': 0.0, 'mental': 0.0},
        'comment': 'Boa',
        'focus': ['Smash', 'Saque', 'Defesa'],
        'suggestedLevel': 'avancado',
        'send': true,
      });
    });

    test('leitura do doc, pendentes e última enviada', () {
      final e = ProfessorEvaluation.fromMap('x', {
        'athleteId': 'a',
        'period': '2026-10',
        'sport': 'tennis',
        'scores': {'saque': 7},
        'overall': 7.2,
        'previousOverall': 6.4,
        'status': 'sent',
        'suggestedLevel': 'pro',
        'sentAt': Timestamp.fromDate(DateTime(2026, 10, 19)),
      });
      expect(e.isSent, isTrue);
      expect(e.delta, 0.8);
      expect(e.suggestedLevel, isNull);
      final list = [
        evaluation(athleteId: 'a', period: '2026-10'),
        evaluation(athleteId: 'b', period: '2026-10', status: 'draft'),
        evaluation(athleteId: 'a', period: '2026-09', overall: 6),
      ];
      final students = <EvaluableStudent>[
        (athleteId: 'a', name: 'Ana', photoUrl: null),
        (athleteId: 'b', name: 'Bia', photoUrl: null),
        (athleteId: 'c', name: 'Caio', photoUrl: null),
      ];
      expect(
          evaluationPending(students, list, '2026-10').map((s) => s.athleteId),
          ['b', 'c']);
      expect(latestSentFor(list, 'a')!.period, '2026-10');
      expect(latestSentFor(list, 'b'), isNull);
      expect(
        evaluationInitialScores('other', previous: null)['tecnica'],
        5,
      );
    });

    test('push, guarda', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_evaluation',
          'url': '/avaliacao/p_a_2026-10',
        }),
        '/avaliacao/p_a_2026-10',
      );
      expect(
        resolveNotificationRoute(
            const {'type': 'professor_evaluation', 'evaluationId': 'x'}),
        '/avaliacao/x',
      );
      expect(isAthleteExperiencePath('/avaliacoes'), isTrue);
      expect(isAthleteExperiencePath('/avaliacao/x'), isTrue);
    });
  });

  group('professor', () {
    testWidgets('lista: pendentes do mês e recentes', (tester) async {
      await pump(
        tester,
        repo: FakeProfessorEvaluationsRepository(mine: [
          evaluation(athleteId: 'ath-paulo', status: 'draft'),
        ]),
        wallet: FakeProfessorWalletRepository(students: [walletStudent()]),
        location: AppRoutes.professorEvaluations,
      );
      // João (turma) e Paulo (carteira, com rascunho) pendentes.
      expect(find.byKey(const Key('evaluation-pending-ath-1')), findsOneWidget);
      expect(
        inside('evaluation-pending-ath-paulo', find.text('Rascunho salvo')),
        findsOneWidget,
      );
      expect(find.text('PENDENTES · 2'), findsOneWidget);
    });

    testWidgets('avaliar: nota ao vivo com delta e envio do formulário',
        (tester) async {
      final repo = FakeProfessorEvaluationsRepository(mine: [
        evaluation(
          period: '2026-09',
          overall: 6.0,
          scores: const {
            'saque': 6,
            'forehand': 6,
            'backhand': 6,
            'voleio': 6,
            'smash': 6,
            'posicionamento': 6,
          },
        ),
      ]);
      await pump(tester, repo: repo, location: evaluatePath('ath-1'));
      // Começa das notas do mês anterior.
      expect(text(tester, find.byKey(const Key('evaluation-overall'))), '6.0');
      await tap(
          tester,
          inside('evaluation-score-saque',
              find.byTooltip('Mais meio ponto em Saque')));
      await tap(tester, find.bySemanticsLabel('Backhand nota 9'));
      // (6.5 + 6 + 9 + 6 + 6 + 6) / 6 = 6.6
      expect(text(tester, find.byKey(const Key('evaluation-overall'))), '6.6');
      expect(text(tester, find.byKey(const Key('evaluation-delta'))), '+0.6');

      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('evaluation-comment')),
          matching: find.byType(TextField),
        ),
        'Evoluiu muito',
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('evaluation-focus-0')),
          matching: find.byType(TextField),
        ),
        'Smash',
      );
      await tap(tester, find.byKey(const Key('evaluation-level-avancado')));
      await tap(tester, find.byKey(const Key('evaluation-send')));
      final p = repo.saved.single;
      expect(p['send'], isTrue);
      expect(p['period'], '2026-10');
      expect(p['sport'], 'beachTennis');
      expect((p['scores']! as Map)['saque'], 6.5);
      expect((p['scores']! as Map)['backhand'], 9.0);
      expect(p['comment'], 'Evoluiu muito');
      expect(p['focus'], ['Smash']);
      expect(p['suggestedLevel'], 'avancado');
    });

    testWidgets('rascunho: troca de esporte e apagar', (tester) async {
      final repo = FakeProfessorEvaluationsRepository(mine: [
        evaluation(status: 'draft', previousOverall: null),
      ]);
      await pump(tester, repo: repo, location: evaluatePath('ath-1'));
      await tap(tester, find.byKey(const Key('evaluation-sport-other')));
      expect(find.byKey(const Key('evaluation-score-tecnica')), findsOneWidget);
      await tap(tester, find.byKey(const Key('evaluation-save-draft')));
      expect(repo.saved.single['send'], isFalse);
      expect((repo.saved.single['scores']! as Map).keys,
          ['tecnica', 'tatica', 'fisico', 'mental']);

      await pump(tester, repo: repo, location: evaluatePath('ath-1'));
      await tap(tester, find.byKey(const Key('evaluation-delete')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.deleted, ['prof-1_ath-1_2026-10']);
    });

    testWidgets('B3: nota mais recente com delta e Avaliar', (tester) async {
      await pump(
        tester,
        repo: FakeProfessorEvaluationsRepository(mine: [evaluation()]),
        location: AppRoutes.professorStudent
            .replaceAll(':arenaId', 'arena-cfc')
            .replaceAll(':studentId', 's1'),
      );
      expect(
        inside('student-evaluation-strip-ath-1', find.text('7.2')),
        findsOneWidget,
      );
      expect(
        inside('student-evaluation-strip-ath-1', find.text('+0.8')),
        findsOneWidget,
      );
      await tap(tester, find.byKey(const Key('student-evaluate-ath-1')));
      expect(find.text('Avaliar João'), findsOneWidget);
    });
  });

  group('aluno', () {
    testWidgets('lista e detalhe com delta por fundamento', (tester) async {
      await pump(
        tester,
        repo: FakeProfessorEvaluationsRepository(received: [
          evaluation(
            previousScores: const {'saque': 6.5, 'backhand': 8},
          ),
        ]),
        location: AppRoutes.athleteEvaluations,
      );
      expect(find.text('Outubro/2026'), findsOneWidget);
      await tap(tester,
          find.byKey(const Key('athlete-evaluation-prof-1_ath-1_2026-10')));
      expect(find.text('Carlos Professor'), findsOneWidget);
      expect(
          inside('evaluation-score-saque', find.text('+1.0')), findsOneWidget);
      expect(find.text('Evolução clara no backhand.'), findsOneWidget);
      // Fundamento e foco do próximo mês.
      expect(find.text('Smash'), findsNWidgets(2));
      expect(find.byKey(const Key('evaluation-level')), findsOneWidget);
    });

    testWidgets('avaliação de outra conta: aviso', (tester) async {
      await pump(
        tester,
        repo: FakeProfessorEvaluationsRepository(),
        location:
            AppRoutes.athleteEvaluation.replaceAll(':evaluationId', 'nada'),
      );
      expect(
          find.byKey(const Key('athlete-evaluation-missing')), findsOneWidget);
    });
  });
}
