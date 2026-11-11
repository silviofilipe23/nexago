import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_quote.dart';

ArenaBookingQuote _quote({
  double amount = 0,
  int weekly = 0,
  int available = 0,
  int minutes = 0,
  double discount = 0,
  String? reason,
  double athleteDiscount = 0,
}) =>
    ArenaBookingQuote(
      amountReais: amount,
      lineItems: const [],
      athletePricingTier: athleteDiscount > 0 ? 'student' : null,
      athletePricingLabel: athleteDiscount > 0 ? 'Aluno' : null,
      athletePricingDiscountReais: athleteDiscount,
      memberHoursWeeklyMinutes: weekly,
      memberHoursAvailableMinutes: available,
      memberHoursMinutes: minutes,
      memberHoursDiscountReais: discount,
      memberHoursBlockedReason: reason,
    );

void main() {
  group('ArenaBookingQuote.formatMemberHours', () {
    test('formata horas e minutos', () {
      expect(ArenaBookingQuote.formatMemberHours(90), '1h30');
      expect(ArenaBookingQuote.formatMemberHours(60), '1h');
      expect(ArenaBookingQuote.formatMemberHours(30), '30min');
      expect(ArenaBookingQuote.formatMemberHours(180), '3h');
      expect(ArenaBookingQuote.formatMemberHours(65), '1h05');
    });
  });

  group('ArenaBookingQuote — banco de horas do mensalista', () {
    test('coberta inteira: total 0, linha e saldo', () {
      final q = _quote(
        amount: 0,
        weekly: 180,
        available: 180,
        minutes: 60,
        discount: 150,
      );
      expect(q.isMember, isTrue);
      expect(q.hasMemberHours, isTrue);
      expect(q.coveredByMemberHours, isTrue);
      expect(q.amountBeforeMemberHoursReais, 150);
      expect(q.memberHoursLineLabel, 'Banco de horas · 1h');
      expect(q.memberHoursValueLabel, '−${'R\$ 150,00'}');
      expect(q.memberHoursBalanceLabel, 'Restam 2h de 3h nesta semana');
      expect(q.memberHoursNotice, isNull);
      expect(q.memberHoursNoticeIsWarning, isFalse);
    });

    test('parcial: cobra o que passou do banco', () {
      final q = _quote(
        amount: 75,
        weekly: 180,
        available: 30,
        minutes: 30,
        discount: 75,
      );
      expect(q.hasMemberHours, isTrue);
      expect(q.coveredByMemberHours, isFalse);
      expect(q.amountBeforeMemberHoursReais, 150);
      expect(q.memberHoursLineLabel, 'Banco de horas · 30min');
      expect(q.memberHoursBalanceLabel,
          'Sem horas restantes de 3h nesta semana');
    });

    test('semana esgotada: aviso de preço normal', () {
      final q = _quote(
        amount: 150,
        weekly: 180,
        available: 0,
        reason: 'exhausted',
      );
      expect(q.hasMemberHours, isFalse);
      expect(q.memberHoursLineLabel, isNull);
      expect(q.memberHoursValueLabel, isNull);
      expect(q.memberHoursNoticeIsWarning, isTrue);
      expect(
        q.memberHoursNotice,
        'Suas horas desta semana acabaram: esta reserva sai pelo preço normal.',
      );
    });

    test('mensalidade atrasada: aviso de pagar', () {
      final q = _quote(
        amount: 150,
        weekly: 180,
        available: 120,
        reason: 'overdue',
      );
      expect(q.memberHoursNoticeIsWarning, isTrue);
      expect(
        q.memberHoursNotice,
        'Mensalidade em aberto: esta reserva sai pelo preço normal até você pagar.',
      );
    });

    test('cupom mais barato: nota discreta, não é alerta', () {
      final q = _quote(
        amount: 90,
        weekly: 180,
        available: 120,
        reason: 'coupon_cheaper',
      );
      expect(q.memberHoursNoticeIsWarning, isFalse);
      expect(q.memberHoursNotice, contains('cupom'));
      expect(q.memberHoursBalanceLabel, 'Restam 2h de 3h nesta semana');
    });

    test('não mensalista: nada aparece', () {
      final q = _quote(amount: 150);
      expect(q.isMember, isFalse);
      expect(q.hasMemberHours, isFalse);
      expect(q.coveredByMemberHours, isFalse);
      expect(q.memberHoursLineLabel, isNull);
      expect(q.memberHoursBalanceLabel, isNull);
      expect(q.memberHoursNotice, isNull);
    });

    test('preço cheio do perfil inclui o banco (aplicado por cima)', () {
      final q = _quote(
        amount: 50,
        weekly: 180,
        available: 60,
        minutes: 60,
        discount: 100,
        athleteDiscount: 50,
      );
      expect(q.amountBeforeAthletePricingReais, 200);
      expect(q.amountBeforeMemberHoursReais, 150);
    });
  });
}
