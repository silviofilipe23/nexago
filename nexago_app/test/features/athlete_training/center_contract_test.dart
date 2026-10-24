import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/features/athlete_training/domain/center_contract.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';

/// Contrato como `getMyTrainingCenters` manda (`MyCenterContract`).
Map<String, Object?> contractJson({
  String id = 'k1',
  String status = 'viewed',
  String kind = 'enrollment',
  bool optional = false,
  String signerRole = 'student',
  bool requireBeforePayment = true,
  String? endDate = '2027-10-23',
  String? signedAt,
  String body = '# 1. Partes\nCT Areia Alta e Lara Pinheiro.\n\n# 2. Valor\n'
      'Mensalidade de R\$ 320.',
}) =>
    {
      'contractId': id,
      'number': 'CTR-2026-0512',
      'title':
          kind == 'enrollment' ? 'Contrato de matrícula' : 'Termo de imagem',
      'kind': kind,
      'optional': optional,
      'templateVersion': 3,
      'status': status,
      'signerRole': signerRole,
      'signerName':
          signerRole == 'guardian' ? 'Patrícia Moura' : 'Lara Pinheiro',
      'studentName':
          signerRole == 'guardian' ? 'Isabela Moura' : 'Lara Pinheiro',
      'enrollmentId': kind == 'enrollment' ? 'e1' : null,
      'className': kind == 'enrollment' ? 'BT Iniciante A' : '',
      'planName': kind == 'enrollment' ? 'Mensal 2x/semana' : '',
      'priceCents': kind == 'enrollment' ? 32000 : null,
      'startDate': kind == 'enrollment' ? '2026-10-24' : null,
      'endDate': kind == 'enrollment' ? endDate : null,
      'requireBeforePayment': kind == 'enrollment' && requireBeforePayment,
      'sentOn': '2026-10-20',
      'signedAt': signedAt,
      'body': body,
      'sha256': 'abc123',
      'essentials': [
        {'label': 'Valor', 'value': r'R$ 320,00/mês · dia 05'},
        {'label': '', 'value': 'sem rótulo some'},
        {'label': 'Vigência', 'value': '12 meses · sem fidelidade'},
      ],
    };

void main() {
  group('MyCenterContract.fromMap', () {
    test('lê todos os campos do servidor', () {
      final c = MyCenterContract.fromMap(contractJson());
      expect(c.contractId, 'k1');
      expect(c.number, 'CTR-2026-0512');
      expect(c.isEnrollment, isTrue);
      expect(c.isOpen, isTrue);
      expect(c.templateVersion, 3);
      expect(c.enrollmentId, 'e1');
      expect(c.priceCents, 32000);
      expect(c.requireBeforePayment, isTrue);
      expect(c.sha256, 'abc123');
      expect(c.sentOn, '2026-10-20');
      expect(c.signedAt, isNull);
      expect(c.essentials.map((e) => e.label), ['Valor', 'Vigência']);
      expect(c.body, startsWith('# 1. Partes'));
    });

    test('responsável, termo opcional e assinado', () {
      final c = MyCenterContract.fromMap(
        contractJson(
          kind: 'term',
          optional: true,
          signerRole: 'guardian',
          status: 'signed',
          signedAt: '2026-10-24T17:31:00.000Z',
        ),
      );
      expect(c.asGuardian, isTrue);
      expect(c.signerName, 'Patrícia Moura');
      expect(c.optional, isTrue);
      expect(c.enrollmentId, isNull);
      expect(c.endDate, isNull);
      expect(c.isSigned, isTrue);
      expect(c.signedAt, DateTime.utc(2026, 10, 24, 17, 31));
    });

    test('mapa vazio vira padrões seguros', () {
      final c = MyCenterContract.fromMap(const {});
      expect(c.title, 'Contrato');
      expect(c.status, 'sent');
      expect(c.kind, 'term');
      expect(c.signerRole, 'student');
      expect(c.essentials, isEmpty);
    });
  });

  group('centro com contratos e faturas bloqueadas', () {
    final center = TrainingCenterLink.fromMap({
      'centerId': 'ct1',
      'name': 'CT Areia Alta',
      'invoices': [
        {
          'invoiceId': 'i1',
          'reference': 'Matrícula',
          'amountCents': 8000,
          'dueDate': '2026-10-30',
          'status': 'pending',
          'enrollmentId': 'e1',
          'blockedByContract': true,
          'payUrl': null,
        },
        {
          'invoiceId': 'i2',
          'reference': 'Avulsa',
          'amountCents': 5000,
          'dueDate': '2026-10-28',
          'status': 'pending',
        },
      ],
      'contracts': [
        contractJson(),
        contractJson(id: 'k2', kind: 'term', optional: true, status: 'sent'),
        contractJson(
            id: 'k0', status: 'signed', signedAt: '2025-10-20T12:00:00Z'),
      ],
    });

    test('fatura traz matrícula e bloqueio', () {
      final i1 = center.invoices.firstWhere((i) => i.invoiceId == 'i1');
      final i2 = center.invoices.firstWhere((i) => i.invoiceId == 'i2');
      expect(i1.enrollmentId, 'e1');
      expect(i1.blockedByContract, isTrue);
      expect(i1.payUrl, isNull);
      expect(i2.enrollmentId, isNull);
      expect(i2.blockedByContract, isFalse);
    });

    test('contratos abertos, por id, o que bloqueia e a fatura da matrícula',
        () {
      expect(center.contracts, hasLength(3));
      expect(center.openContracts.map((c) => c.contractId), ['k1', 'k2']);
      expect(center.contractById('k0')?.isSigned, isTrue);
      expect(center.contractById('x'), isNull);
      expect(center.blockingContractOf('e1')?.contractId, 'k1');
      expect(center.blockingContractOf(null), isNull);
      expect(center.openInvoiceOf('e1')?.invoiceId, 'i1');
      expect(center.openInvoiceOf('e9'), isNull);
    });
  });

  group('situação', () {
    const today = '2026-10-24';
    test('status salvo e vigência', () {
      expect(contractStateOf('sent', null, today), ContractState.sent);
      expect(contractStateOf('viewed', null, today), ContractState.viewed);
      expect(
        contractStateOf('signed', '2027-10-23', today),
        ContractState.signed,
      );
      // Até 30 dias do fim: renova em breve (inclusive o 30º dia).
      expect(
        contractStateOf('signed', '2026-11-23', today),
        ContractState.expiring,
      );
      expect(
        contractStateOf('signed', '2026-11-24', today),
        ContractState.signed,
      );
      expect(
        contractStateOf('signed', '2026-10-23', today),
        ContractState.expired,
      );
      // Termo sem vigência nunca expira.
      expect(contractStateOf('signed', null, today), ContractState.signed);
      expect(contractStateOf('declined', null, today), ContractState.declined);
      expect(
        contractStateOf('terminated', '2026-01-01', today),
        ContractState.terminated,
      );
      expect(
        contractStateOf('cancelled', null, today),
        ContractState.cancelled,
      );
    });

    test('rótulos e tons do protótipo', () {
      expect(contractStateLabel(ContractState.viewed), 'Aberto · não assinado');
      expect(contractStateTone(ContractState.sent), ContractTone.yellow);
      expect(contractStateTone(ContractState.viewed), ContractTone.orange);
      expect(contractStateTone(ContractState.expiring), ContractTone.orange);
      expect(contractStateTone(ContractState.signed), ContractTone.green);
      expect(contractStateTone(ContractState.expired), ContractTone.red);
      expect(contractStateTone(ContractState.terminated), ContractTone.dim);
      expect(contractStateIsOpen(ContractState.viewed), isTrue);
      expect(contractStateIsOpen(ContractState.signed), isFalse);
      expect(contractStateIsHistory(ContractState.expired), isTrue);
      expect(contractStateIsHistory(ContractState.expiring), isFalse);
    });
  });

  group('texto do contrato', () {
    test('títulos com "# " e parágrafos por linha em branco', () {
      final blocks = parseContractBody(
        '# 1. Partes\r\nCT e aluno.\nSegunda linha.\n\n\n'
        'Parágrafo solto.\n#sem espaço não é título\n# 2. Valor\nR\$ 320.',
      );
      expect(blocks, const [
        ContractBlock.heading('1. Partes'),
        ContractBlock.paragraph('CT e aluno.\nSegunda linha.'),
        ContractBlock.paragraph('Parágrafo solto.\n#sem espaço não é título'),
        ContractBlock.heading('2. Valor'),
        ContractBlock.paragraph('R\$ 320.'),
      ]);
      expect(parseContractBody('  \n\n'), isEmpty);
    });

    test('aceite: matrícula, termo e responsável legal', () {
      expect(
        contractAgreementText(
          kind: 'enrollment',
          title: 'Contrato de matrícula',
          centerName: 'CT Maré Alta',
          asGuardian: false,
          signerName: 'Lara',
          studentName: 'Lara',
        ),
        'Li e concordo com o contrato de matrícula do CT Maré Alta.',
      );
      expect(
        contractAgreementText(
          kind: 'term',
          title: 'Termo de saúde',
          centerName: 'CT Maré Alta',
          asGuardian: false,
          signerName: 'Lara',
          studentName: 'Lara',
        ),
        'Li e concordo com o documento "Termo de saúde" do CT Maré Alta.',
      );
      expect(
        contractAgreementText(
          kind: 'enrollment',
          title: 'Contrato',
          centerName: 'CT Maré Alta',
          asGuardian: true,
          signerName: 'Patrícia Moura',
          studentName: 'Isabela Moura',
        ),
        'Sou Patrícia Moura, responsável legal por Isabela Moura, e concordo '
        'com o contrato.',
      );
    });

    test('linha do aluno na lista', () {
      expect(
        contractStudentLine(
          state: ContractState.viewed,
          optional: true,
          version: 1,
        ),
        'Opcional · você pode recusar',
      );
      expect(
        contractStudentLine(
          state: ContractState.signed,
          optional: false,
          version: 1,
          signedDay: '2026-10-24',
        ),
        'Assinado 24 out · v1',
      );
      expect(
        contractStudentLine(
          state: ContractState.terminated,
          optional: false,
          version: 2,
          signedDay: '2026-03-02',
        ),
        'Assinado 02 mar · encerrado',
      );
      expect(
        contractStudentLine(
          state: ContractState.declined,
          optional: true,
          version: 1,
          signedDay: '2026-10-24',
        ),
        'Não autorizado 24 out',
      );
    });

    test('datas', () {
      expect(contractAddDays('2026-10-24', 30), '2026-11-23');
      expect(contractAddDays('x', 1), '');
      expect(contractDaysBetween('2026-10-20', '2026-10-24'), 4);
      expect(contractDayMonth('2026-10-05'), '05 out');
      expect(contractDayMonth('2026-10-05', withYear: true), '05 out 2026');
      expect(
        contractWallLabel(DateTime(2026, 10, 24, 14, 31)),
        '24 out 2026 · 14:31',
      );
      expect(contractTermLabel(null, null), 'Indeterminado');
      expect(
        contractTermLabel('2026-10-24', '2027-10-23'),
        '24 out 26 a 23 out 27',
      );
    });
  });

  group('push do contrato', () {
    test('abre a leitura; sem contrato, a lista; sem centro, o hub', () {
      expect(
        resolveNotificationRoute({
          'type': 'training_center_contract',
          'centerId': 'ct1',
          'contractId': 'k1',
        }),
        '/treinos/centro/ct1/contrato/k1',
      );
      expect(
        resolveNotificationRoute({
          'type': 'training_center_contract',
          'centerId': 'ct1',
        }),
        '/treinos/centro/ct1/contratos',
      );
      expect(
        resolveNotificationRoute({'type': 'training_center_contract'}),
        '/treinos',
      );
    });
  });
}
