import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';

import 'class_agreements_test_support.dart';

ClassSignupPlan _plan(String id) => buildSignupOptions().plan(id)!;

const _mon18 = ClassSlotChoice(classId: 'c1', weekday: 1);
const _tue19 = ClassSlotChoice(classId: 'c2', weekday: 2);
const _thu19 = ClassSlotChoice(classId: 'c2', weekday: 4);

void main() {
  group('requiredSlotCount / slotsComplete / toggleSlot', () {
    test('mensal 2x exige exatamente 2 horários', () {
      final plan = _plan('mensal-2x');
      expect(requiredSlotCount(plan), 2);
      expect(slotsComplete(const [], plan), isFalse);
      expect(slotsComplete(const [_mon18], plan), isFalse);
      expect(slotsComplete(const [_mon18, _tue19], plan), isTrue);
    });

    test('mensal 2x não deixa passar de 2: o 3º devolve a mesma lista', () {
      final plan = _plan('mensal-2x');
      var picked = toggleSlot(const [], _mon18, plan);
      picked = toggleSlot(picked, _tue19, plan);
      expect(picked, [_mon18, _tue19]);

      final third = toggleSlot(picked, _thu19, plan);
      expect(identical(third, picked), isTrue,
          reason: 'a tela usa identical() para avisar que está cheio');
      expect(third, hasLength(2));
    });

    test('tocar de novo desmarca e libera a vaga para outro horário', () {
      final plan = _plan('mensal-2x');
      final picked = toggleSlot(const [_mon18, _tue19], _mon18, plan);
      expect(picked, [_tue19]);
      expect(toggleSlot(picked, _thu19, plan), [_tue19, _thu19]);
    });

    test('mensal sem classesPerWeek vale 1 aula por semana', () {
      final plan = ClassSignupPlan.fromMap(const {
        'planId': 'p',
        'name': 'Mensal',
        'kind': 'monthly',
      });
      expect(requiredSlotCount(plan), 1);
      expect(toggleSlot(const [_mon18], _tue19, plan), [_mon18]);
      expect(slotsComplete(const [_mon18], plan), isTrue);
    });

    test('pacote aceita de 1 a 7 horários', () {
      final plan = _plan('pacote-10');
      expect(requiredSlotCount(plan), isNull);
      expect(slotsComplete(const [], plan), isFalse);
      expect(slotsComplete(const [_mon18], plan), isTrue);

      var picked = <ClassSlotChoice>[];
      for (var d = 1; d <= 7; d++) {
        picked = toggleSlot(
            picked, ClassSlotChoice(classId: 'c$d', weekday: d), plan);
      }
      expect(picked, hasLength(7));
      expect(slotsComplete(picked, plan), isTrue);

      final eighth = toggleSlot(
          picked, const ClassSlotChoice(classId: 'c8', weekday: 1), plan);
      expect(identical(eighth, picked), isTrue);
      expect(eighth, hasLength(7));
    });

    test('ClassSlotChoice: igualdade por turma + dia e chave estável', () {
      expect(const ClassSlotChoice(classId: 'c1', weekday: 1), _mon18);
      expect(const ClassSlotChoice(classId: 'c1', weekday: 2), isNot(_mon18));
      expect(_mon18.key, 'c1:1');
      expect(_mon18.toMap(), {'classId': 'c1', 'weekday': 1});
    });
  });

  group('professores do plano', () {
    test('teachersForPlan segue a ordem da arena e só os do plano', () {
      final o = buildSignupOptions();
      expect(teachersForPlan(o, _plan('mensal-2x')).map((t) => t.teacherId),
          ['t1', 't2']);
      expect(teachersForPlan(o, _plan('pacote-10')).map((t) => t.teacherId),
          ['t1']);
    });

    test('skipTeacherStep: pula com 1 professor, mostra com 2', () {
      final o = buildSignupOptions();
      expect(skipTeacherStep(o, _plan('pacote-10')), isTrue);
      expect(skipTeacherStep(o, _plan('mensal-2x')), isFalse);
    });

    test('skipTeacherStep: professor do plano que não está na lista conta 0',
        () {
      final o = buildSignupOptions(plans: [
        {
          'planId': 'x',
          'name': 'X',
          'kind': 'monthly',
          'teacherIds': ['fantasma'],
        },
      ]);
      expect(teachersForPlan(o, o.plan('x')!), isEmpty);
      expect(skipTeacherStep(o, o.plan('x')!), isTrue);
    });
  });

  group('slotOptions', () {
    test('um professor: só as turmas dele, por dia e hora', () {
      final o = buildSignupOptions();
      final slots = slotOptions(o, _plan('mensal-2x'), teacherId: 't1');
      expect(slots.map((s) => s.choice.key), ['c1:1', 'c2:2', 'c1:3', 'c2:4']);
      expect(slots.every((s) => s.teacherName == 'Ana Lima'), isTrue);
    });

    test('"sem preferência" lista os horários de todos os professores do plano',
        () {
      final o = buildSignupOptions();
      final slots = slotOptions(o, _plan('mensal-2x'));
      expect(slots.map((s) => s.choice.key),
          ['c3:1', 'c1:1', 'c2:2', 'c1:3', 'c4:3', 'c2:4', 'c3:5']);
      expect(
        slots.map((s) => s.teacherName).toSet(),
        {'Ana Lima', 'Bruno Costa'},
      );
    });

    test('"sem preferência" não traz turma de professor fora do plano', () {
      final o = buildSignupOptions();
      final slots = slotOptions(o, _plan('pacote-10'));
      expect(slots.map((s) => s.klass.teacherId).toSet(), {'t1'});
    });

    test('turma lotada não é selecionável e mostra "lotada"', () {
      final o = buildSignupOptions();
      final full = slotOptions(o, _plan('mensal-2x'), teacherId: 't1')
          .firstWhere((s) => s.choice.key == 'c1:3');
      expect(full.full, isTrue);
      expect(full.selectable, isFalse);
      expect(vacanciesLabel(full), 'lotada');
    });

    test('turma em que já está matriculado não é selecionável, mesmo com vaga',
        () {
      final o = buildSignupOptions();
      final mine = slotOptions(o, _plan('mensal-2x'), teacherId: 't2')
          .firstWhere((s) => s.choice.key == 'c4:3');
      expect(mine.vacancies, 2);
      expect(mine.full, isFalse);
      expect(mine.selectable, isFalse);
      expect(vacanciesLabel(mine), 'você já está nesta turma');
    });

    test('vacanciesLabel: singular, plural; matriculado vence lotada', () {
      final o = buildSignupOptions();
      final t1 = slotOptions(o, _plan('mensal-2x'), teacherId: 't1');
      expect(vacanciesLabel(t1.firstWhere((s) => s.choice.key == 'c2:2')),
          '1 vaga');
      expect(vacanciesLabel(t1.firstWhere((s) => s.choice.key == 'c1:1')),
          '3 vagas');

      final both = buildSignupOptions(classes: [
        {
          'classId': 'cx',
          'teacherId': 't1',
          'startTime': '10:00',
          'enrolled': true,
          'days': [
            {'weekday': 2, 'vacancies': 0},
          ],
        },
      ]);
      final o2 = slotOptions(both, both.plan('mensal-2x')!).single;
      expect(vacanciesLabel(o2), 'você já está nesta turma');
    });

    test('professor sem cadastro na lista vira "Professor"', () {
      final o = buildSignupOptions(plans: [
        {
          'planId': 'p',
          'name': 'P',
          'kind': 'package',
          'teacherIds': ['t9'],
        },
      ], classes: [
        {
          'classId': 'c9',
          'teacherId': 't9',
          'startTime': '08:00',
          'days': [
            {'weekday': 6, 'vacancies': 1},
          ],
        },
      ]);
      expect(slotOptions(o, o.plan('p')!).single.teacherName, 'Professor');
    });
  });

  group('textos do plano', () {
    test('planRuleLine: mensal e pacote', () {
      expect(planRuleLine(_plan('mensal-2x')), '2 aulas por semana');
      expect(planRuleLine(_plan('pacote-10')), 'Pacote de 10 aulas · 60 dias');
      final one = ClassSignupPlan.fromMap(const {
        'planId': 'p',
        'kind': 'monthly',
        'classesPerWeek': 1,
      });
      expect(planRuleLine(one), '1 aula por semana');
      final emptyPkg = ClassSignupPlan.fromMap(const {'kind': 'package'});
      expect(planRuleLine(emptyPkg), 'Pacote de 0 aulas · 0 dias');
    });

    test('slotsTitle / planPriceSuffix', () {
      expect(slotsTitle(_plan('mensal-2x')), 'Escolha 2 aulas por semana');
      expect(slotsTitle(_plan('pacote-10')), 'Escolha seus horários');
      expect(planPriceSuffix(_plan('mensal-2x')), 'por mês');
      expect(planPriceSuffix(_plan('pacote-10')), 'à vista');
    });

    test('weekdayShort: 1..7 e fora da faixa', () {
      expect(weekdayShort(1), 'SEG');
      expect(weekdayShort(7), 'DOM');
      expect(weekdayShort(0), '?');
      expect(weekdayShort(8), '?');
    });
  });

  group('fromMap tolerante', () {
    test('ClassSignupOptions vazio não quebra e tem padrões', () {
      final o = ClassSignupOptions.fromMap(const {});
      expect(o.arenaId, '');
      expect(o.arenaName, 'Arena');
      expect(o.dueDay, 5);
      expect(o.hasCpf, isTrue);
      expect(o.onlineBilling, isFalse);
      expect(o.plans, isEmpty);
      expect(o.teachers, isEmpty);
      expect(o.classes, isEmpty);
      expect(o.plan('x'), isNull);
      expect(o.teacher(null), isNull);
      expect(o.classById('x'), isNull);
    });

    test('tipos errados viram vazio/zero; dias fora de 1..7 caem', () {
      final o = ClassSignupOptions.fromMap({
        'arena': 'não é mapa',
        'plans': [
          {
            'planId': 42,
            'name': null,
            'priceReais': '100',
            'teacherIds': ['t1', 3, '', '  '],
          },
        ],
        'teachers': [
          {'teacherId': 't1', 'name': '   '},
        ],
        'classes': [
          {
            'classId': 'c1',
            'capacity': 'seis',
            'days': [
              {'weekday': 0, 'vacancies': 1},
              {'weekday': 8, 'vacancies': 1},
              {'weekday': 3},
              'lixo',
            ],
          },
        ],
        'hasCpf': false,
      });
      final p = o.plans.single;
      expect(p.planId, '');
      expect(p.name, '');
      expect(p.priceReais, 0);
      expect(p.teacherIds, ['t1']);
      expect(p.isMonthly, isFalse);
      expect(o.teachers.single.name, 'Professor');
      final c = o.classes.single;
      expect(c.capacity, 0);
      expect(c.days.map((d) => (d.weekday, d.vacancies)), [(3, 0)]);
      expect(o.hasCpf, isFalse);
    });

    test('ClassEnrollmentPreview: sem "agreement" vira texto vazio', () {
      final p = ClassEnrollmentPreview.fromMap(const {'online': true});
      expect(p.title, '');
      expect(p.sha256, '');
      expect(p.essentials, isEmpty);
      expect(p.charges, isEmpty);
      expect(p.online, isTrue);
      expect(p.needsCpf, isFalse);
    });

    test('ClassEnrollmentPreview: lê contrato, cobranças e essenciais', () {
      final p = ClassEnrollmentPreview.fromMap(previewJson(needsCpf: true));
      expect(p.sha256, sha);
      expect(p.templateVersion, 3);
      expect(p.essentials.map((r) => r.label), ['Plano', 'Professor']);
      expect(p.charges.single.amountReais, 330);
      expect(p.charges.single.dueDate, '2026-11-20');
      expect(p.needsCpf, isTrue);
    });

    test('essenciais sem rótulo são descartados', () {
      final a = ClassAgreement.fromMap(const {
        'essentials': [
          {'label': '', 'value': 'x'},
          {'value': 'y'},
          {'label': 'Professor', 'value': 'Ana'},
        ],
      });
      expect(a.essentials, [(label: 'Professor', value: 'Ana')]);
    });

    test('ClassAgreement vazio: aluno, Arena, encerrado, sem evidência', () {
      final a = ClassAgreement.fromMap(const {});
      expect(a.audience, 'student');
      expect(a.arenaName, 'Arena');
      expect(a.status, ClassAgreementStatus.ended);
      expect(a.isCurrent, isFalse);
      expect(a.evidence, isNull);
      expect(a.signedAt, isNull);
      expect(a.planName, isNull);
    });

    test('ClassAgreement: status, datas, evidência e headline', () {
      final s = agreement();
      expect(s.status, ClassAgreementStatus.signed);
      expect(s.isCurrent, isTrue);
      expect(s.isPending, isFalse);
      expect(s.headline, 'Beach Tennis 2x');
      expect(s.signedAt, DateTime.utc(2026, 11, 10, 14, 30));
      expect(s.evidence?.platform, 'ios');
      expect(s.evidence?.readSeconds, 95);

      final p = agreement(audience: 'professor', status: 'pending');
      expect(p.isProfessor, isTrue);
      expect(p.isPending, isTrue);
      expect(p.headline, 'Contrato de professor');

      expect(ClassAgreement.fromMap(const {'status': 'canceled'}).status,
          ClassAgreementStatus.canceled);
      expect(ClassAgreement.fromMap(const {'status': 'pending'}).isCurrent,
          isTrue);

      final noPlan = ClassAgreement.fromMap(const {'title': 'Contrato X'});
      expect(noPlan.headline, 'Contrato X');
    });

    test('ClassEnrollmentResult: data inválida vira null', () {
      final r = ClassEnrollmentResult.fromMap(const {
        'enrollmentId': 'e',
        'agreementId': 'a',
        'signedAt': 'ontem',
      });
      expect(r.signedAt, isNull);
      expect(r.charges, isEmpty);
    });

    test('parseAgreements: lista, vazio e lixo', () {
      expect(
        parseAgreements({
          'agreements': [agreementJson(id: 'a'), agreementJson(id: 'b')],
        }).map((a) => a.agreementId),
        ['a', 'b'],
      );
      expect(parseAgreements(null), isEmpty);
      expect(parseAgreements({'agreements': 'x'}), isEmpty);
    });
  });

  group('groupAgreementsByArena', () {
    test('agrupa por arena na ordem de chegada', () {
      final groups = groupAgreementsByArena([
        agreement(id: 'a1', arenaId: 'sul', arenaName: 'Arena Sul'),
        agreement(id: 'b1', arenaId: 'norte', arenaName: 'Arena Norte'),
        agreement(id: 'a2', arenaId: 'sul', arenaName: 'Arena Sul'),
      ]);
      expect(groups.map((g) => g.arenaId), ['sul', 'norte']);
      expect(groups.map((g) => g.arenaName), ['Arena Sul', 'Arena Norte']);
      expect(groups.first.items.map((a) => a.agreementId), ['a1', 'a2']);
      expect(groups.last.items.map((a) => a.agreementId), ['b1']);
    });

    test('lista vazia não tem grupos', () {
      expect(groupAgreementsByArena(const []), isEmpty);
    });
  });

  group('formatação', () {
    test('brDateKey', () {
      expect(brDateKey('2026-11-20'), '20/11/2026');
      expect(brDateKey(null), '');
      expect(brDateKey('20/11/2026'), '');
      expect(brDateKey('2026-11-20T00:00:00Z'), '');
    });

    test('agreementShortHash', () {
      expect(agreementShortHash(sha), '9f3a…c27e');
      expect(agreementShortHash('abc'), 'abc');
      expect(agreementShortHash(''), '');
    });
  });
}
