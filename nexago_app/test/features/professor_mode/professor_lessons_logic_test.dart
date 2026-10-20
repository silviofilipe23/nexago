import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lessons.dart';

import '../professor_links/professor_links_test_support.dart'
    show professorLink;
import 'professor_wallet_test_support.dart';

void main() {
  test('modelos leem os campos do backend', () {
    final lesson = ProfessorLesson.fromMap('bk-9', {
      'athleteId': 'a1',
      'studentName': 'Paulo',
      'arenaId': 'ar',
      'arenaName': 'Arena Norte',
      'courtName': 'Quadra 2',
      'date': '2026-10-22',
      'startTime': '19:00',
      'endTime': '20:00',
      'courtCostReais': 60,
    });
    expect(lesson.bookingId, 'bk-9');
    expect(lesson.courtCostReais, 60);

    final booking = ProfessorCourtBooking.fromMap('b1', {
      'date': Timestamp.fromDate(DateTime.utc(2026, 10, 22, 15)),
      'priceReais': 80,
      'status': 'CANCELLED',
    });
    expect(booking.date, '2026-10-22');
    expect(booking.amountReais, 80);
    expect(booking.isVoid, isTrue);
  });

  test('reserva que não vale', () {
    for (final s in ['canceled', 'cancelled', 'expired', 'rejected']) {
      expect(professorBookingIsVoid(s), isTrue, reason: s);
    }
    for (final s in ['booked', 'active', 'pending_payment', null]) {
      expect(professorBookingIsVoid(s), isFalse, reason: '$s');
    }
  });

  test('custo de quadra do mês: passadas, próximas, sem canceladas', () {
    final cost = professorCourtCostOfMonth([
      walletBooking(id: '1', date: '2026-10-05', amount: 60),
      walletBooking(id: '2', date: '2026-10-19', amount: 60),
      walletBooking(id: '3', date: '2026-10-20', amount: 80),
      walletBooking(id: '4', date: '2026-10-30', amount: 60),
      walletBooking(id: '5', date: '2026-10-25', status: 'canceled'),
      walletBooking(id: '6', date: '2026-11-02', amount: 60),
      walletBooking(id: '7', date: '2026-09-30', amount: 60),
    ], todayKey: walletTodayKey);
    expect(cost.pastCount, 2);
    expect(cost.pastReais, 120);
    expect(cost.upcomingCount, 2);
    expect(cost.upcomingReais, 140);
    expect(cost.totalReais, 260);
    expect(cost.count, 4);
  });

  test('aulas do aluno: próximas, últimas e custo do mês', () {
    final r = professorStudentLessons(
      [
        walletLesson(bookingId: 'a', date: '2026-10-27'),
        walletLesson(bookingId: 'b', date: '2026-10-22'),
        walletLesson(bookingId: 'c', date: '2026-10-13'),
        walletLesson(bookingId: 'd', date: '2026-10-15'),
        walletLesson(bookingId: 'e', date: '2026-09-29'),
        walletLesson(bookingId: 'f', athleteId: 'outro'),
      ],
      athleteId: 'ath-paulo',
      todayKey: walletTodayKey,
      bookingStatus: const {'d': 'canceled'},
    );
    expect(r.upcoming.map((l) => l.bookingId), ['b', 'a']);
    expect(r.past.map((l) => l.bookingId), ['d', 'c', 'e']);
    // a, b, c (d cancelada, e é de setembro) × R$ 60.
    expect(r.monthCourtCostReais, 180);
  });

  test('arenas para Nova aula: independente ativo com "Reservar quadras"', () {
    final arenas = professorLessonArenas([
      professorLink(arenaId: 'ind', type: ArenaProfessorLinkType.independent),
      professorLink(arenaId: 'staff'),
      professorLink(
        arenaId: 'ind-pend',
        type: ArenaProfessorLinkType.independent,
        status: ArenaProfessorLinkStatus.pending,
      ),
      professorLink(
        arenaId: 'ind-sem',
        type: ArenaProfessorLinkType.independent,
        permissions: const ArenaProfessorPermissions(
          canManageOwnLessons: true,
          canBookCourts: false,
          canAppearInArenaProfile: true,
        ),
      ),
    ]);
    expect(arenas.map((l) => l.arenaId), ['ind']);
  });
}
