import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena_contract/domain/arena_contract.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';

import 'arena_contract_fixtures.dart';

// Contrato de mensalista nas Cobranças do atleta: em aberto e recorrentes.

const _uid = 'me';
final _now = DateTime(2026, 11, 3, 10);
const _today = '2026-11-03';

List<AthleteCharge> _open(List<ArenaContract> contracts,
        {String today = _today,
        List<ClassChargeEntry> classCharges = const []}) =>
    buildOpenCharges(
      uid: _uid,
      todayKey: today,
      now: _now,
      classCharges: classCharges,
      arenaContracts: contracts,
    );

void main() {
  test('tipo Mensalidade, chave da rota e volta pela chave', () {
    expect(AthleteChargeKind.membership.label, 'Mensalidade');
    expect(AthleteChargeKind.membership.key, 'mensalidade');
    expect(
        athleteChargeKindFromKey('mensalidade'), AthleteChargeKind.membership);
  });

  group('buildOpenCharges · contrato', () {
    test('atrasado com link: o atraso todo, desde a mais antiga, vencido', () {
      final c = _open([overdueContract(payLink: payLinkMap)]).single;
      expect(c.id, 'contract-c1');
      expect(c.kind, AthleteChargeKind.membership);
      expect(c.title, 'Mensalidade · Mensalista 3h');
      expect(c.payee, 'Arena CFC');
      expect(c.amountReais, 600);
      expect(c.dueDate, '2026-09-15');
      expect(c.state, AthleteChargeState.overdue);
      expect(c.isOverdue, isTrue);
      expect(c.note, '2 parcelas');
      expect(c.target, isA<ArenaContractChargeTarget>());
      expect((c.target as ArenaContractChargeTarget).contractId, 'c1');
    });

    test('atrasado sem link: paga na arena', () {
      final c = _open([overdueContract()]).single;
      expect(c.state, AthleteChargeState.overdue);
      expect(c.note, '2 parcelas · na arena');
    });

    test('uma parcela atrasada com link: sem nota', () {
      final c = _open([
        ArenaContract.fromMap(contractMap(
          status: 'overdue',
          overdueCount: 1,
          overdueReais: 300,
          overdueSince: '2026-10-15',
          payLink: payLinkMap,
        )),
      ]).single;
      expect(c.note, isNull);
      expect(c.amountReais, 300);
    });

    test('atraso entra mesmo com a próxima longe', () {
      final c = _open([overdueContract()], today: '2026-10-01').single;
      expect(c.state, AthleteChargeState.overdue);
    });

    test('em dia com link e vencendo em até 10 dias: a pagar', () {
      final c =
          _open([contract(nextDueDate: '2026-11-10', payLink: payLinkMap)])
              .single;
      expect(c.id, 'contract-c1');
      expect(c.kind, AthleteChargeKind.membership);
      expect(c.amountReais, 300);
      expect(c.dueDate, '2026-11-10');
      expect(c.state, AthleteChargeState.due);
      expect(c.note, isNull);
      expect((c.target as ArenaContractChargeTarget).contractId, 'c1');
    });

    test('em dia sem link: direto na arena', () {
      final c = _open([contract(nextDueDate: '2026-11-10')]).single;
      expect(c.state, AthleteChargeState.direct);
      expect(c.note, 'na arena');
      expect(c.amountReais, 300);
    });

    test('janela de 10 dias: o 10º entra, o 11º não', () {
      expect(arenaContractUpcomingDays, 10);
      expect(_open([contract(nextDueDate: '2026-11-13')]), hasLength(1));
      expect(_open([contract(nextDueDate: '2026-11-14')]), isEmpty);
      expect(_open([contract(nextDueDate: '2026-12-15')]), isEmpty);
    });

    test('vence hoje entra', () {
      expect(_open([contract(nextDueDate: _today)]).single.dueDate, _today);
    });

    test('janela atravessa a virada do mês', () {
      expect(
        _open([contract(nextDueDate: '2026-12-05')], today: '2026-11-28'),
        hasLength(1),
      );
    });

    test('sem próximo vencimento ou hoje inválido: não cobra', () {
      expect(_open([contract(nextDueDate: null)]), isEmpty);
      expect(_open([contract(nextDueDate: '2026-11-10')], today: ''), isEmpty);
    });

    test('vários contratos: atrasado primeiro, junto com as outras origens',
        () {
      final list = _open(
        [
          contract(id: 'em-dia', nextDueDate: '2026-11-06'),
          overdueContract(id: 'atrasado'),
          contract(id: 'longe', nextDueDate: '2026-12-15'),
        ],
        classCharges: [
          ClassChargeEntry(
            chargeId: 'cc1',
            arenaId: 'a1',
            arenaName: 'Arena CFC',
            description: 'Mensalidade nov',
            amountReais: 200,
            dueDate: '2026-11-05',
            overdue: false,
            payment: 'online',
            invoiceUrl: 'https://asaas.com/i/1',
            source: 'arena',
          ),
        ],
      );
      expect(list.map((c) => c.id), [
        'contract-atrasado',
        'class-cc1',
        'contract-em-dia',
      ]);
    });

    test('resumo conta a mensalidade', () {
      final summary = AthleteChargesSummary.of(_open([
        overdueContract(id: 'a'),
        contract(id: 'b', nextDueDate: '2026-11-10', payLink: payLinkMap),
      ]));
      expect(summary.overdueCount, 1);
      expect(summary.overdueTotal, 600);
      expect(summary.dueCount, 1);
      expect(summary.total, 900);
    });
  });

  group('buildRecurringCharges · contrato', () {
    test('mensalista com link: Pix ou cartão e a próxima', () {
      final r = buildRecurringCharges(
        uid: _uid,
        arenaContracts: [contract(payLink: payLinkMap, dueDay: 5)],
      ).single;
      expect(r.id, 'contract-c1');
      expect(r.kind, AthleteChargeKind.membership);
      expect(r.title, 'Mensalista 3h');
      expect(r.payee, 'Arena CFC');
      expect(r.cycleLabel, 'Mensal · dia 05 · mensalista · 3h por semana');
      expect(r.amountReais, 300);
      expect(r.methodLabel, 'Pix ou cartão');
      expect(r.nextLabel, 'Próxima 15/11');
      expect(r.target, isA<ArenaContractPlanTarget>());
      expect((r.target as ArenaContractPlanTarget).contractId, 'c1');
    });

    test('sem link, período fechado e sem próxima', () {
      final r = buildRecurringCharges(
        uid: _uid,
        arenaContracts: [
          contract(
            period: 'quarterly',
            weeklyHours: 1.5,
            nextDueDate: null,
          ),
        ],
      ).single;
      expect(r.methodLabel, 'Na arena');
      expect(
          r.cycleLabel, 'Trimestral · dia 15 · mensalista · 1h30 por semana');
      expect(r.nextLabel, isNull);
    });

    test('um recorrente por contrato', () {
      final list = buildRecurringCharges(
        uid: _uid,
        arenaContracts: [contract(id: 'x'), overdueContract(id: 'y')],
      );
      expect(list.map((r) => r.id), ['contract-x', 'contract-y']);
    });
  });
}
