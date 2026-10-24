import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_exit_requests.dart';

/// Documento de `trainingCenters/{c}/enrollmentRequests/{id}` como o servidor
/// grava (`functions/src/training-center-enrollment-requests.ts`), com os
/// `Timestamp` já convertidos.
Map<String, Object?> exitJson({
  String type = 'injury',
  String status = 'pending',
  Map<String, Object?> extra = const {},
}) =>
    {
      'enrollmentId': 'e1',
      'studentId': 's1',
      'studentUid': 'u1',
      'studentName': 'Carla Dias',
      'classId': 'c1',
      'className': 'BT Feminino Manhã',
      'planName': 'Mensal 2x',
      'planType': 'monthly',
      'priceCents': 32000,
      'type': type,
      'source': 'app',
      'comment': '',
      'createdAt': DateTime.utc(2026, 10, 24, 12, 12),
      'decidedAt': null,
      'decidedByName': '',
      'decisionNote': '',
      'reason': 'Entorse no joelho',
      'startsOn': '2026-10-24',
      'endsOn': '2026-11-22',
      'pausedUntil': '2026-11-23',
      'days': 30,
      'overLimit': false,
      'certificate': {
        'path': 'trainingCenterCertificates/ct1/u1/1-atestado.pdf',
        'fileName': 'atestado.pdf',
        'contentType': 'application/pdf',
        'sizeBytes': 348160,
        'issuedOn': '2026-10-23',
        'doctor': '',
        'description': 'Entorse no joelho',
        'daysOff': 30,
      },
      'status': status,
      ...extra,
    };

void main() {
  test('lê o pedido com atestado', () {
    final r = CenterExitRequest.fromMap('r1', exitJson());
    expect(r.id, 'r1');
    expect(r.studentName, 'Carla Dias');
    expect(r.isInjury, isTrue);
    expect(r.awaitsReview, isTrue);
    expect(r.typeLabel, 'Pausa por lesão');
    expect(r.periodLabel, '24 out a 22 nov');
    expect(r.pausedUntil, '2026-11-23');
    final c = r.certificate!;
    expect(c.isPdf, isTrue);
    expect(c.isImage, isFalse);
    expect(c.issuedOn, '2026-10-23');
    expect(c.daysOff, 30);
    expect(c.sizeLabel, '340 KB');
  });

  test('cancelamento: motivo pela chave e último dia', () {
    final r = CenterExitRequest.fromMap(
      'r2',
      exitJson(
        type: 'cancel',
        status: 'scheduled',
        extra: {
          'reason': 'schedule',
          'lastDay': '2026-11-04',
          'certificate': null,
          'startsOn': null,
          'endsOn': null,
        },
      ),
    );
    expect(r.reasonLabel, 'Horário não funciona mais');
    expect(r.periodLabel, 'último dia 04 nov');
    expect(r.certificate, isNull);
    expect(centerExitStatusOf(r).label, 'Em aviso');
    expect(centerExitStatusOf(r).tone, CenterExitTone.danger);
  });

  test('retenção: ficou com outro plano', () {
    final r = CenterExitRequest.fromMap(
      'r3',
      exitJson(
        type: 'cancel',
        status: 'retained',
        extra: {
          'reason': 'price',
          'retention': {'accepted': 'plan_change', 'planName': 'Mensal 1x'},
          'effectiveFrom': '2026-11-05',
        },
      ),
    );
    expect(r.retainedPlanName, 'Mensal 1x');
    expect(r.effectiveFrom, '2026-11-05');
    expect(r.isOpen, isFalse);
    expect(centerExitStatusOf(r).tone, CenterExitTone.success);
  });

  test('mapa vazio vira padrões seguros', () {
    final r = CenterExitRequest.fromMap('x', const {});
    expect(r.type, 'pause');
    expect(r.status, 'pending');
    expect(r.studentName, 'Aluno');
    expect(r.certificate, isNull);
    expect(r.createdAt, isNull);
  });

  group('decisões (mesma régua da callable)', () {
    ({
      bool approve,
      bool reject,
      bool askDocument,
      bool undo,
      bool clear
    }) actions(
      String type,
      String status,
    ) =>
        centerExitActions(
          CenterExitRequest.fromMap('r', exitJson(type: type, status: status)),
        );

    test('atestado em análise: aprovar, recusar ou pedir outro doc.', () {
      final a = actions('injury', 'pending');
      expect(a.approve, isTrue);
      expect(a.reject, isTrue);
      expect(a.askDocument, isTrue);
      expect(a.undo, isFalse);
    });

    test('documento pedido: só aprovar ou recusar', () {
      final a = actions('injury', 'needs_document');
      expect(a.approve, isTrue);
      expect(a.reject, isTrue);
      expect(a.askDocument, isFalse);
    });

    test('agendados podem ser desfeitos; em curso e encerrados não', () {
      expect(actions('pause', 'scheduled').undo, isTrue);
      expect(actions('cancel', 'scheduled').undo, isTrue);
      expect(actions('cancel', 'scheduled').approve, isFalse);
      final active = actions('pause', 'active');
      expect(
        [active.approve, active.reject, active.askDocument, active.undo],
        everyElement(isFalse),
      );
      expect(actions('injury', 'rejected').approve, isFalse);
    });
  });

  test('grupos: a revisar (mais antigo primeiro), em andamento e encerrados',
      () {
    CenterExitRequest r(String id, String status, int day, {String? type}) =>
        CenterExitRequest.fromMap(
          id,
          exitJson(
            type: type ?? 'injury',
            status: status,
            extra: {'createdAt': DateTime.utc(2026, 10, day)},
          ),
        );
    final g = centerExitGroups([
      r('new', 'pending', 24),
      r('old', 'pending', 20),
      r('sched', 'scheduled', 22, type: 'pause'),
      r('doc', 'needs_document', 23),
      r('done', 'done', 10, type: 'pause'),
      r('rej', 'rejected', 21),
    ]);
    expect([for (final x in g.review) x.id], ['old', 'new']);
    expect([for (final x in g.open) x.id], ['doc', 'sched']);
    expect([for (final x in g.closed) x.id], ['rej', 'done']);
    expect(
      centerExitPendingCount([
        ...g.review,
        ...g.open,
        ...g.closed,
      ]),
      2,
    );
  });

  test('retenção: ficou com o desconto', () {
    final r = CenterExitRequest.fromMap(
      'r4',
      exitJson(
        type: 'cancel',
        status: 'retained',
        extra: {
          'reason': 'price',
          'retention': {
            'accepted': 'discount',
            'percent': 20,
            'priceCents': 25600,
          },
          'effectiveFrom': '2026-11-05',
        },
      ),
    );
    expect(r.retainedDiscountPercent, 20);
    expect(r.retainedPlanName, isNull);
    final plan = CenterExitRequest.fromMap(
      'r5',
      exitJson(
        type: 'cancel',
        status: 'retained',
        extra: {
          'retention': {'accepted': 'plan_change', 'percent': 20},
        },
      ),
    );
    expect(plan.retainedDiscountPercent, isNull);
  });

  group('alta médica', () {
    CenterExitRequest injury({
      String status = 'active',
      bool require = true,
      String clearance = '',
      bool awaiting = false,
      Map<String, Object?> extra = const {},
    }) =>
        CenterExitRequest.fromMap(
          'r',
          exitJson(
            status: status,
            extra: {
              'requireClearance': require,
              'clearanceStatus': clearance,
              'awaitingClearance': awaiting,
              ...extra,
            },
          ),
        );

    test('lê a alta enviada', () {
      final r = injury(
        clearance: 'submitted',
        extra: {
          'clearance': {
            'path': 'trainingCenterCertificates/ct1/u1/2-alta.jpg',
            'fileName': 'alta.jpg',
            'contentType': 'image/jpeg',
            'sizeBytes': 1024,
            'issuedOn': '2026-11-20',
          },
        },
      );
      expect(r.requireClearance, isTrue);
      expect(r.clearance!.isImage, isTrue);
      expect(r.clearance!.issuedOn, '2026-11-20');
      expect(r.clearanceOpen, isTrue);
      expect(r.awaitsClearance, isTrue);
      expect(centerExitStatusOf(r).label, 'Revisar alta');
      expect(centerExitStatusOf(r).tone, CenterExitTone.attention);
      expect(centerExitClearanceLabel(r), 'Enviada · revisar');
    });

    test('situações da alta', () {
      expect(centerExitClearanceLabel(injury()), 'Pedida 3 dias antes do fim');
      expect(
        centerExitClearanceLabel(injury(clearance: 'requested')),
        'Pedida ao aluno',
      );
      expect(
        centerExitClearanceLabel(injury(clearance: 'approved')),
        'Aprovada',
      );
      expect(centerExitClearanceLabel(injury(require: false)), isNull);
      final held = injury(clearance: 'requested', awaiting: true);
      expect(centerExitStatusOf(held).label, 'Esperando alta');
      expect(centerExitStatusOf(injury()).label, 'Em curso');
    });

    test('aprovar/liberar só na lesão em curso com alta em aberto', () {
      expect(centerExitActions(injury()).clear, isTrue);
      expect(centerExitActions(injury(clearance: 'submitted')).clear, isTrue);
      expect(centerExitActions(injury(clearance: 'approved')).clear, isFalse);
      expect(centerExitActions(injury(require: false)).clear, isFalse);
      expect(centerExitActions(injury(status: 'scheduled')).clear, isFalse);
      expect(centerExitActions(injury(status: 'pending')).clear, isFalse);
    });

    test('alta enviada ou volta segurada contam como pendentes', () {
      final all = [
        injury(),
        injury(clearance: 'requested'),
        injury(clearance: 'submitted'),
        injury(clearance: 'requested', awaiting: true),
        injury(clearance: 'approved'),
        injury(status: 'pending', require: false),
      ];
      expect(centerExitPendingCount(all), 3);
      final g = centerExitGroups(all);
      expect(g.review, hasLength(3));
      expect(g.open, hasLength(3));
    });
  });
}
