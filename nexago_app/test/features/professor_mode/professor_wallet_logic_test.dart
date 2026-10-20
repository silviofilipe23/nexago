import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students_logic.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet_logic.dart';

import 'professor_wallet_test_support.dart';

ProfessorAccountForm form({
  String name = 'Carlos da Silva',
  String cpf = '529.982.247-25',
  String email = 'Carlos@Exemplo.com ',
  String phone = '+55 (62) 99812-4471',
  String birth = '10/05/1990',
  String income = '4.000',
  String cep = '74000-000',
  String address = 'Rua 10',
  String number = '120',
  String complement = '',
  String province = 'Setor Bueno',
}) =>
    ProfessorAccountForm(
      name: name,
      cpf: cpf,
      email: email,
      mobilePhone: phone,
      birthDate: birth,
      incomeValue: income,
      postalCode: cep,
      address: address,
      addressNumber: number,
      complement: complement,
      province: province,
    );

void main() {
  group('modelos (Firestore)', () {
    test('conta, plano, aluno e cobrança leem os campos do backend', () {
      final account = ProfessorPayoutAccount.fromMap({
        'status': 'approved',
        'walletId': 'w1',
        'name': 'Carlos',
        'email': 'c@x.com',
        'cpfMasked': '***.982.247-**',
      });
      expect(account.isApproved, isTrue);
      expect(
          ProfessorAccountStatus.parse('???'), ProfessorAccountStatus.pending);

      final plan = ProfessorWalletPlan.fromMap('p1', {
        'name': 'Pacote 4',
        'kind': 'package',
        'priceReais': 500,
        'classes': 4,
        'validityDays': 45,
        'active': false,
      });
      expect(plan.kind, ProfessorPlanKind.package);
      expect(plan.active, isFalse);

      final invited = ProfessorWalletStudent.fromMap('a1', {
        'status': 'invited',
        'name': 'Rafa',
        'professorName': 'Carlos',
      });
      expect(invited.athleteId, 'a1');
      expect(invited.invited, isTrue);
      expect(invited.active, isFalse);
      expect(invited.inWallet, isTrue);
      final archived = ProfessorWalletStudent.fromMap('a2', {
        'status': 'archived',
        'recurring': {'amountReais': 880, 'dueDay': 10},
      });
      expect(archived.inWallet, isFalse);
      expect(archived.recurring!.dueDay, 10);

      final charge = ProfessorCharge.fromMap('c1', {
        'athleteId': 'a1',
        'studentName': 'Rafa',
        'description': 'Aula',
        'amountReais': 140,
        'dueDate': '2026-10-25',
        'status': 'paid',
        'netReais': 131.5,
        'paidAt': Timestamp.fromDate(DateTime.utc(2026, 10, 18, 15)),
      });
      expect(charge.status, ProfessorChargeStatus.paid);
      expect(charge.paidAt, isNotNull);
    });

    test('estados novos do backend: recusado, trava e falha', () {
      final declined =
          ProfessorWalletStudent.fromMap('a', {'status': 'declined'});
      expect(declined.status, ProfessorWalletStudentStatus.declined);
      expect(declined.inWallet, isFalse);
      // Desconhecido nunca libera cobrança.
      final weird = ProfessorWalletStudent.fromMap('b', {'status': '???'});
      expect(weird.active, isFalse);
      expect(weird.inWallet, isFalse);

      final creating = ProfessorPayoutAccount.fromMap({'status': 'creating'});
      expect(creating.status, ProfessorAccountStatus.creating);
      expect(creating.exists, isFalse);
      expect(
          ProfessorPayoutAccount.fromMap({'status': 'failed'}).exists, isFalse);
      expect(walletAccount().exists, isTrue);

      final failed = ProfessorCharge.fromMap('c', {'status': 'failed'});
      expect(failed.status, ProfessorChargeStatus.failed);
      expect(professorChargeStanding(failed, walletTodayKey),
          ProfessorChargeStanding.failed);
      expect(professorChargeCancelable(failed), isTrue);
      expect(
        professorWalletSummary([failed], todayKey: walletTodayKey).toReceive,
        0,
      );
    });

    test('payload da cobrança: plano OU valor, sem os dois', () {
      expect(
        const ProfessorChargeInput(
          athleteId: 'a1',
          planId: 'p1',
          amountReais: 99,
          description: ' ',
          dueDate: '2026-10-23',
        ).toPayload(),
        {
          'athleteId': 'a1',
          'planId': 'p1',
          'dueDate': '2026-10-23',
          'repeatMonthly': false,
        },
      );
      expect(
        const ProfessorChargeInput(
          athleteId: 'a1',
          amountReais: 150,
          description: 'Particular',
          dueDate: '2026-10-23',
          repeatMonthly: true,
        ).toPayload(),
        {
          'athleteId': 'a1',
          'amountReais': 150.0,
          'description': 'Particular',
          'dueDate': '2026-10-23',
          'repeatMonthly': true,
        },
      );
    });

    test('payload do plano: aulas fora da avulsa, validade só no pacote', () {
      final single = const ProfessorPlanInput(
        name: 'Avulsa',
        kind: ProfessorPlanKind.single,
        priceReais: 140,
        classes: 3,
      ).toPayload();
      expect(single.containsKey('classes'), isFalse);
      expect(single.containsKey('planId'), isFalse);
      final monthly = ProfessorPlanInput.of(
        walletPlan(id: 'p2', kind: ProfessorPlanKind.monthly, classes: 8),
        active: false,
      ).toPayload();
      expect(monthly['planId'], 'p2');
      expect(monthly['classes'], 8);
      expect(monthly.containsKey('validityDays'), isFalse);
      expect(monthly['active'], isFalse);
    });
  });

  group('formulário da conta (mesmas regras do servidor)', () {
    test('formulário válido: sem erros e payload normalizado', () {
      final f = form();
      expect(
          validateProfessorAccountForm(f, todayKey: walletTodayKey), isEmpty);
      expect(professorAccountPayload(f), {
        'name': 'Carlos da Silva',
        'email': 'carlos@exemplo.com',
        'cpfCnpj': '52998224725',
        'mobilePhone': '62998124471',
        'birthDate': '1990-05-10',
        'incomeValue': 4000.0,
        'postalCode': '74000000',
        'address': 'Rua 10',
        'addressNumber': '120',
        'complement': null,
        'province': 'Setor Bueno',
      });
    });

    test('cada campo inválido tem a mensagem do servidor', () {
      final errors = validateProfessorAccountForm(
        form(
          name: 'Carlos',
          cpf: '111.111.111-11',
          email: 'carlos@',
          phone: '62 3333-4444',
          birth: '31/02/1990',
          income: '0',
          cep: '7400',
          address: ' ',
          number: '',
          province: '',
        ),
        todayKey: walletTodayKey,
      );
      expect(errors, {
        ProfessorAccountField.name: 'Informe o nome completo.',
        ProfessorAccountField.cpf: 'CPF inválido.',
        ProfessorAccountField.email: 'E-mail inválido.',
        ProfessorAccountField.mobilePhone:
            'Celular inválido (DDD + 9 dígitos).',
        ProfessorAccountField.birthDate: 'Data de nascimento inválida.',
        ProfessorAccountField.incomeValue: 'Informe a renda mensal.',
        ProfessorAccountField.postalCode: 'CEP inválido.',
        ProfessorAccountField.address: 'Informe o endereço.',
        ProfessorAccountField.addressNumber: 'Informe o número.',
        ProfessorAccountField.province: 'Informe o bairro.',
      });
    });

    test('menor de 18 anos é recusado', () {
      final errors = validateProfessorAccountForm(
        form(birth: '21/10/2008'),
        todayKey: walletTodayKey,
      );
      expect(errors[ProfessorAccountField.birthDate],
          'A conta de recebimento é só para maiores de 18 anos.');
      expect(
        validateProfessorAccountForm(form(birth: '20/10/2008'),
            todayKey: walletTodayKey),
        isEmpty,
      );
    });

    test('CPF: dígitos verificadores', () {
      expect(professorCpfValid('529.982.247-25'), isTrue);
      expect(professorCpfValid('529.982.247-24'), isFalse);
      expect(professorCpfValid('123'), isFalse);
    });

    test('dinheiro digitado', () {
      expect(professorParseMoney('120'), 120);
      expect(professorParseMoney('120,50'), 120.5);
      expect(professorParseMoney('R\$ 1.200,50'), 1200.5);
      expect(professorParseMoney('1.200'), 1200);
      expect(professorParseMoney('12.5'), 12.5);
      expect(professorParseMoney('abc'), isNull);
      expect(professorParseMoney(''), isNull);
    });
  });

  group('planos', () {
    test('rótulos e subtítulos', () {
      expect(professorPlanKindLabel(ProfessorPlanKind.single), 'Aula avulsa');
      expect(professorPlanKindLabel(ProfessorPlanKind.package), 'Pacote');
      expect(professorPlanKindLabel(ProfessorPlanKind.monthly), 'Mensal');
      expect(
        professorPlanSubtitle(walletPlan(
            kind: ProfessorPlanKind.package, classes: 4, validityDays: 45)),
        'Pacote · 4 aulas · validade 45 dias',
      );
      expect(
        professorPlanSubtitle(
            walletPlan(kind: ProfessorPlanKind.monthly, classes: 8)),
        'Mensal · 8 aulas por mês',
      );
    });

    test('validação do editor', () {
      String? v({
        String name = 'Plano',
        ProfessorPlanKind kind = ProfessorPlanKind.single,
        double? price = 100,
        int? classes,
        int? validity,
      }) =>
          validateProfessorPlan(
            name: name,
            kind: kind,
            priceReais: price,
            classes: classes,
            validityDays: validity,
          );
      expect(v(), isNull);
      expect(v(name: ''), 'Dê um nome ao plano (até 60 caracteres).');
      expect(v(price: 0.5), 'Preço deve ficar entre R\$ 1 e R\$ 10.000.');
      expect(v(price: 10001), 'Preço deve ficar entre R\$ 1 e R\$ 10.000.');
      expect(v(kind: ProfessorPlanKind.monthly),
          'Informe quantas aulas (1 a 60).');
      expect(
        v(kind: ProfessorPlanKind.package, classes: 4, validity: 3),
        'Validade do pacote entre 7 e 365 dias.',
      );
      expect(
          v(kind: ProfessorPlanKind.package, classes: 4, validity: 45), isNull);
    });

    test('ativos primeiro, depois por preço; contagem de alunos', () {
      final sorted = professorSortedPlans([
        walletPlan(id: 'a', price: 900),
        walletPlan(id: 'b', price: 100, active: false),
        walletPlan(id: 'c', price: 200),
      ]);
      expect(sorted.map((p) => p.id), ['c', 'a', 'b']);
      final plan = walletPlan(id: 'p-mensal');
      expect(
        professorPlanStudentCount(plan, [
          walletStudent(),
          walletStudent(
              athleteId: 'x', status: ProfessorWalletStudentStatus.invited),
          walletStudent(
              athleteId: 'y', status: ProfessorWalletStudentStatus.archived),
        ]),
        2,
      );
    });
  });

  group('cobranças', () {
    test('atrasado é derivado: aberta com vencimento antes de hoje', () {
      final overdue = walletCharge(dueDate: '2026-10-15');
      expect(professorChargeStanding(overdue, walletTodayKey),
          ProfessorChargeStanding.overdue);
      expect(professorChargeSubtitle(overdue, walletTodayKey), 'Venceu 15 out');
      final today = walletCharge(dueDate: walletTodayKey);
      expect(professorChargeStanding(today, walletTodayKey),
          ProfessorChargeStanding.open);
      expect(professorChargeSubtitle(today, walletTodayKey), 'Vence hoje');
      final paidLate = walletCharge(
          dueDate: '2026-10-01', status: ProfessorChargeStatus.paid);
      expect(professorChargeStanding(paidLate, walletTodayKey),
          ProfessorChargeStanding.paid);
    });

    test('cancelável: aberta ou presa gerando', () {
      expect(professorChargeCancelable(walletCharge()), isTrue);
      expect(
        professorChargeCancelable(
            walletCharge(status: ProfessorChargeStatus.creating)),
        isTrue,
      );
      expect(
        professorChargeCancelable(
            walletCharge(status: ProfessorChargeStatus.paid)),
        isFalse,
      );
    });

    test('resumo do mês: líquido pelo mês do pagamento, a receber, atrasados',
        () {
      final s = professorWalletSummary([
        // Paga em outubro com líquido do webhook.
        walletCharge(
          id: 'a',
          amount: 880,
          status: ProfessorChargeStatus.paid,
          netReais: 830,
          paidAt: DateTime.utc(2026, 10, 10, 15),
        ),
        // Paga em outubro sem líquido: 95%.
        walletCharge(
          id: 'b',
          amount: 100,
          status: ProfessorChargeStatus.paid,
          paidAt: DateTime.utc(2026, 10, 2, 15),
        ),
        // Paga em setembro: fora do mês.
        walletCharge(
          id: 'c',
          amount: 500,
          status: ProfessorChargeStatus.paid,
          netReais: 470,
          paidAt: DateTime.utc(2026, 9, 28, 15),
        ),
        walletCharge(id: 'd', amount: 140, dueDate: '2026-10-15'),
        walletCharge(id: 'e', amount: 880, dueDate: '2026-11-10'),
        walletCharge(
            id: 'f', amount: 300, status: ProfessorChargeStatus.canceled),
      ], todayKey: walletTodayKey);
      expect(s.monthKey, '2026-10');
      expect(s.receivedNet, 925);
      expect(s.receivedCount, 2);
      expect(s.toReceive, 1020);
      expect(s.open.map((c) => c.id), ['d', 'e']);
      expect(s.overdue.map((c) => c.id), ['d']);
    });

    test('por aluno, mais recentes primeiro; situação do aluno', () {
      final charges = [
        walletCharge(
            id: '1', dueDate: '2026-09-10', status: ProfessorChargeStatus.paid),
        walletCharge(id: '2', dueDate: '2026-11-10'),
        walletCharge(id: '3', athleteId: 'outro', dueDate: '2026-10-01'),
      ];
      expect(professorStudentCharges(charges, 'ath-paulo').map((c) => c.id),
          ['2', '1']);
      expect(
        professorWalletStudentStanding(charges, 'ath-paulo', walletTodayKey),
        ProfessorChargeStanding.open,
      );
      expect(
        professorWalletStudentStanding(charges, 'outro', walletTodayKey),
        ProfessorChargeStanding.overdue,
      );
      expect(
          professorWalletStudentStanding(charges, 'x', walletTodayKey), isNull);
    });

    test('lembrete leva o link da fatura', () {
      final msg = professorChargeReminderMessage(
        walletCharge(dueDate: '2026-10-15', amount: 140),
        walletTodayKey,
      );
      expect(msg, startsWith('Oi, Paulo!'));
      expect(msg, contains('venceu em 15 out'));
      expect(msg, contains('https://asaas.test/i/ch-1'));
      expect(msg, contains('R\$'));
    });

    test('parte do professor, recorrência e datas', () {
      expect(professorShareOf(880), 836);
      expect(professorCanRepeatMonthly(null), isTrue);
      expect(professorCanRepeatMonthly(walletPlan()), isFalse);
      expect(
        professorCanRepeatMonthly(
            walletPlan(kind: ProfessorPlanKind.monthly, classes: 8)),
        isTrue,
      );
      expect(professorAddDays('2026-10-30', 3), '2026-11-02');
      expect(professorMonthName('2026-10'), 'outubro');
      expect(
        professorRecurringLabel(const ProfessorWalletRecurring(
          amountReais: 880,
          description: 'Mensal',
          dueDay: 10,
        )),
        startsWith('Todo mês · dia 10 · R\$'),
      );
    });
  });

  group('aba Alunos', () {
    test('carteira em "todas" e no escopo próprio; filtros', () {
      final students = [
        walletStudent(),
        walletStudent(athleteId: 'lv', name: 'Lívia Couto'),
      ];
      final charges = [
        walletCharge(athleteId: 'lv', dueDate: '2026-10-15'),
      ];
      List<String> ids({
        String? scope,
        ProfessorStudentFilter filter = ProfessorStudentFilter.all,
        String query = '',
      }) =>
          professorVisibleWalletStudents(
            students,
            scope: scope,
            filter: filter,
            query: query,
            charges: charges,
            todayKey: walletTodayKey,
          ).map((s) => s.athleteId).toList();
      expect(ids(), ['ath-paulo', 'lv']);
      expect(ids(scope: kProfessorWalletScope), ['ath-paulo', 'lv']);
      expect(ids(scope: 'arena-cfc'), isEmpty);
      expect(ids(filter: ProfessorStudentFilter.pending), ['lv']);
      expect(ids(filter: ProfessorStudentFilter.turma), isEmpty);
      expect(ids(query: 'livia'), ['lv']);
    });
  });
}
