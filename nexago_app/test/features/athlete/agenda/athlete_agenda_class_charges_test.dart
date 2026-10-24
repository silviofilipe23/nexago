import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';

/// Item de `getMyClassCharges` (`functions/src/arena-class-athlete-charges.ts`).
ClassChargeEntry _charge(Map<String, Object?> over) =>
    ClassChargeEntry.fromMap({
      'chargeId': 'e1_2026-11',
      'arenaId': 'arena1',
      'arenaName': 'Arena CFC',
      'description': 'Mensal 2x · Novembro',
      'amountReais': 180,
      'dueDate': '2026-11-05',
      'overdue': false,
      'payment': 'online',
      'invoiceUrl': 'https://www.asaas.com/i/abc123',
      ...over,
    });

void main() {
  group('ClassChargeEntry', () {
    test('lê o item da callable', () {
      final c = _charge(const {});
      expect(c.arenaName, 'Arena CFC');
      expect(c.amountReais, 180.0);
      expect(c.canPayOnline, isTrue);
      expect(classChargeDueLabel(c), 'Vence 05/11');
      expect(classChargeInfoLabel(c), isNull);
    });

    test('vencida diz "Venceu"', () {
      final c = _charge(const {'dueDate': '2026-10-05', 'overdue': true});
      expect(classChargeDueLabel(c), 'Venceu 05/10');
    });

    test('sem fatura: em preparo ou direto com a arena, sem botão', () {
      final preparing =
          _charge(const {'payment': 'preparing', 'invoiceUrl': null});
      final manual = _charge(const {'payment': 'manual', 'invoiceUrl': null});
      expect(preparing.canPayOnline, isFalse);
      expect(classChargeInfoLabel(preparing), 'Link de pagamento em preparo');
      expect(classChargeInfoLabel(manual), 'Pagamento direto com a arena');
    });

    test('link que não é http(s) não vira botão', () {
      final c = _charge(const {'invoiceUrl': 'javascript:alert(1)'});
      expect(c.invoiceUrl, isNull);
      expect(c.canPayOnline, isFalse);
    });
  });
}
