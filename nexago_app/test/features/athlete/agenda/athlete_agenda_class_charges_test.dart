import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_class_charges_section.dart';

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

  group('AgendaClassChargesSection', () {
    Future<List<ClassChargeEntry>> pump(
      WidgetTester tester,
      List<ClassChargeEntry> charges,
    ) async {
      tester.view.physicalSize = const Size(560, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final paid = <ClassChargeEntry>[];
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AppTheme.dark,
            home: Scaffold(
              body: ListView(
                children: [
                  AgendaClassChargesSection(charges: charges, onPay: paid.add),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      return paid;
    }

    testWidgets('"Pagar" só na mensalidade com fatura online', (tester) async {
      final online = _charge(const {});
      final manual = _charge(const {
        'chargeId': 'e1_fee',
        'description': 'Taxa de matrícula',
        'payment': 'manual',
        'invoiceUrl': null,
      });
      final paid = await pump(tester, [online, manual]);

      expect(find.text('Mensalidades a pagar'), findsOneWidget);
      expect(find.text('2 EM ABERTO'), findsOneWidget);
      expect(find.text('Pagar'), findsOneWidget);
      expect(find.text('Pagamento direto com a arena'), findsOneWidget);

      await tester
          .tap(find.byKey(const Key('agenda-class-charge-pay-e1_2026-11')));
      expect(paid, [online]);
    });

    testWidgets('sem mensalidade não desenha nada', (tester) async {
      await pump(tester, const []);
      expect(find.text('Mensalidades a pagar'), findsNothing);
    });
  });
}
