import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena_contract/domain/arena_contract.dart';

import 'arena_contract_fixtures.dart';

// Payload da callable `getMyArenaContracts` → modelo do Meu contrato.

void main() {
  group('ArenaContract.fromMap', () {
    test('lê o contrato completo da callable', () {
      final c = ArenaContract.fromMap(contractMap(
        totalInstallments: 6,
        endDate: '2027-03-14',
        autoRenew: false,
        payLink: payLinkMap,
        payments: [
          {
            'paidOn': '2026-10-14',
            'amountReais': 300,
            'installments': 1,
            'method': 'Pix online',
          },
        ],
      ));

      expect(c.id, 'c1');
      expect(c.arenaId, 'a1');
      expect(c.arenaName, 'Arena CFC');
      expect(c.arenaLogoUrl, isNull);
      expect(c.arenaWhatsapp, '5562999990000');
      expect(c.planName, 'Mensalista 3h');
      expect(c.period, 'monthly');
      expect(c.dueDay, 15);
      expect(c.weeklyHours, 3.0);
      expect(c.monthlyPriceReais, 300.0);
      expect(c.startDate, '2026-09-15');
      expect(c.endDate, '2027-03-14');
      expect(c.autoRenew, isFalse);
      expect(c.status, ArenaContractStatus.active);
      expect(c.nextDueDate, '2026-11-15');
      expect(c.overdueCount, 0);
      expect(c.overdueReais, 0);
      expect(c.overdueSince, isNull);
      expect(c.paidInstallments, 2);
      expect(c.totalInstallments, 6);

      expect(c.installments, hasLength(4));
      final first = c.installments.first;
      expect(first.number, 1);
      expect(first.month, '2026-09');
      expect(first.dueDate, '2026-09-15');
      expect(first.amountReais, 300.0);
      expect(first.state, ArenaInstallmentState.paid);
      expect(c.installments.map((i) => i.state), [
        ArenaInstallmentState.paid,
        ArenaInstallmentState.paid,
        ArenaInstallmentState.open,
        ArenaInstallmentState.future,
      ]);

      expect(c.payLink, isNotNull);
      expect(c.payLink!.invoiceUrl, 'https://www.asaas.com/i/crm1');
      expect(c.payLink!.amountReais, 612.5);
      expect(c.payLink!.installments, 2);

      final p = c.payments.single;
      expect(p.paidOn, '2026-10-14');
      expect(p.amountReais, 300.0);
      expect(p.installments, 1);
      expect(p.method, 'Pix online');

      expect(c.weekHours, [2, 3, 1, 0, 3, 2.5, 3, 1.5]);
      expect(c.weekHours, everyElement(isA<double>()));
    });

    test('payload vazio cai nos padrões, sem quebrar', () {
      final c = ArenaContract.fromMap(const {});

      expect(c.id, '');
      expect(c.arenaName, 'Arena');
      expect(c.planName, 'Plano');
      expect(c.period, 'monthly');
      expect(c.dueDay, 5);
      expect(c.weeklyHours, 1.0);
      expect(c.monthlyPriceReais, 0);
      expect(c.autoRenew, isFalse);
      expect(c.status, ArenaContractStatus.active);
      expect(c.nextDueDate, isNull);
      expect(c.endDate, isNull);
      expect(c.totalInstallments, isNull);
      expect(c.installments, isEmpty);
      expect(c.payLink, isNull);
      expect(c.payments, isEmpty);
      expect(c.weekHours, isEmpty);
      expect(c.isOverdue, isFalse);
      expect(c.hoursThisWeek, 0);
    });

    test('status do backend, desconhecido vira ativo', () {
      ArenaContractStatus st(String raw) =>
          ArenaContract.fromMap({'status': raw}).status;
      expect(st('active'), ArenaContractStatus.active);
      expect(st('expiring'), ArenaContractStatus.expiring);
      expect(st('overdue'), ArenaContractStatus.overdue);
      expect(st('not_renewed'), ArenaContractStatus.notRenewed);
      expect(st('canceled'), ArenaContractStatus.canceled);
      expect(st('whatever'), ArenaContractStatus.active);
    });

    test('estado da parcela, desconhecido vira em aberto', () {
      expect(arenaInstallmentStateFrom('paid'), ArenaInstallmentState.paid);
      expect(arenaInstallmentStateFrom('late'), ArenaInstallmentState.late);
      expect(arenaInstallmentStateFrom('link'), ArenaInstallmentState.link);
      expect(arenaInstallmentStateFrom('future'), ArenaInstallmentState.future);
      expect(arenaInstallmentStateFrom('open'), ArenaInstallmentState.open);
      expect(arenaInstallmentStateFrom(''), ArenaInstallmentState.open);
    });

    test('link sem invoiceUrl não conta como link', () {
      final c = ArenaContract.fromMap(contractMap(
        payLink: {'invoiceUrl': '  ', 'amountReais': 300, 'installments': 1},
      ));
      expect(c.payLink, isNull);
    });

    test('pagamento sem método diz "Na arena"', () {
      final c = ArenaContract.fromMap(contractMap(payments: [
        {'paidOn': '2026-10-14', 'amountReais': 300},
      ]));
      expect(c.payments.single.method, 'Na arena');
      expect(c.payments.single.installments, 1);
    });

    test('semana com lixo vira zero; totalInstallments só número', () {
      final c = ArenaContract.fromMap({
        ...contractMap(),
        'weekHours': [1, 'x', null, 2.5],
        'totalInstallments': '3',
      });
      expect(c.weekHours, [1, 0, 0, 2.5]);
      expect(c.totalInstallments, isNull);
    });

    test('números como texto (vírgula) e inteiro em double', () {
      final c = ArenaContract.fromMap({
        ...contractMap(),
        'monthlyPriceReais': '299,90',
        'overdueReais': 150,
        'dueDay': 10.0,
        'totalInstallments': 3.0,
      });
      expect(c.monthlyPriceReais, closeTo(299.9, 1e-9));
      expect(c.overdueReais, 150.0);
      expect(c.dueDay, 10);
      expect(c.totalInstallments, 3);
    });
  });

  group('getters', () {
    test('isOverdue segue o valor em aberto, não o status', () {
      expect(overdueContract().isOverdue, isTrue);
      expect(contract().isOverdue, isFalse);
      final statusOnly = ArenaContract.fromMap(
          contractMap(status: 'overdue', overdueReais: 0, overdueCount: 0));
      expect(statusOnly.isOverdue, isFalse);
    });

    test('horas da semana: a última da série é a corrente', () {
      final c = contract(weekHours: const [3, 3, 1.5]);
      expect(c.hoursThisWeek, 1.5);
      expect(c.hoursLeftThisWeek, 1.5);
    });

    test('sem série, nada reservado e o banco inteiro sobra', () {
      final c = contract(weekHours: const []);
      expect(c.hoursThisWeek, 0);
      expect(c.hoursLeftThisWeek, 3);
    });

    test('estourou o banco: sobra zero, nunca negativo', () {
      expect(contract(weekHours: const [4.5]).hoursLeftThisWeek, 0);
      expect(contract(weekHours: const [3]).hoursLeftThisWeek, 0);
    });

    test('valor a pagar: o do link, senão o atraso', () {
      expect(overdueContract().amountToPay, 600);
      expect(overdueContract(payLink: payLinkMap).amountToPay, 612.5);
      expect(contract().amountToPay, 0);
    });
  });

  group('MyArenaContracts', () {
    test('fromMap lê o hoje e a lista, ignorando o que não é mapa', () {
      final data = MyArenaContracts.fromMap({
        'today': '2026-11-11',
        'contracts': [
          contractMap(id: 'c1'),
          'lixo',
          contractMap(id: 'c2'),
        ],
      });
      expect(data.today, '2026-11-11');
      expect(data.contracts.map((c) => c.id), ['c1', 'c2']);
    });

    test('fromMap vazio', () {
      final data = MyArenaContracts.fromMap(const {});
      expect(data.today, '');
      expect(data.contracts, isEmpty);
    });

    test('byId acha o contrato; sem id ou id sumido, o primeiro', () {
      final data = MyArenaContracts.fromMap({
        'contracts': [contractMap(id: 'c1'), contractMap(id: 'c2')],
      });
      expect(data.byId('c2')!.id, 'c2');
      expect(data.byId('c1')!.id, 'c1');
      expect(data.byId(null)!.id, 'c1');
      expect(data.byId('sumiu')!.id, 'c1');
    });

    test('byId sem contratos é nulo', () {
      expect(const MyArenaContracts().byId('c1'), isNull);
      expect(const MyArenaContracts().byId(null), isNull);
    });
  });
}
