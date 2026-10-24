import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete_training/domain/center_contract.dart';
import 'package:nexago_app/features/center_coach/domain/center_contracts.dart';

// Sáb 24/10/2026 12:00 em São Paulo.
final now = DateTime.utc(2026, 10, 24, 15);

/// Documento de `trainingCenters/{c}/contracts` já com as datas convertidas.
Map<String, Object?> contractDoc({
  String status = 'viewed',
  String kind = 'enrollment',
  bool requireBeforePayment = true,
  int viewCount = 3,
  DateTime? sentAt,
  DateTime? lastViewedAt,
  DateTime? signedAt,
  String? endDate = '2027-10-19',
  String signerRole = 'student',
  int reminderCount = 0,
  DateTime? remindedAt,
  DateTime? terminatedAt,
  String terminateReason = '',
  String templateName = 'Matrícula · adulto',
  int templateVersion = 3,
}) =>
    {
      'number': 'CTR-2026-0418',
      'centerName': 'CT Maré Alta',
      'studentId': 's3',
      'studentName': signerRole == 'guardian' ? 'Isabela Moura' : 'Elisa Prado',
      'isMinor': signerRole == 'guardian',
      'signer': {
        'role': signerRole,
        'name': signerRole == 'guardian' ? 'Patrícia Moura' : 'Elisa Prado',
        'relation': signerRole == 'guardian' ? 'Mãe' : '',
      },
      'templateName': templateName,
      'templateVersion': templateVersion,
      'kind': kind,
      'optional': false,
      'title': 'Contrato de prestação de serviços esportivos',
      'body': '# 1. Partes\nTexto.',
      'sha256': 'abc',
      'essentials': [
        {'label': 'Valor', 'value': r'R$ 320,00/mês'},
      ],
      'enrollmentId': kind == 'enrollment' ? 'e1' : null,
      'className': 'BT Intermediário B',
      'planName': 'Mensal 1x/semana',
      'startDate': '2026-10-20',
      'endDate': endDate,
      'requireBeforePayment': requireBeforePayment,
      'status': status,
      'sentAt': sentAt ?? DateTime.utc(2026, 10, 20, 13),
      'sentByName': 'Paula',
      'viewCount': viewCount,
      'viewedAt': DateTime.utc(2026, 10, 21, 0, 14),
      'lastViewedAt': lastViewedAt ?? DateTime.utc(2026, 10, 24, 0, 14),
      'signedAt': signedAt,
      'centerSignature':
          signedAt == null ? null : {'name': 'CT Maré Alta', 'at': signedAt},
      'reminderCount': reminderCount,
      'remindedAt': remindedAt,
      'terminatedAt': terminatedAt,
      'terminateReason': terminateReason,
      'events': [
        {
          'at': DateTime.utc(2026, 10, 20, 13),
          'type': 'sent',
          'title': 'Enviado pelo app',
          'byName': 'Paula',
          'detail': '',
        },
      ],
    };

CenterStudentContract contract(String id, Map<String, Object?> m) =>
    CenterStudentContract.fromMap(id, m);

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  test('lê o documento do Firestore', () {
    final c = contract('k1', contractDoc());
    expect(c.number, 'CTR-2026-0418');
    expect(c.displayName, 'Matrícula · adulto v3');
    expect(c.isOpen, isTrue);
    expect(c.viewCount, 3);
    expect(c.requireBeforePayment, isTrue);
    expect(c.signerName, 'Elisa Prado');
    expect(c.essentials.single.value, r'R$ 320,00/mês');
    expect(c.events.single.title, 'Enviado pelo app');
    expect(c.state('2026-10-24'), ContractState.viewed);

    final g = contract(
      'k2',
      contractDoc(
        status: 'signed',
        signerRole: 'guardian',
        signedAt: DateTime.utc(2026, 7, 15, 22, 42),
      ),
    );
    expect(g.asGuardian, isTrue);
    expect(g.signerRelation, 'Mãe');
    expect(g.centerSignatureName, 'CT Maré Alta');
    expect(contract('x', const {}).status, 'sent');
  });

  group('grupos da K5', () {
    test('pendente que segura o pagamento, documentos e histórico', () {
      final groups = centerContractGroups([
        contract(
          'img',
          contractDoc(
            status: 'sent',
            kind: 'term',
            requireBeforePayment: false,
            sentAt: DateTime.utc(2026, 10, 10),
            templateName: 'Termo de imagem',
          ),
        ),
        contract('v3', contractDoc()),
        contract(
          'v2',
          contractDoc(
            status: 'terminated',
            terminatedAt: DateTime.utc(2026, 10, 19, 15),
            sentAt: DateTime.utc(2025, 10, 20),
          ),
        ),
        contract(
          'old',
          contractDoc(
            status: 'signed',
            endDate: '2026-10-01',
            sentAt: DateTime.utc(2025, 9, 1),
          ),
        ),
        contract(
          'ok',
          contractDoc(
            status: 'signed',
            kind: 'term',
            endDate: null,
            sentAt: DateTime.utc(2026, 10, 1),
            signedAt: DateTime.utc(2026, 10, 2),
          ),
        ),
      ], '2026-10-24');
      // O que segura a cobrança vem antes do termo mais antigo.
      expect(groups.pending?.id, 'v3');
      expect(groups.current.map((c) => c.id), ['v3', 'img', 'ok']);
      expect(groups.history.map((c) => c.id), ['v2', 'old']);
      expect(groups.isEmpty, isFalse);
      expect(centerContractGroups(const [], '2026-10-24').isEmpty, isTrue);
    });
  });

  group('textos', () {
    test('dias pendente', () {
      final c = contract('k1', contractDoc());
      expect(centerContractPendingDays(c, now), 4);
      expect(centerContractPendingBadge(4), '4 DIAS');
      expect(centerContractPendingBadge(1), '1 DIA');
      expect(centerContractPendingBadge(0), 'HOJE');
    });

    test('card do pendente: abriu N vezes e o aviso do pagamento', () {
      expect(
        centerContractPendingText(contract('k1', contractDoc()), now),
        'Elisa abriu o contrato 3 vezes e não assinou. O pagamento da '
        'matrícula só é liberado depois da assinatura.',
      );
      expect(
        centerContractPendingText(
          contract(
            'k2',
            contractDoc(
              status: 'sent',
              viewCount: 0,
              requireBeforePayment: false,
            ),
          ),
          now,
        ),
        'Enviado 20 out. Elisa ainda não abriu.',
      );
      expect(
        centerContractPendingText(
          contract(
            'k3',
            contractDoc(viewCount: 1, signerRole: 'guardian'),
          ),
          now,
        ),
        startsWith('Patrícia abriu o contrato 1 vez e não assinou.'),
      );
    });

    test('linha de cada situação', () {
      String line(Map<String, Object?> m) =>
          centerContractRowLine(contract('k', m), now);
      expect(line(contractDoc()), 'Aberto 3× · último ontem 21:14');
      expect(
        line(contractDoc(lastViewedAt: DateTime.utc(2026, 10, 24, 13, 2))),
        'Aberto 3× · último hoje 10:02',
      );
      expect(
        line(
          contractDoc(
            status: 'sent',
            sentAt: DateTime.utc(2026, 10, 8, 15),
            reminderCount: 1,
            remindedAt: DateTime.utc(2026, 10, 15, 15),
          ),
        ),
        'Enviado 08 out · lembrete 15 out',
      );
      expect(
        line(
          contractDoc(
            status: 'signed',
            signedAt: DateTime.utc(2025, 10, 20, 15),
          ),
        ),
        'Assinado 20 out 2025',
      );
      expect(
        line(
          contractDoc(
            status: 'signed',
            signerRole: 'guardian',
            signedAt: DateTime.utc(2026, 7, 15, 22),
          ),
        ),
        'Patrícia Moura (resp.) · 15 jul',
      );
      expect(
        line(
          contractDoc(
            status: 'signed',
            endDate: '2026-11-09',
            signedAt: DateTime.utc(2025, 11, 10, 15),
          ),
        ),
        'Assinado 10 nov 2025 · vence 09 nov',
      );
      expect(
        line(contractDoc(status: 'signed', endDate: '2026-10-01')),
        'Expirou 01 out',
      );
      expect(
        line(
          contractDoc(
            status: 'terminated',
            terminatedAt: DateTime.utc(2026, 10, 19, 15),
            terminateReason: 'substituído pela v3',
          ),
        ),
        'Encerrado 19 out · substituído pela v3',
      );
      expect(
        line(
          contractDoc(
            status: 'declined',
            signedAt: DateTime.utc(2026, 10, 22, 15),
          ),
        ),
        'Recusado 22 out',
      );
    });

    test('WhatsApp: DDI 55 quando falta; número curto não abre', () {
      expect(
        centerWhatsappUri('(21) 99876-4471').toString(),
        'https://wa.me/5521998764471',
      );
      expect(
        centerWhatsappUri('+55 21 99876-4471', message: 'Oi, Elisa!')
            .toString(),
        'https://wa.me/5521998764471?text=Oi%2C%20Elisa!',
      );
      expect(centerWhatsappUri('4471'), isNull);
      expect(centerWhatsappUri(''), isNull);
    });
  });
}
