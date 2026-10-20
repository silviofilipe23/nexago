import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students_logic.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_shell_page.dart';

import 'professor_students_test_support.dart';

ProfessorStudent student(Map<String, Object?> over) =>
    ProfessorStudent.fromMap(studentMap(over));

ProfessorClassSummary cls(Map<String, Object?> over) =>
    ProfessorClassSummary.fromMap(classMap(over));

ProfessorStudentPlan plan(Map<String, Object?> map) =>
    ProfessorStudentPlan.fromMap(map);

List<String> names(List<ProfessorStudent> list) =>
    [for (final s in list) s.name];

void main() {
  group('ProfessorStudentsSnapshot.fromMap', () {
    test('lê arenas, turmas e alunos do payload da callable', () {
      // Arrange / Act
      final snap = professorStudentsSnapshot();

      // Assert
      expect(snap.todayKey, '2026-10-20');
      expect(snap.arenas, hasLength(2));
      final cfc = snap.arena('arena-cfc')!;
      expect(cfc.arenaName, 'Arena CFC');
      expect(cfc.type, ArenaProfessorLinkType.arenaStaff);
      expect(cfc.canSeeStudents, isTrue);
      expect(cfc.studentCount, 2);
      expect(
          snap.arena('arena-norte')!.type, ArenaProfessorLinkType.independent);
      expect(snap.arena('nao-existe'), isNull);

      expect(snap.classes, hasLength(2));
      final c1 = snap.classes.first;
      expect(c1.type, ArenaClassType.turma);
      expect(c1.level, ArenaClassLevel.iniciante);
      expect(c1.weekdays, [2, 4]);
      expect(c1.capacity, 6);
      expect(c1.activeCount, 4);
      expect(c1.presenceRate, 88);
      expect(c1.nextDate, '2026-10-22');
      expect(c1.isPaused, isFalse);
      expect(snap.classes.last.type, ArenaClassType.particular);

      expect(snap.students, hasLength(3));
      expect(snap.student('arena-cfc', 's2')!.name, 'Maria Souza');
      // Mesmo studentId em outra arena não é o mesmo aluno.
      expect(snap.student('arena-norte', 's2'), isNull);
    });

    test('aluno: classes, marcas (com reposição), plano e cobrança', () {
      final s = student({});

      expect(s.key, 'arena-cfc::s1');
      expect(s.athleteId, 'ath-1');
      expect(s.photoUrl, isNull);
      expect(s.paused, isFalse);
      expect(s.since, '2025-03-10');
      expect(s.classes.single.name, 'Iniciante A');
      expect(s.classes.single.type, ArenaClassType.turma);
      expect([
        for (final m in s.marks) m.mark
      ], [
        ProfessorMark.present,
        ProfessorMark.absent,
        ProfessorMark.present,
      ]);
      expect([for (final m in s.marks) m.makeup], [false, false, true]);
      expect(s.presenceRate, 95);
      expect(s.lastDate, '2026-10-16');
      expect(s.credits, 1);

      final p = s.plans.single;
      expect(p.enrollmentId, 'e1');
      expect(p.kind, 'monthly');
      expect(p.priceReais, 280.0);
      expect(p.paused, isFalse);
      expect(p.isPackage, isFalse);

      expect(s.billing!.standing, ProfessorBillingStanding.upToDate);
      expect(s.billing!.nextDueDate, '2026-11-05');
      expect(s.billing!.isPending, isFalse);
    });

    test('billing null (fora da equipe da arena) fica null', () {
      final s = student({'billing': null, 'plans': null});
      expect(s.billing, isNull);
      expect(s.plans, isEmpty);
    });

    test('situação do pagamento: cada valor e o desconhecido', () {
      ProfessorBillingStanding standing(Object? raw) =>
          ProfessorStudentBilling.fromMap({'standing': raw}).standing;

      expect(standing('due_today'), ProfessorBillingStanding.dueToday);
      expect(standing('overdue'), ProfessorBillingStanding.overdue);
      expect(standing('paused'), ProfessorBillingStanding.paused);
      expect(standing('no_plan'), ProfessorBillingStanding.noPlan);
      expect(standing('up_to_date'), ProfessorBillingStanding.upToDate);
      // Desconhecido cai em "Em dia" (default do modelo).
      expect(standing('algo_novo'), ProfessorBillingStanding.upToDate);
      expect(standing(null), ProfessorBillingStanding.upToDate);

      expect(
        ProfessorStudentBilling.fromMap({'standing': 'overdue'}).isPending,
        isTrue,
      );
      expect(
        ProfessorStudentBilling.fromMap({'standing': 'due_today'}).isPending,
        isTrue,
      );
      expect(
        ProfessorStudentBilling.fromMap({'standing': 'paused'}).isPending,
        isFalse,
      );
    });

    test('marca desconhecida vira falta; justificada é excused', () {
      expect(ProfessorStudentMark.fromMap({'mark': 'excused'}).mark,
          ProfessorMark.excused);
      expect(ProfessorStudentMark.fromMap({'mark': '???'}).mark,
          ProfessorMark.absent);
    });

    test('payload vazio ou malformado não quebra (defaults)', () {
      final snap = ProfessorStudentsSnapshot.fromMap({
        'arenas': 'não é lista',
        'classes': [
          {
            'classId': 'c9',
            'type': 'xpto',
            'weekdays': [1, 'x', 3.0]
          },
          'lixo',
        ],
        'students': [
          {
            'studentId': 's9',
            'name': '',
            'status': 'paused',
            'presenceRate': 87.6,
          },
        ],
      });

      expect(snap.todayKey, '');
      expect(snap.arenas, isEmpty);
      final c = snap.classes.single;
      expect(c.name, 'Aula');
      expect(c.arenaName, 'Arena');
      expect(c.type, ArenaClassType.turma);
      expect(c.level, ArenaClassLevel.livre);
      expect(c.weekdays, [1, 3]);
      expect(c.presenceRate, isNull);
      expect(c.nextDate, isNull);

      final s = snap.students.single;
      expect(s.name, 'Aluno');
      expect(s.paused, isTrue);
      expect(s.presenceRate, 88);
      expect(s.credits, 0);
      expect(s.classes, isEmpty);
      expect(s.billing, isNull);
    });

    test('arena sem relationshipType: professor das Aulas de antes', () {
      final a = ProfessorArenaSummary.fromMap(arenaMap(type: null));
      expect(a.type, isNull);
    });

    test('plano pausado e pacote', () {
      final p = plan({
        'status': 'paused',
        'kind': 'package',
        'credits': 10,
        'creditsLeft': 4,
        'expiresOn': '2026-12-31',
      });
      expect(p.paused, isTrue);
      expect(p.isPackage, isTrue);
      expect(p.name, 'Plano');
      expect(p.priceReais, 0);
      expect(p.credits, 10);
      expect(p.creditsLeft, 4);
      expect(p.expiresOn, '2026-12-31');
    });

    test('ProfessorStudentsSnapshot.empty não tem nada', () {
      expect(ProfessorStudentsSnapshot.empty.arenas, isEmpty);
      expect(ProfessorStudentsSnapshot.empty.students, isEmpty);
      expect(ProfessorStudentsSnapshot.empty.classes, isEmpty);
    });
  });

  group('professorVisibleStudents', () {
    final all = professorStudentsSnapshot().students;

    test('sem filtro: todos, em todas as arenas', () {
      expect(names(professorVisibleStudents(all)),
          ['João Silva', 'Maria Souza', 'Pedro Lima']);
    });

    test('escopo da arena', () {
      expect(names(professorVisibleStudents(all, arenaId: 'arena-norte')),
          ['Pedro Lima']);
      expect(names(professorVisibleStudents(all, arenaId: 'arena-cfc')),
          ['João Silva', 'Maria Souza']);
      expect(professorVisibleStudents(all, arenaId: 'outra'), isEmpty);
    });

    test('chip Turma', () {
      expect(
        names(professorVisibleStudents(all,
            filter: ProfessorStudentFilter.turma)),
        ['João Silva', 'Maria Souza'],
      );
    });

    test('chip Particular pega particular e dupla, não experimental', () {
      final list = [
        ...all,
        student({
          'studentId': 's4',
          'name': 'Ana Dupla',
          'classes': [studentClassMap(type: 'dupla')],
        }),
        student({
          'studentId': 's5',
          'name': 'Bia Experimental',
          'classes': [studentClassMap(type: 'experimental')],
        }),
      ];
      expect(
        names(professorVisibleStudents(list,
            filter: ProfessorStudentFilter.particular)),
        ['Pedro Lima', 'Ana Dupla'],
      );
    });

    test('aluno em turma e particular aparece nos dois chips', () {
      final both = student({
        'classes': [
          studentClassMap(),
          studentClassMap(classId: 'c2', type: 'particular'),
        ],
      });
      expect(
        professorVisibleStudents([both], filter: ProfessorStudentFilter.turma),
        hasLength(1),
      );
      expect(
        professorVisibleStudents([both],
            filter: ProfessorStudentFilter.particular),
        hasLength(1),
      );
    });

    test('chip Pendentes: atrasado e vence hoje; sem cobrança fica fora', () {
      final list = [
        ...all,
        student({
          'studentId': 's6',
          'name': 'Caio Hoje',
          'billing': {'standing': 'due_today'},
        }),
      ];
      expect(
        names(professorVisibleStudents(list,
            filter: ProfessorStudentFilter.pending)),
        ['Maria Souza', 'Caio Hoje'],
      );
    });

    test('busca sem acento e sem caixa ("joao" acha "João")', () {
      expect(
          names(professorVisibleStudents(all, query: 'joao')), ['João Silva']);
      expect(names(professorVisibleStudents(all, query: '  SOUZA ')),
          ['Maria Souza']);
      expect(
          names(professorVisibleStudents(all, query: 'JOÃO')), ['João Silva']);
      expect(professorVisibleStudents(all, query: 'zzz'), isEmpty);
      // Busca em branco não filtra.
      expect(professorVisibleStudents(all, query: '   '), hasLength(3));
    });

    test('busca + chip + escopo se combinam', () {
      expect(
        professorVisibleStudents(
          all,
          arenaId: 'arena-norte',
          filter: ProfessorStudentFilter.turma,
          query: 'pedro',
        ),
        isEmpty,
      );
      expect(
        names(professorVisibleStudents(
          all,
          arenaId: 'arena-cfc',
          filter: ProfessorStudentFilter.pending,
          query: 'mar',
        )),
        ['Maria Souza'],
      );
    });
  });

  group('professorShowsPendingFilter / professorPendingCount', () {
    final all = professorStudentsSnapshot().students;

    test('aparece quando algum aluno do escopo tem cobrança', () {
      expect(professorShowsPendingFilter(all), isTrue);
      expect(
        professorShowsPendingFilter(
            professorStudentsInScope(all, 'arena-norte')),
        isFalse,
      );
      expect(professorShowsPendingFilter(const []), isFalse);
    });

    test('conta atrasado e vence hoje', () {
      expect(professorPendingCount(all), 1);
      expect(
        professorPendingCount([
          student({
            'billing': {'standing': 'due_today'}
          }),
          student({
            'billing': {'standing': 'overdue'}
          }),
          student({
            'billing': {'standing': 'paused'}
          }),
          student({'billing': null}),
        ]),
        2,
      );
    });
  });

  group('professorStudentsHeaderSubtitle', () {
    final snap = professorStudentsSnapshot();

    test('todas as arenas, com pendentes', () {
      expect(
        professorStudentsHeaderSubtitle(snapshot: snap, arenaId: null),
        'TODAS AS ARENAS · 3 ALUNOS · 1 PENDENTE',
      );
    });

    test('uma arena', () {
      expect(
        professorStudentsHeaderSubtitle(snapshot: snap, arenaId: 'arena-cfc'),
        'ARENA CFC · 2 ALUNOS · 1 PENDENTE',
      );
      expect(
        professorStudentsHeaderSubtitle(snapshot: snap, arenaId: 'arena-norte'),
        'ARENA NORTE · 1 ALUNO',
      );
    });

    test('plural de pendentes e arena desconhecida', () {
      final two = professorStudentsSnapshot(students: [
        studentMap({
          'billing': {'standing': 'overdue'}
        }),
        studentMap({
          'studentId': 's2',
          'billing': {'standing': 'due_today'},
        }),
      ]);
      expect(
        professorStudentsHeaderSubtitle(snapshot: two, arenaId: null),
        'TODAS AS ARENAS · 2 ALUNOS · 2 PENDENTES',
      );
      expect(
        professorStudentsHeaderSubtitle(snapshot: two, arenaId: 'sumiu'),
        'ARENA · 0 ALUNOS',
      );
    });
  });

  group('professorStudentSubtitle', () {
    test('turma e presença', () {
      expect(
          professorStudentSubtitle(student({})), 'Iniciante A · 95% presença');
    });

    test('withArena põe a arena antes', () {
      expect(professorStudentSubtitle(student({}), withArena: true),
          'Arena CFC · Iniciante A · 95% presença');
    });

    test('pausado não repete "Pausado" (a pílula da linha já diz)', () {
      expect(professorStudentSubtitle(student({'status': 'paused'})),
          'Iniciante A · 95% presença');
      expect(
        professorStudentSubtitle(student({'status': 'paused'}),
            withArena: true),
        'Arena CFC · Iniciante A · 95% presença',
      );
    });

    test('mais de uma turma: "+N"', () {
      final s = student({
        'classes': [
          studentClassMap(),
          studentClassMap(classId: 'c2', name: 'Avançado'),
        ],
      });
      expect(professorStudentSubtitle(s), 'Iniciante A +1 · 95% presença');
      final three = student({
        'classes': [
          studentClassMap(),
          studentClassMap(classId: 'c2'),
          studentClassMap(classId: 'c3'),
        ],
      });
      expect(professorStudentSubtitle(three), 'Iniciante A +2 · 95% presença');
    });

    test('sem chamada ainda e sem turma', () {
      expect(professorStudentSubtitle(student({'presenceRate': null})),
          'Iniciante A · sem chamada ainda');
      expect(
        professorStudentSubtitle(
            student({'classes': <Object?>[], 'presenceRate': null})),
        'sem chamada ainda',
      );
    });
  });

  group('professorBillingDetail', () {
    String detail(String standing, [String? next]) => professorBillingDetail(
          ProfessorStudentBilling.fromMap(
              {'standing': standing, 'nextDueDate': next}),
          professorStudentsTodayKey,
        );

    test('cada situação', () {
      expect(
          detail('overdue', '2026-10-05'), 'Venceu 05 out · cobrança da arena');
      expect(detail('overdue'), 'Venceu · cobrança da arena');
      expect(
          detail('due_today', '2026-10-20'), 'Vence hoje · cobrança da arena');
      expect(detail('up_to_date', '2026-11-05'),
          'Cobrado pela arena · próximo 05 nov');
      expect(detail('up_to_date'), 'Cobrado pela arena');
      expect(detail('paused'), 'Plano pausado na arena');
      expect(detail('no_plan'), 'Sem matrícula ativa na arena');
    });

    test('rótulos da situação', () {
      expect(ProfessorBillingStanding.upToDate.label, 'Em dia');
      expect(ProfessorBillingStanding.dueToday.label, 'Vence hoje');
      expect(ProfessorBillingStanding.overdue.label, 'Atrasado');
      expect(ProfessorBillingStanding.paused.label, 'Pausado');
      expect(ProfessorBillingStanding.noPlan.label, 'Sem plano');
    });
  });

  group('professorPlanRow', () {
    test('mensal', () {
      final row = professorPlanRow(
        plan({'name': '2x por semana', 'kind': 'monthly', 'priceReais': 280}),
        'Arena CFC',
      );
      expect(row.label, 'Plano da arena');
      expect(row.value, '2x por semana');
      expect(row.sub, '${formatBRL(280)}/mês · tabela Arena CFC');
    });

    test('mensal pausado ganha o sufixo', () {
      final row = professorPlanRow(
        plan({
          'name': '2x por semana',
          'kind': 'monthly',
          'priceReais': 280,
          'status': 'paused',
        }),
        'Arena CFC',
      );
      expect(row.sub, '${formatBRL(280)}/mês · tabela Arena CFC · pausado');
    });

    test('pacote com créditos e validade', () {
      final row = professorPlanRow(
        plan({
          'name': 'Pacote 10 aulas',
          'kind': 'package',
          'priceReais': 500,
          'credits': 10,
          'creditsLeft': 4,
          'expiresOn': '2026-12-31',
        }),
        'Arena CFC',
      );
      expect(row.label, 'Pacote 10 aulas');
      expect(row.value, '4 de 10');
      expect(row.sub, 'restantes · validade 31 dez · ${formatBRL(500)}');
    });

    test('pacote sem contagem mostra o preço; pausado ganha o sufixo', () {
      final row = professorPlanRow(
        plan({
          'name': 'Pacote',
          'kind': 'package',
          'priceReais': 500,
          'status': 'paused',
        }),
        'Arena CFC',
      );
      expect(row.value, formatBRL(500));
      expect(row.sub, '${formatBRL(500)} · pausado');
    });

    test('avulsa', () {
      final row = professorPlanRow(
        plan({'name': 'Aula avulsa', 'kind': 'single', 'priceReais': 60}),
        'Arena CFC',
      );
      expect(row.label, 'Aula avulsa');
      expect(row.value, formatBRL(60));
      expect(row.sub, 'avulsa · tabela Arena CFC');
    });

    test('avulsa pausada', () {
      final row = professorPlanRow(
        plan({
          'name': 'Aula avulsa',
          'kind': 'single',
          'priceReais': 60,
          'status': 'paused',
        }),
        'Arena CFC',
      );
      expect(row.sub, 'avulsa · tabela Arena CFC · pausado');
    });
  });

  group('datas e rótulos', () {
    test('professorShortDate', () {
      expect(professorShortDate('2026-11-05'), '05 nov');
      expect(professorShortDate('2026-01-31'), '31 jan');
      expect(professorShortDate('não é data'), 'não é data');
    });

    test('professorSinceLabel', () {
      expect(professorSinceLabel('2025-03-10'), 'DESDE MAR 2025');
      expect(professorSinceLabel(null), isNull);
      expect(professorSinceLabel('xx'), isNull);
    });

    test('professorScheduleLabel: 0, 1, 2 e 3 dias', () {
      expect(professorScheduleLabel(const [], '07:00'), 'Aula avulsa · 07:00');
      expect(professorScheduleLabel(const [1], '07:00'), 'Seg · 07:00');
      expect(
          professorScheduleLabel(const [1, 3], '07:00'), 'Seg e Qua · 07:00');
      expect(professorScheduleLabel(const [1, 3, 5], '07:00'),
          'Seg, Qua e Sex · 07:00');
      expect(professorScheduleLabel(const [2, 4], ''), 'Ter e Qui');
    });

    test('professorMarkLetter: P, F, J e R (reposição presente)', () {
      ProfessorStudentMark m(ProfessorMark mark, {bool makeup = false}) =>
          ProfessorStudentMark(date: '2026-10-20', mark: mark, makeup: makeup);

      expect(professorMarkLetter(m(ProfessorMark.present)), 'P');
      expect(professorMarkLetter(m(ProfessorMark.present, makeup: true)), 'R');
      expect(professorMarkLetter(m(ProfessorMark.absent)), 'F');
      // Falta em reposição continua falta.
      expect(professorMarkLetter(m(ProfessorMark.absent, makeup: true)), 'F');
      expect(professorMarkLetter(m(ProfessorMark.excused)), 'J');
    });

    test('professorNextClassLabel', () {
      const today = professorStudentsTodayKey;
      expect(professorNextClassLabel(today, '19:00', today), 'Hoje · 19:00');
      expect(professorNextClassLabel(today, '', today), 'Hoje');
      expect(professorNextClassLabel('2026-10-21', '07:00', today),
          'Qua 21 · 07:00');
      expect(professorNextClassLabel('2026-11-01', '07:00', today),
          'Dom 1 · 07:00');
      expect(professorNextClassLabel(null, '07:00', today), isNull);
      expect(professorNextClassLabel('quebrada', '07:00', today), 'quebrada');
    });

    test('professorClassesSubtitle', () {
      expect(
        professorClassesSubtitle(professorStudentsSnapshot().classes),
        '2 TURMAS · 8 ALUNOS',
      );
      expect(
        professorClassesSubtitle([
          cls({'activeCount': 1})
        ]),
        '1 TURMA · 1 ALUNO',
      );
      expect(professorClassesSubtitle(const []), '0 TURMAS · 0 ALUNOS');
    });

    test('professorOccupancy', () {
      expect(professorOccupancy(cls({'capacity': 6, 'activeCount': 4})), 67);
      expect(professorOccupancy(cls({'capacity': 6, 'activeCount': 6})), 100);
      expect(professorOccupancy(cls({'capacity': 0, 'activeCount': 3})), 0);
      // Acima da capacidade (encaixe) não passa de 100.
      expect(professorOccupancy(cls({'capacity': 6, 'activeCount': 8})), 100);
      expect(professorOccupancy(cls({'capacity': 6, 'activeCount': 0})), 0);
    });

    test('rótulos dos chips', () {
      expect(
        [for (final f in ProfessorStudentFilter.values) f.label],
        ['Todos', 'Turma', 'Particular', 'Pendentes'],
      );
    });
  });

  group('shouldHideProfessorTabBar', () {
    test('esconde nas telas empilhadas, mostra nas abas', () {
      expect(shouldHideProfessorTabBar('/professor/alunos'), isFalse);
      expect(shouldHideProfessorTabBar('/professor/mais'), isFalse);
      expect(shouldHideProfessorTabBar('/professor'), isFalse);
      expect(
          shouldHideProfessorTabBar('/professor/alunos/arena-cfc/s1'), isTrue);
      expect(shouldHideProfessorTabBar('/professor/mais/turmas'), isTrue);
      // Prefixo parecido não conta.
      expect(shouldHideProfessorTabBar('/professor/alunosx'), isFalse);
      expect(shouldHideProfessorTabBar('/athlete/professor/arenas'), isFalse);
    });
  });
}
