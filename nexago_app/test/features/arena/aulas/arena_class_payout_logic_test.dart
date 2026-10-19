import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_teacher.dart';

import 'arena_class_fixtures.dart';
import 'arena_class_payout_fixtures.dart';

void main() {
  group('rótulos do modelo', () {
    test('modelo → texto curto, como no portal', () {
      expect(arenaClassPayoutModelLabel(null), 'Não definido');
      expect(arenaClassPayoutModelLabel(revenueShare(50)), '50% da receita');
      expect(
          arenaClassPayoutModelLabel(revenueShare(45.5)), '45,5% da receita');
      expect(arenaClassPayoutModelLabel(perClass(45)),
          '${formatBRLWhole(45)} / aula');
      expect(arenaClassPayoutModelLabel(perStudent(15.5)),
          '${formatBRL(15.5)} / aluno presente');
    });

    test('base de cálculo segue o modelo', () {
      const base = ArenaClassPayoutFigures(
        teacherId: 't',
        teacherName: 'T',
        teacherColor: '#FF6A1A',
        model: null,
        classesGiven: 1,
        presences: 12,
        revenueReais: 1920,
      );
      expect(arenaClassPayoutBaseLabel(base), '—');
      expect(
        arenaClassPayoutBaseLabel(figures(model: perClass(45), classes: 1)),
        '1 aula',
      );
      expect(
        arenaClassPayoutBaseLabel(
            figures(model: perStudent(10), presences: 12)),
        '12 presenças',
      );
      expect(
        arenaClassPayoutBaseLabel(
            figures(model: revenueShare(50), revenue: 1920)),
        '${formatBRL(1920)} de receita',
      );
    });

    test('coluna e regra de repasse', () {
      expect(arenaClassPayoutColumnLabel(revenueShare(50)), 'Repasse 50%');
      expect(arenaClassPayoutColumnLabel(perClass(45)),
          'Repasse · ${formatBRLWhole(45)}');
      final facts = arenaClassPayoutRuleFacts(revenueShare(50));
      expect(facts.first, ('Modelo', '50% da receita'));
      expect(facts, contains(('Taxa de matrícula', 'Fica com a arena')));
      expect(arenaClassPayoutRuleFacts(perStudent(10)),
          contains(('Conta', 'Aluno presente (encaixe incluso)')));
      expect(arenaClassPayoutRuleFacts(null).last,
          ('Aula cancelada', 'Não entra'));
    });

    test('formas de pagamento e ajuste com sinal', () {
      expect(ArenaClassPayoutMethod.values.map((m) => m.label),
          ['PIX', 'Transferência', 'Dinheiro']);
      expect(ArenaClassPayoutMethodX.fromId('card_machine'), isNull);
      expect(arenaClassSignedBrl(-120), '− ${formatBRL(120)}');
      expect(arenaClassSignedBrl(50.5), '+ ${formatBRL(50.5)}');
    });
  });

  group('meses', () {
    test('navegação e rótulos', () {
      expect(arenaClassShiftMonth('2026-01', -1), '2025-12');
      expect(arenaClassShiftMonth('2026-12', 1), '2027-01');
      expect(arenaClassMonthLongLabel('2026-10'), 'outubro de 2026');
      expect(arenaClassMonthSlashLabel('2026-03'), 'março/2026');
      expect(arenaClassMonthShortLabel('2026-09'), 'set');
      expect(arenaClassMonthLastDay('2026-02'), '2026-02-28');
      expect(arenaClassMonthLastDay('2028-02'), '2028-02-29');
      expect(arenaClassIsMonthKey('2026-13'), isFalse);
      expect(arenaClassIsMonthKey('2026-10'), isTrue);
      expect(arenaClassPayoutId('a1', 't1', '2026-10'), 'a1_t1_2026-10');
    });

    test('nos 10 primeiros dias abre no mês anterior', () {
      expect(arenaClassDefaultPayoutMonth('2026-11-03'), '2026-10');
      expect(arenaClassDefaultPayoutMonth('2026-11-10'), '2026-10');
      expect(arenaClassDefaultPayoutMonth('2026-11-11'), '2026-11');
      expect(arenaClassDefaultPayoutMonth('2026-01-05'), '2025-12');
    });
  });

  group('situação do mês', () {
    const today = '2026-11-03';

    test('sem modelo / parcial / a fechar / a pagar / pago', () {
      expect(
        arenaClassPayoutState(
            closed: null, model: null, month: '2026-10', todayKey: today),
        ArenaClassPayoutState.noModel,
      );
      expect(
        arenaClassPayoutState(
            closed: null,
            model: revenueShare(50),
            month: '2026-11',
            todayKey: today),
        ArenaClassPayoutState.partial,
      );
      expect(
        arenaClassPayoutState(
            closed: null,
            model: revenueShare(50),
            month: '2026-10',
            todayKey: today),
        ArenaClassPayoutState.toClose,
      );
      expect(
        arenaClassPayoutState(
            closed: payout(), model: null, month: '2026-10', todayKey: today),
        ArenaClassPayoutState.closed,
      );
      expect(
        arenaClassPayoutState(
            closed: payout(status: 'paid'),
            model: null,
            month: '2026-10',
            todayKey: today),
        ArenaClassPayoutState.paid,
      );
      expect(
        ArenaClassPayoutState.values.map((s) => s.label),
        ['Sem modelo', 'Parcial', 'A fechar', 'A pagar', 'Pago'],
      );
    });

    test('texto e subtítulo do valor no pago', () {
      final paid = payout(
        status: 'paid',
        paidOn: '2026-11-05',
        method: ArenaClassPayoutMethod.transfer,
      );
      expect(arenaClassPayoutStateText(ArenaClassPayoutState.paid, paid),
          'Pago 05 nov');
      expect(arenaClassPayoutAmountSub(ArenaClassPayoutState.paid, paid),
          'Transferência · 05 nov');
      expect(arenaClassPayoutStateText(ArenaClassPayoutState.closed, payout()),
          'A pagar');
      expect(arenaClassPayoutAmountSub(ArenaClassPayoutState.closed, payout()),
          'Fechado · falta registrar o pagamento');
      expect(arenaClassPayoutAmountSub(ArenaClassPayoutState.toClose, null),
          'Calculado hoje · falta fechar o mês');
    });

    test('fechado com valor diferente da prévia de hoje = recalcular', () {
      final closed = payout(computed: 960);
      expect(arenaClassPayoutIsStale(closed, previewTeacher(amount: 960)),
          isFalse);
      expect(arenaClassPayoutIsStale(closed, previewTeacher(amount: 1000)),
          isTrue);
      // Pago não acusa: não dá mais para recalcular.
      expect(
        arenaClassPayoutIsStale(
            payout(computed: 960, status: 'paid'), previewTeacher(amount: 1)),
        isFalse,
      );
    });
  });

  group('linhas do mês', () {
    const today = '2026-11-03';

    test('o fechado manda nos números; fechado sem prévia continua', () {
      final rows = buildArenaClassPayoutRows(
        preview: [
          previewTeacher(id: 't1', name: 'Thiago', amount: 1000),
          previewTeacher(id: 't2', name: 'Ana', amount: 300, model: null),
        ],
        closed: [
          payout(teacherId: 't1', name: 'Thiago', computed: 960, amount: 900),
          payout(teacherId: 't9', name: 'Marcos', amount: 120, status: 'paid'),
          // Outro mês: não entra.
          payout(teacherId: 't2', name: 'Ana', month: '2026-09'),
        ],
        month: '2026-10',
        todayKey: today,
      );
      expect(rows.map((r) => r.teacherName), ['Ana', 'Marcos', 'Thiago']);
      expect(rows[0].state, ArenaClassPayoutState.noModel);
      expect(rows[1].state, ArenaClassPayoutState.paid);
      expect(rows[2].state, ArenaClassPayoutState.closed);
      expect(rows[2].valueReais, 900);
      expect(rows[2].stale, isTrue); // fechou com 960, hoje dá 1000

      final totals = arenaClassPayoutTotals(rows);
      expect(totals.totalReais, 1320);
      expect(totals.paidReais, 120);
      expect(totals.toPayReais, 1200);
      expect(totals.paidCount, 1);
      expect(totals.teachers, 3);
    });
  });

  group('formulários', () {
    test('decimal brasileiro sem transformar 12.50 em 1250', () {
      expect(arenaClassParseDecimal('1.200,50'), 1200.5);
      expect(arenaClassParseDecimal('12.5'), 12.5);
      expect(arenaClassParseDecimal('12.50'), 12.5);
      expect(arenaClassParseDecimal('1.200'), 1200);
      expect(arenaClassParseDecimal('-120'), -120);
      expect(arenaClassParseDecimal('-12.5'), -12.5);
      expect(arenaClassParseDecimal('−30,5'), -30.5);
      expect(arenaClassParseDecimal(''), isNull);
      expect(arenaClassParseDecimal('abc'), isNull);
      expect(arenaClassParseDecimal('Infinity'), isNull);
    });

    test('rascunho do modelo valida faixa e arredonda', () {
      final share = arenaClassPayoutModelFromDraft(
          ArenaClassPayoutModelKind.revenueShare, '45,555');
      expect(share.model, revenueShare(45.56));
      expect(
        arenaClassPayoutModelFromDraft(
                ArenaClassPayoutModelKind.revenueShare, '120')
            .error,
        'Informe um percentual entre 0 e 100.',
      );
      expect(
        arenaClassPayoutModelFromDraft(ArenaClassPayoutModelKind.perClass, '0')
            .error,
        'Informe um valor entre R\$ 0,01 e R\$ 10.000.',
      );
      expect(
        arenaClassPayoutModelFromDraft(
                ArenaClassPayoutModelKind.perStudent, '15')
            .model,
        perStudent(15),
      );
      expect(arenaClassPayoutDraftValue(revenueShare(50)), '50');
      expect(arenaClassPayoutDraftValue(perClass(45.5)), '45,5');
    });

    test('payload do modelo leva só o campo do tipo', () {
      expect(revenueShare(50).toPayload(),
          {'model': 'revenue_share', 'percent': 50.0, 'amountReais': null});
      expect(perClass(45).toPayload(),
          {'model': 'per_class', 'percent': null, 'amountReais': 45.0});
    });

    test('total do fechamento com ajuste', () {
      expect(arenaClassPayoutCloseTotal(960, ''), 960);
      expect(arenaClassPayoutCloseTotal(960, '-120'), 840);
      expect(arenaClassPayoutCloseTotal(960, '10,5'), 970.5);
      expect(arenaClassPayoutCloseTotal(960, '-1000'), isNull); // negativo
      expect(arenaClassPayoutCloseTotal(960, 'x'), isNull);
    });
  });

  group('parse', () {
    test('prévia da callable (mapas aninhados Object?)', () {
      final preview = ArenaClassPayoutPreview.fromMap(<Object?, Object?>{
        'month': '2026-10',
        'revenueReais': 3200,
        'feesReais': 80.5,
        'unassignedReais': 0,
        'teachers': [
          <Object?, Object?>{
            'teacherId': 't1',
            'teacherName': 'Thiago Mendes',
            'teacherColor': '#5B9BFF',
            'teacherStatus': 'active',
            'model': <Object?, Object?>{
              'model': 'revenue_share',
              'percent': 50,
              'amountReais': null,
            },
            'classesGiven': 9,
            'presences': 40,
            'students': 12,
            'pendingSessions': 1,
            'canceledSessions': 2,
            'revenueReais': 1920,
            'amountReais': 960,
            'lines': [
              <Object?, Object?>{
                'key': 'c1',
                'label': 'Iniciante A',
                'detail': 'Turma · seg/qua',
                'classes': 9,
                'presences': 40,
                'payingStudents': 8,
                'revenueReais': 1920,
                'amountReais': 960,
              },
            ],
          },
          'lixo',
        ],
      });
      expect(preview.revenueReais, 3200);
      expect(preview.feesReais, 80.5);
      final t = preview.teacher('t1')!;
      expect(t.model, revenueShare(50));
      expect(t.pendingSessions, 1);
      expect(t.canceledSessions, 2);
      expect(t.lines.single.payingStudents, 8);
      expect(t.lines.single.amountReais, 960);
      expect(preview.teachers, hasLength(1));
      expect(preview.teacher('x'), isNull);
    });

    test('modelo inválido = sem modelo', () {
      expect(ArenaClassTeacherPayoutModel.fromMap(null), isNull);
      expect(ArenaClassTeacherPayoutModel.fromMap({'model': 'revenue_share'}),
          isNull);
      expect(
          ArenaClassTeacherPayoutModel.fromMap({'model': 'x', 'percent': 50}),
          isNull);
      expect(
        ArenaClassTeacherPayoutModel.fromMap(
            {'model': 'per_class', 'amountReais': 45}),
        perClass(45),
      );
    });

    test('fechamento gravado', () {
      final p = ArenaClassPayout.fromMap('a1_t1_2026-10', {
        'arenaId': 'a1',
        'teacherId': 't1',
        'teacherName': 'Thiago',
        'month': '2026-10',
        'model': {'model': 'per_student', 'amountReais': 10},
        'computedReais': 400,
        'adjustmentReais': -40,
        'adjustmentNote': 'Aula de 08/10 sem substituto',
        'amountReais': 360,
        'status': 'paid',
        'paidOn': '2026-11-05',
        'paymentMethod': 'cash',
        'lines': const [],
      });
      expect(p.isPaid, isTrue);
      expect(p.model, perStudent(10));
      expect(p.adjustmentReais, -40);
      expect(p.paymentMethod, ArenaClassPayoutMethod.cash);
      expect(p.amountReais, 360);
    });

    test('professor do cadastro', () {
      final t = ArenaClassTeacher.fromMap('t1', {
        'name': 'Juliana Rocha',
        'userId': 'u1',
        'color': '#5B9BFF',
        'status': 'archived',
        'specialty': 'Beach Tennis · Kids',
        'payout': {'model': 'revenue_share', 'percent': 40},
      });
      expect(t.isActive, isFalse);
      expect(t.payout, revenueShare(40));
      expect(t.specialty, 'Beach Tennis · Kids');
    });
  });

  group('professores', () {
    test('aulas/semana e alunos só das turmas recorrentes ativas', () {
      final stats = arenaClassTeacherStats([
        arenaClass(id: 'c1', teacherId: 't1', weekdays: const [1, 3]),
        arenaClass(id: 'c2', teacherId: 't1', weekdays: const [2]),
        arenaClass(id: 'c3', teacherId: 't1', weekdays: const []), // avulsa
        arenaClass(
            id: 'c4', teacherId: 't1', weekdays: const [5], status: 'paused'),
      ]);
      expect(stats['t1']!.classesPerWeek, 3);
      expect(stats['t2'], isNull);
    });

    test('ativos antes dos arquivados', () {
      final list = arenaClassTeachersForList([
        teacher(id: 'b', name: 'Bruno', status: 'archived'),
        teacher(id: 'z', name: 'Zeca'),
        teacher(id: 'a', name: 'Ana'),
      ]);
      expect(list.map((t) => t.id), ['a', 'z', 'b']);
    });
  });
}
