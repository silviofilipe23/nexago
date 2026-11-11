import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena_contract/domain/arena_contract.dart';
import 'package:nexago_app/features/arena_contract/domain/arena_contract_logic.dart';

import 'arena_contract_fixtures.dart';

// Rótulos puros da tela Meu contrato.

void main() {
  group('arenaContractHoursLabel', () {
    test('arredonda para 15 min', () {
      expect(arenaContractHoursLabel(1.13), '1h15');
      expect(arenaContractHoursLabel(0.5), '30min');
      expect(arenaContractHoursLabel(0), '0h');
      expect(arenaContractHoursLabel(3), '3h');
      expect(arenaContractHoursLabel(1.5), '1h30');
      expect(arenaContractHoursLabel(2.75), '2h45');
      expect(arenaContractHoursLabel(0.25), '15min');
    });

    test('perto da hora cheia sobe para a hora, perto do zero fica 0h', () {
      expect(arenaContractHoursLabel(1.99), '2h');
      expect(arenaContractHoursLabel(0.1), '0h');
      expect(arenaContractHoursLabel(0.13), '15min');
    });
  });

  test('período', () {
    expect(arenaContractPeriodLabel('monthly'), 'Mensal');
    expect(arenaContractPeriodLabel('quarterly'), 'Trimestral');
    expect(arenaContractPeriodLabel('semiannual'), 'Semestral');
    expect(arenaContractPeriodLabel('annual'), 'Anual');
    expect(arenaContractPeriodLabel('x'), 'Mensal');
  });

  test('dia/mês e mês curto', () {
    expect(arenaContractDayMonth('2026-11-05'), '05/11');
    expect(arenaContractDayMonth(null), '');
    expect(arenaContractDayMonth('2026-11'), '');
    expect(arenaContractMonthShort('2026-01'), 'JAN');
    expect(arenaContractMonthShort('2026-12'), 'DEZ');
    expect(arenaContractMonthShort('2026-13'), '2026-13');
    expect(arenaContractMonthShort('x'), 'x');
  });

  group('selo de status', () {
    test('em dia, atraso, terminando, encerrado, cancelado', () {
      expect(arenaContractStatusLabel(contract()), 'Em dia');
      expect(arenaContractStatusLabel(overdueContract()), '2 em atraso');
      expect(
        arenaContractStatusLabel(ArenaContract.fromMap(contractMap(
          status: 'overdue',
          overdueCount: 1,
          overdueReais: 300,
        ))),
        '1 em atraso',
      );
      expect(
        arenaContractStatusLabel(ArenaContract.fromMap(
            contractMap(status: 'expiring', endDate: '2026-12-14'))),
        'Termina 14/12',
      );
      expect(
        arenaContractStatusLabel(
            ArenaContract.fromMap(contractMap(status: 'expiring'))),
        'Terminando',
      );
      expect(
        arenaContractStatusLabel(
            ArenaContract.fromMap(contractMap(status: 'not_renewed'))),
        'Encerrado',
      );
      expect(
        arenaContractStatusLabel(
            ArenaContract.fromMap(contractMap(status: 'canceled'))),
        'Cancelado',
      );
    });
  });

  test('linha do preço com dia de vencimento em dois dígitos', () {
    expect(
      arenaContractPriceLine(contract(dueDay: 5), 'R\$ 300'),
      'R\$ 300/mês · vence todo dia 05',
    );
    expect(
      arenaContractPriceLine(contract(dueDay: 15), 'R\$ 300'),
      'R\$ 300/mês · vence todo dia 15',
    );
  });

  group('tags', () {
    test('renova sozinho', () {
      expect(arenaContractTags(contract()),
          ['Mensal', 'Renova sozinho', '3h por semana']);
    });

    test('período fechado mostra o fim', () {
      expect(
        arenaContractTags(contract(
          period: 'quarterly',
          autoRenew: false,
          endDate: '2027-01-14',
          weeklyHours: 1.5,
        )),
        ['Trimestral', 'até 14/01', '1h30 por semana'],
      );
    });

    test('sem renovação e sem fim: só período e horas', () {
      expect(arenaContractTags(contract(autoRenew: false)),
          ['Mensal', '3h por semana']);
    });
  });

  test('rótulo da parcela', () {
    ArenaContractInstallment inst(String state, [String due = '2026-11-15']) =>
        ArenaContractInstallment.fromMap({
          'number': 1,
          'month': '2026-11',
          'dueDate': due,
          'amountReais': 300,
          'state': state,
        });
    expect(arenaInstallmentLabel(inst('paid')), 'Paga');
    expect(arenaInstallmentLabel(inst('late')), 'Atrasada');
    expect(arenaInstallmentLabel(inst('link')), 'A pagar');
    expect(arenaInstallmentLabel(inst('open')), 'Vence 15');
    expect(arenaInstallmentLabel(inst('open', '')), 'Vence ');
    expect(arenaInstallmentLabel(inst('future')), 'Futura');
  });

  test('linha das pagas', () {
    expect(arenaContractPaidLine(contract()), '2 pagas');
    expect(
      arenaContractPaidLine(
          ArenaContract.fromMap(contractMap(paidInstallments: 1))),
      '1 paga',
    );
    expect(
      arenaContractPaidLine(ArenaContract.fromMap(
          contractMap(paidInstallments: 2, totalInstallments: 3))),
      '2 de 3 pagas',
    );
  });

  group('próxima parcela', () {
    test('sem fim: só o número', () {
      expect(arenaContractNextLine(contract()), '15/11 · 3ª parcela');
    });

    test('período fechado: número de total', () {
      expect(
        arenaContractNextLine(ArenaContract.fromMap(
            contractMap(paidInstallments: 2, totalInstallments: 3))),
        '15/11 · 3ª de 3 parcelas',
      );
    });

    test('conta as atrasadas antes da que vem', () {
      expect(arenaContractNextLine(overdueContract()), '15/11 · 3ª parcela');
    });

    test('sem próximo vencimento: nulo', () {
      expect(arenaContractNextLine(contract(nextDueDate: null)), isNull);
    });
  });

  group('banco de horas', () {
    test('linha com o que sobra ou banco usado', () {
      expect(arenaContractHoursLine(contract(weekHours: const [1.5])),
          'de 3h · sobram 1h30');
      expect(arenaContractHoursLine(contract(weekHours: const [3])),
          'de 3h · banco da semana usado');
      expect(arenaContractHoursLine(contract(weekHours: const [5])),
          'de 3h · banco da semana usado');
    });

    test('fração da barra, presa entre 0 e 1', () {
      expect(arenaContractHoursFraction(contract(weekHours: const [1.5])), 0.5);
      expect(arenaContractHoursFraction(contract(weekHours: const [6])), 1);
      expect(arenaContractHoursFraction(contract(weekHours: const [])), 0);
      expect(
        arenaContractHoursFraction(
            contract(weeklyHours: 0, weekHours: const [2])),
        0,
      );
    });
  });

  test('mensagem do WhatsApp: com dívida cita o valor', () {
    expect(
      arenaContractWhatsappMessage(overdueContract(), 'R\$ 600'),
      'Oi! Sou mensalista do Mensalista 3h. Vi no app que tenho R\$ 600 em '
      'aberto e queria acertar.',
    );
    expect(
      arenaContractWhatsappMessage(contract(), 'R\$ 0'),
      'Oi! Sou mensalista do Mensalista 3h e tenho uma dúvida sobre o meu '
      'contrato.',
    );
  });

  test('caminho do Meu contrato', () {
    expect(arenaContractLocation('c1'), '/meu-contrato?id=c1');
    expect(arenaContractLocation(' c1 '), '/meu-contrato?id=c1');
    expect(arenaContractLocation(null), '/meu-contrato');
    expect(arenaContractLocation('  '), '/meu-contrato');
    expect(arenaContractLocation('a b&c'), '/meu-contrato?id=a+b%26c');
    expect(arenaContractLocation('c1', base: '/x'), '/x?id=c1');
  });
}
