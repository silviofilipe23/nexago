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
    ({bool approve, bool reject, bool askDocument, bool undo}) actions(
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
}
