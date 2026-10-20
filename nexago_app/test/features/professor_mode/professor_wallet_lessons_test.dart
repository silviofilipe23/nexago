import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_lesson_student_picker.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/application/professor_wallet_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts, professorLink;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

String studentPath(String id) =>
    AppRoutes.professorWalletStudent.replaceAll(':athleteId', id);

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

bool enabled(WidgetTester tester, String key) =>
    tester
        .widget<OutlinedButton>(inside(key, find.byType(OutlinedButton)))
        .onPressed !=
    null;

ArenaProfessorLink independent(String arenaId, String name) => professorLink(
      arenaId: arenaId,
      arenaName: name,
      type: ArenaProfessorLinkType.independent,
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('B4 · Aulas do aluno da carteira', () {
    FakeProfessorWalletRepository wallet() => FakeProfessorWalletRepository(
          students: [walletStudent()],
          lessons: [
            walletLesson(bookingId: 'prox', date: '2026-10-22'),
            walletLesson(bookingId: 'cancel', date: '2026-10-15'),
            walletLesson(bookingId: 'velha', date: '2026-10-13'),
            walletLesson(bookingId: 'outro', athleteId: 'outro'),
          ],
          bookings: [
            walletBooking(id: 'prox'),
            walletBooking(id: 'cancel', status: 'canceled'),
            walletBooking(id: 'velha', status: 'completed'),
          ],
        );

    testWidgets('próximas e últimas; cancelada riscada; custo do mês',
        (tester) async {
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet(),
        location: studentPath('ath-paulo'),
        links: [independent('arena-norte', 'Arena Norte')],
      );
      expect(find.text('PRÓXIMAS'), findsOneWidget);
      expect(find.text('ÚLTIMAS'), findsOneWidget);
      expect(find.byKey(const Key('professor-wallet-lesson-prox')),
          findsOneWidget);
      expect(
          find.byKey(const Key('professor-wallet-lesson-outro')), findsNothing);
      expect(
        inside('professor-wallet-lesson-cancel', find.text('CANCELADA')),
        findsOneWidget,
      );
      final title = tester.widget<Text>(inside(
        'professor-wallet-lesson-cancel',
        find.textContaining('19:00'),
      ));
      expect(title.style?.decoration, TextDecoration.lineThrough);
      // prox + velha (a cancelada não conta) × R$ 60.
      expect(
        inside('professor-wallet-student-court-cost',
            find.textContaining('120,00')),
        findsOneWidget,
      );
    });

    testWidgets('Nova aula com uma arena: guarda o aluno e abre a arena',
        (tester) async {
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet(),
        location: studentPath('ath-paulo'),
        links: [
          independent('arena-norte', 'Arena Norte'),
          professorLink(arenaId: 'arena-staff'),
        ],
      );
      final container = ProviderScope.containerOf(
        tester.element(find.byKey(const Key('professor-wallet-new-lesson'))),
      );
      await tap(tester, find.byKey(const Key('professor-wallet-new-lesson')));
      expect(find.text('arena arena-norte'), findsOneWidget);
      expect(
        container.read(professorLessonStudentProvider),
        'ath-paulo',
      );
    });

    testWidgets('Nova aula com duas arenas pergunta qual', (tester) async {
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet(),
        location: studentPath('ath-paulo'),
        links: [
          independent('arena-norte', 'Arena Norte'),
          independent('arena-sul', 'Arena Sul'),
        ],
      );
      await tap(tester, find.byKey(const Key('professor-wallet-new-lesson')));
      expect(find.text('Em qual arena?'), findsOneWidget);
      await tap(
          tester, find.byKey(const Key('professor-lesson-arena-arena-sul')));
      expect(find.text('arena arena-sul'), findsOneWidget);
    });

    testWidgets('sem vínculo independente que reserve: botão desligado',
        (tester) async {
      await pumpProfessorWalletApp(
        tester,
        wallet: wallet(),
        location: studentPath('ath-paulo'),
        links: [professorLink(arenaId: 'arena-staff')],
      );
      expect(enabled(tester, 'professor-wallet-new-lesson'), isFalse);
      expect(find.textContaining('vínculo independente com'), findsOneWidget);
    });

    testWidgets('convidado ainda não tem Nova aula', (tester) async {
      await pumpProfessorWalletApp(
        tester,
        wallet: FakeProfessorWalletRepository(students: [
          walletStudent(status: ProfessorWalletStudentStatus.invited),
        ]),
        location: studentPath('ath-paulo'),
        links: [independent('arena-norte', 'Arena Norte')],
      );
      expect(enabled(tester, 'professor-wallet-new-lesson'), isFalse);
    });
  });

  group('B16 · Custo de quadra', () {
    testWidgets('reservas do mês, próximas e líquido = recebido − quadra',
        (tester) async {
      await pumpProfessorWalletApp(
        tester,
        wallet: FakeProfessorWalletRepository(
          account: walletAccount(),
          charges: [
            walletCharge(
              id: 'pago',
              status: ProfessorChargeStatus.paid,
              netReais: 830,
              paidAt: DateTime.utc(2026, 10, 10, 15),
            ),
          ],
          bookings: [
            walletBooking(id: '1', date: '2026-10-05', amount: 60),
            walletBooking(id: '2', date: '2026-10-12', amount: 60),
            walletBooking(id: '3', date: '2026-10-28', amount: 80),
            walletBooking(id: '4', date: '2026-10-29', status: 'expired'),
            walletBooking(id: '5', date: '2026-11-03', amount: 60),
          ],
        ),
        location: AppRoutes.professorWallet,
      );
      String text(String key) =>
          tester.widget<Text>(find.byKey(Key(key))).data!;
      expect(text('professor-wallet-received'), contains('830,00'));
      expect(text('professor-wallet-court-total'), contains('200,00'));
      expect(text('professor-wallet-net'), contains('630,00'));
      expect(
        inside('professor-wallet-court-past', find.textContaining('120,00')),
        findsOneWidget,
      );
      expect(
        inside('professor-wallet-court-past',
            find.text('2 reservas como professor')),
        findsOneWidget,
      );
      expect(
        inside('professor-wallet-court-upcoming', find.textContaining('80,00')),
        findsOneWidget,
      );
    });
  });

  group('Confirmação da reserva · aluno da carteira', () {
    testWidgets('"Nenhum" e os alunos; toque escolhe', (tester) async {
      String? picked = 'x';
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => BookingConfirmLessonStudentPicker(
              students: const [
                (id: 'ath-paulo', name: 'Paulo Viana'),
                (id: 'ath-rafa', name: 'Rafaela Torres'),
              ],
              selectedId: picked == 'x' ? 'ath-paulo' : picked,
              onSelected: (id) => setState(() => picked = id),
            ),
          ),
        ),
      ));
      expect(find.text('AULA PARA UM ALUNO DA CARTEIRA (OPCIONAL)'),
          findsOneWidget);
      await tester
          .tap(find.byKey(const Key('booking-confirm-lesson-ath-rafa')));
      await tester.pump();
      expect(picked, 'ath-rafa');
      await tester.tap(find.byKey(const Key('booking-confirm-lesson-none')));
      await tester.pump();
      expect(picked, isNull);
    });
  });

  test('o provider da aula começa vazio', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(professorLessonStudentProvider), isNull);
  });
}
