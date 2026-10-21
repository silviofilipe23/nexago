import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_agenda_repository.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_agenda_test_support.dart' show FakeProfessorAgendaRepository;
import 'professor_availability_test_support.dart';
import 'professor_students_test_support.dart';

/// Remarcar particular (D3) fora do chat: "Minhas particulares" (aluno) e
/// "Próximas particulares" da Disponibilidade (professor).

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Future<GoRouter> pump(
  WidgetTester tester, {
  required FakeProfessorAvailabilityRepository repo,
  required String location,
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
      availabilityRepo: repo,
      location: location,
      extraRoutes: professorAvailabilityRoutes,
      overrides: [
        professorLinksClockProvider.overrideWithValue(() => availabilityNow),
        professorAgendaRepositoryProvider
            .overrideWithValue(FakeProfessorAgendaRepository()),
        myProfessorsProvider.overrideWith((ref) async => const []),
      ],
    );

String slotKey(DateTime t) => 'reschedule-slot-${t.toIso8601String()}';

ProfessorOpenSlots openSlots(List<DateTime> starts) => ProfessorOpenSlots(
      slots: [
        for (final s in starts)
          OpenSlot(startAt: s, endAt: s.add(const Duration(hours: 1))),
      ],
    );

Map<String, Object?> pendingReschedule({String requestedBy = 'ath-1'}) => {
      'requestedBy': requestedBy,
      'startAt': spInstant(23, 9),
      'endAt': spInstant(23, 10),
      'status': 'pending',
      'messageId': 'm-card',
      'conversationId': 'd_prof-1_ath-1',
    };

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Minhas particulares (aluno)', () {
    testWidgets('Remarcar abre os horários e manda o pedido', (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        lessons: [privateLesson(startAt: spInstant(22, 6))],
        slots: openSlots([spInstant(22, 6), spInstant(22, 9)]),
      );
      await pump(tester, repo: repo, location: AppRoutes.athletePrivateLessons);
      await tap(
          tester, find.byKey(const Key('athlete-private-reschedule-pl1')));
      expect(find.byKey(const Key('reschedule-sheet')), findsOneWidget);
      // O horário atual não aparece como opção.
      expect(find.byKey(Key(slotKey(spInstant(22, 6)))), findsNothing);
      await tap(tester, find.byKey(Key(slotKey(spInstant(22, 9)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(repo.rescheduleRequests.single,
          (lessonId: 'pl1', startAt: spInstant(22, 9)));
      expect(find.text('Pedido enviado ao professor'), findsOneWidget);
    });

    testWidgets('fechar a folha não pede nada', (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        lessons: [privateLesson()],
        slots: openSlots([spInstant(22, 9)]),
      );
      await pump(tester, repo: repo, location: AppRoutes.athletePrivateLessons);
      await tap(
          tester, find.byKey(const Key('athlete-private-reschedule-pl1')));
      await tester.tapAt(const Offset(20, 20));
      await settleProfessorStudents(tester);
      expect(find.byKey(const Key('reschedule-sheet')), findsNothing);
      expect(repo.rescheduleRequests, isEmpty);
    });

    testWidgets('erro do servidor aparece no aviso', (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        lessons: [privateLesson()],
        slots: openSlots([spInstant(22, 9)]),
      )..rescheduleError = 'Este horário não está livre. Escolha outro.';
      await pump(tester, repo: repo, location: AppRoutes.athletePrivateLessons);
      await tap(
          tester, find.byKey(const Key('athlete-private-reschedule-pl1')));
      await tap(tester, find.byKey(Key(slotKey(spInstant(22, 9)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(find.text('Este horário não está livre. Escolha outro.'),
          findsOneWidget);
    });

    testWidgets(
        'selo "Remarcação pendente" e sem Remarcar em passada/cancelada',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(id: 'pl1', reschedule: pendingReschedule()),
        privateLesson(
          id: 'pl2',
          startAt: spInstant(24, 10),
          reschedule: pendingReschedule(requestedBy: 'prof-1'),
        ),
        privateLesson(id: 'past', startAt: spInstant(19, 10)),
        privateLesson(id: 'canceled', status: 'canceled'),
      ]);
      await pump(tester, repo: repo, location: AppRoutes.athletePrivateLessons);
      expect(find.text('REMARCAÇÃO PENDENTE'), findsNWidgets(2));
      expect(find.text('Você pediu Sex 23 · 09:00 · aguardando o professor.'),
          findsOneWidget);
      expect(
          find.text(
              'O professor sugeriu Sex 23 · 09:00. Responda na conversa.'),
          findsOneWidget);
      expect(find.byKey(const Key('athlete-private-reschedule-pl1')),
          findsOneWidget);
      expect(find.byKey(const Key('athlete-private-reschedule-past')),
          findsNothing);
      expect(find.byKey(const Key('athlete-private-reschedule-canceled')),
          findsNothing);
    });
  });

  group('Disponibilidade (professor)', () {
    testWidgets('Remarcar numa próxima particular', (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        lessons: [privateLesson(startAt: spInstant(22, 6))],
        slots: openSlots([spInstant(23, 8)]),
      );
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);
      expect(find.byKey(const Key('availability-cancel-pl1')), findsOneWidget);
      await tap(tester, find.byKey(const Key('availability-reschedule-pl1')));
      await tap(tester, find.byKey(Key(slotKey(spInstant(23, 8)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(repo.rescheduleRequests.single,
          (lessonId: 'pl1', startAt: spInstant(23, 8)));
      expect(find.text('Pedido enviado ao aluno'), findsOneWidget);
    });

    testWidgets('pedido do aluno: Aceitar e Recusar ali mesmo', (tester) async {
      final repo = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(reschedule: pendingReschedule()),
      ]);
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);
      expect(find.text('Pedido de remarcação: Sex 23 · 09:00'), findsOneWidget);
      expect(
          find.byKey(const Key('availability-reschedule-pl1')), findsNothing);

      await tap(
          tester, find.byKey(const Key('availability-reschedule-accept-pl1')));
      expect(repo.rescheduleResponses.single, (lessonId: 'pl1', accept: true));
      expect(find.text('Particular remarcada.'), findsOneWidget);

      await tap(
          tester, find.byKey(const Key('availability-reschedule-decline-pl1')));
      expect(repo.rescheduleResponses.last, (lessonId: 'pl1', accept: false));
    });

    testWidgets('pedido do próprio professor: aviso e Remarcar de novo',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(reschedule: pendingReschedule(requestedBy: 'prof-1')),
      ]);
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);
      expect(find.text('Você sugeriu Sex 23 · 09:00 · aguardando o aluno.'),
          findsOneWidget);
      expect(find.byKey(const Key('availability-reschedule-accept-pl1')),
          findsNothing);
      expect(
          find.byKey(const Key('availability-reschedule-pl1')), findsOneWidget);
    });

    testWidgets('erro ao aceitar vai para o aviso', (tester) async {
      final repo = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(reschedule: pendingReschedule()),
      ])
        ..rescheduleError =
            'O horário pedido não está mais livre. Sugira outro.';
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);
      await tap(
          tester, find.byKey(const Key('availability-reschedule-accept-pl1')));
      expect(find.text('O horário pedido não está mais livre. Sugira outro.'),
          findsOneWidget);
    });
  });
}
