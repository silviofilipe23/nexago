import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete_training/domain/center_enrollment_request.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';

/// Payload de `getMyTrainingCenters` com os campos de trancar/cancelar
/// (`functions/src/training-center-athlete.ts`).
Map<String, Object?> centerJson({
  Map<String, Object?> policies = const {},
  List<Map<String, Object?>> requests = const [],
  Map<String, Object?> enrollment = const {},
}) =>
    {
      'centerId': 'ct1',
      'name': 'CT Maré Alta',
      'makeupCredits': 1,
      'policies': {
        'monthlyCancellation': 'end_of_cycle',
        'allowPause': true,
        'pauseMaxDaysPerYear': 60,
        'pauseMinDays': 7,
        'injuryPauseApproval': 'manual',
        'injuryMaxDays': 90,
        'injuryCountsInLimit': false,
        'cancelRetention': ['pause', 'plan_change'],
        'allowCancelWithdraw': true,
        ...policies,
      },
      'enrollments': [
        {
          'enrollmentId': 'e1',
          'classId': 'c1',
          'className': 'BT Feminino Manhã',
          'status': 'active',
          'startDate': '2026-03-05',
          'planName': 'Mensal 2x',
          'planType': 'monthly',
          'priceCents': 32000,
          'classesPerWeek': 2,
          'billing': {
            'status': 'active',
            'billingDay': 5,
            'method': 'pix_manual',
            'nextChargeDate': '2026-11-05',
          },
          'pauseDaysUsed': 10,
          'cancelLastDay': '2026-11-04',
          'retentionPlans': [
            {
              'planId': 'p1x',
              'name': 'Mensal 1x',
              'priceCents': 18000,
              'classesPerWeek': 1,
            },
          ],
          ...enrollment,
        },
      ],
      'requests': requests,
    };

Map<String, Object?> requestJson({
  String id = 'r1',
  String type = 'injury',
  String status = 'pending',
  Map<String, Object?> extra = const {},
}) =>
    {
      'requestId': id,
      'enrollmentId': 'e1',
      'type': type,
      'status': status,
      'className': 'BT Feminino Manhã',
      'startsOn': '2026-10-24',
      'endsOn': '2026-11-22',
      'days': 30,
      'lastDay': null,
      'reason': 'Entorse no joelho',
      'decisionNote': '',
      'createdOn': '2026-10-24',
      'hasCertificate': true,
      'retainedPlanName': null,
      'effectiveFrom': null,
      ...extra,
    };

const _today = '2026-10-24';

void main() {
  group('leitura do payload', () {
    test('regras novas, matrícula e pedidos', () {
      final c = TrainingCenterLink.fromMap(
        centerJson(requests: [requestJson()]),
      );
      final p = c.policies;
      expect(p.pauseMaxDaysPerYear, 60);
      expect(p.pauseMinDays, 7);
      expect(p.injuryPauseApproval, 'manual');
      expect(p.injuryMaxDays, 90);
      expect(p.injuryCountsInLimit, isFalse);
      expect(p.cancelRetention, ['pause', 'plan_change']);
      expect(p.allowCancelWithdraw, isTrue);

      final e = c.enrollmentById('e1')!;
      expect(e.pauseDaysUsed, 10);
      expect(e.cancelLastDay, '2026-11-04');
      expect(e.retentionPlans.single.name, 'Mensal 1x');
      expect(e.retentionPlans.single.priceCents, 18000);
      expect(e.retentionPlans.single.classesPerWeek, 1);

      final r = c.requests.single;
      expect(r.requestId, 'r1');
      expect(r.type, 'injury');
      expect(r.days, 30);
      expect(r.hasCertificate, isTrue);
      expect(r.isOpen, isTrue);
      expect(c.openRequestsOf('e1'), [r]);
      expect(c.closedRequestsOf('e1'), isEmpty);
    });

    test('servidor antigo: padrões tolerantes', () {
      final c = TrainingCenterLink.fromMap({
        'centerId': 'ct1',
        'name': 'CT',
        'policies': {'cancelRetention': 'lixo'},
        'enrollments': [
          {'enrollmentId': 'e1', 'classId': 'c1', 'className': 'T'},
        ],
      });
      expect(c.policies.pauseMaxDaysPerYear, 30);
      expect(c.policies.pauseMinDays, 7);
      expect(c.policies.cancelRetention, ['pause', 'plan_change']);
      expect(c.policies.allowCancelWithdraw, isTrue);
      expect(c.requests, isEmpty);
      final e = c.enrollments.single;
      expect(e.pauseDaysUsed, 0);
      expect(e.cancelLastDay, isNull);
      expect(e.retentionPlans, isEmpty);
    });

    test('ofertas de retenção desconhecidas são ignoradas', () {
      final p = CenterPolicies.fromMap({
        'cancelRetention': ['plan_change', 'desconto'],
        'injuryPauseApproval': 'auto',
      });
      expect(p.cancelRetention, ['plan_change']);
      expect(p.injuryPauseApproval, 'auto');
    });
  });

  group('estado do pedido', () {
    CenterEnrollmentRequest req(String type, String status) =>
        CenterEnrollmentRequest.fromMap(
          requestJson(type: type, status: status),
        );

    test('cada situação vira um estado da tela', () {
      expect(
        centerRequestStateOf(req('injury', 'pending')),
        CenterRequestState.injuryReview,
      );
      expect(
        centerRequestStateOf(req('injury', 'needs_document')),
        CenterRequestState.documentRequested,
      );
      expect(
        centerRequestStateOf(req('pause', 'scheduled')),
        CenterRequestState.pauseScheduled,
      );
      expect(
        centerRequestStateOf(req('pause', 'active')),
        CenterRequestState.pauseActive,
      );
      expect(
        centerRequestStateOf(req('cancel', 'scheduled')),
        CenterRequestState.cancelScheduled,
      );
      expect(centerRequestStateOf(req('cancel', 'done')), isNull);
      expect(centerRequestStateOf(req('pause', 'rejected')), isNull);
    });

    test('desistir: mesma régua do servidor', () {
      const p = CenterPolicies();
      expect(centerRequestWithdrawable(req('pause', 'scheduled'), p, _today),
          isTrue);
      expect(centerRequestWithdrawable(req('injury', 'pending'), p, _today),
          isTrue);
      expect(centerRequestWithdrawable(req('pause', 'active'), p, _today),
          isFalse);
      final cancel = CenterEnrollmentRequest.fromMap(
        requestJson(
          type: 'cancel',
          status: 'scheduled',
          extra: {'lastDay': '2026-11-04'},
        ),
      );
      expect(centerRequestWithdrawable(cancel, p, _today), isTrue);
      expect(centerRequestWithdrawable(cancel, p, '2026-11-05'), isFalse);
      expect(
        centerRequestWithdrawable(
          cancel,
          const CenterPolicies(allowCancelWithdraw: false),
          _today,
        ),
        isFalse,
      );
    });

    test('rótulos', () {
      expect(centerRequestTypeLabel('pause'), 'Trancamento');
      expect(centerRequestTypeLabel('injury'), 'Pausa por lesão');
      expect(centerRequestTypeLabel('cancel'), 'Cancelamento');
      expect(centerRequestStatusLabel(req('injury', 'pending')), 'Em análise');
      expect(centerRequestStatusLabel(req('cancel', 'scheduled')), 'Agendado');
      expect(centerRequestStatusLabel(req('pause', 'scheduled')), 'Aprovada');
      expect(
        centerRequestStatusLabel(req('pause', 'rejected')),
        'Não aprovada',
      );
    });
  });

  group('opções da matrícula', () {
    TrainingCenterLink center({
      Map<String, Object?> policies = const {},
      Map<String, Object?> enrollment = const {},
    }) =>
        TrainingCenterLink.fromMap(
          centerJson(policies: policies, enrollment: enrollment),
        );

    test('dias livres = limite do ano menos os usados', () {
      final c = center();
      expect(centerPauseDaysLeft(c.policies, c.enrollments.single), 50);
      final full = center(enrollment: {'pauseDaysUsed': 80});
      expect(centerPauseDaysLeft(full.policies, full.enrollments.single), 0);
    });

    test('trancar exige mensal ativa, permissão e o mínimo livre', () {
      final c = center();
      expect(centerCanPause(c.policies, c.enrollments.single), isTrue);
      expect(
        centerPauseOptionText(c.policies, c.enrollments.single),
        '50 dias livres no ano · vaga reservada',
      );
      final pack = center(enrollment: {'planType': 'class_pack'});
      expect(centerCanPause(pack.policies, pack.enrollments.single), isFalse);
      expect(centerCanInjuryPause(pack.enrollments.single), isFalse);
      final short = center(enrollment: {'pauseDaysUsed': 56});
      expect(centerCanPause(short.policies, short.enrollments.single), isFalse);
      expect(
        centerPauseOptionText(short.policies, short.enrollments.single),
        'Restam 4 dias no ano (mínimo 7)',
      );
      final off = center(policies: {'allowPause': false});
      expect(centerCanPause(off.policies, off.enrollments.single), isFalse);
      final paused = center(enrollment: {'status': 'paused'});
      expect(
          centerCanPause(paused.policies, paused.enrollments.single), isFalse);
      expect(centerCanCancel(paused.enrollments.single), isTrue);
      expect(
        centerCanCancel(
            center(enrollment: {'status': 'pending'}).enrollments.single),
        isFalse,
      );
    });

    test('aviso do cancelamento conforme a política', () {
      final c = center();
      expect(
        centerCancelOptionText(c.policies, c.enrollments.single),
        'Aulas até 04 nov (fim do ciclo pago)',
      );
      final now = center(policies: {'monthlyCancellation': 'immediate'});
      expect(
        centerCancelOptionText(now.policies, now.enrollments.single),
        'Encerra na hora, sem próximo ciclo',
      );
    });

    test('pausa por lesão: conta ou não no limite', () {
      expect(
        centerInjuryOptionText(const CenterPolicies()),
        'Com atestado · não conta no limite',
      );
      expect(
        centerInjuryOptionText(const CenterPolicies(injuryCountsInLimit: true)),
        'Com atestado · conta no limite do ano',
      );
    });

    test('ofertas antes de cancelar seguem cancelRetention', () {
      final c = center();
      final o = centerRetentionOffers(c.policies, c.enrollments.single);
      expect(o.pause, isTrue);
      expect(o.plans.single.planId, 'p1x');
      final onlyPlan = center(policies: {
        'cancelRetention': ['plan_change'],
      });
      final o2 = centerRetentionOffers(
        onlyPlan.policies,
        onlyPlan.enrollments.single,
      );
      expect(o2.pause, isFalse);
      expect(o2.plans, hasLength(1));
      final none = center(policies: {'cancelRetention': <String>[]});
      final o3 = centerRetentionOffers(none.policies, none.enrollments.single);
      expect(o3.pause, isFalse);
      expect(o3.plans, isEmpty);
    });
  });

  group('formulário da pausa (mesmas mensagens do servidor)', () {
    const p = CenterPolicies(pauseMaxDaysPerYear: 60, pauseMinDays: 7);

    String? err({
      String type = 'pause',
      String startsOn = _today,
      int? days = 10,
      int left = 50,
      CenterPolicies policies = p,
    }) =>
        centerPauseFormError(
          type: type,
          todayKey: _today,
          startsOn: startsOn,
          days: days,
          policies: policies,
          daysLeft: left,
        );

    test('válido', () {
      expect(err(), isNull);
      expect(err(startsOn: '2026-12-23'), isNull);
    });

    test('dias, datas e limites', () {
      expect(err(days: null), 'Informe quantos dias de pausa.');
      expect(err(days: 0), 'Informe quantos dias de pausa.');
      expect(err(days: 400), 'A pausa pode ter no máximo 1 ano.');
      expect(
          err(startsOn: '2026-10-23'), 'A pausa não pode começar no passado.');
      expect(
        err(startsOn: '2026-12-24'),
        'A pausa precisa começar nos próximos 60 dias.',
      );
      expect(err(days: 5), 'O trancamento mínimo é de 7 dias.');
      expect(
        err(days: 51),
        'Você tem 50 dias de trancamento livres neste ano.',
      );
      expect(
        err(days: 7, left: 1),
        'Você tem 1 dia de trancamento livre neste ano.',
      );
      expect(
        err(days: 7, left: 0),
        'Você já usou todos os dias de trancamento deste ano.',
      );
    });

    test('lesão: sem mínimo e fora do limite (a não ser que conte)', () {
      expect(err(type: 'injury', days: 3, left: 0), isNull);
      expect(
        err(
          type: 'injury',
          days: 30,
          left: 10,
          policies: const CenterPolicies(injuryCountsInLimit: true),
        ),
        'Você tem 10 dias de trancamento livres neste ano.',
      );
    });

    test('fim da pausa é inclusivo', () {
      expect(centerPauseEndsOn('2026-10-24', 30), '2026-11-22');
      expect(centerPauseEndsOn('2026-12-31', 1), '2026-12-31');
    });
  });

  group('auxiliares', () {
    test('datas', () {
      expect(centerShiftDay('2026-10-31', 1), '2026-11-01');
      expect(centerShiftDay('2026-03-01', -1), '2026-02-28');
      expect(centerDaysBetween('2026-10-24', '2026-12-23'), 60);
      expect(centerDaysBetween('2026-10-24', '2026-10-20'), -4);
      expect(centerShortDay('2026-11-04'), '04 nov');
      expect(centerDayRange('2026-10-24', '2026-11-22'), '24 out a 22 nov');
      expect(centerDayRange(null, '2026-11-22'), '');
    });

    test('atestado: tipo pela extensão, nome seguro e tamanho', () {
      expect(centerCertificateContentType('a.PDF'), 'application/pdf');
      expect(centerCertificateContentType('foto.jpeg'), 'image/jpeg');
      expect(centerCertificateContentType('x.heic'), 'image/heic');
      expect(centerCertificateContentType('doc.docx'), isNull);
      expect(centerCertificateContentType('sem-extensao'), isNull);
      expect(
        centerCertificateFileSlug('Atestado Carla/Dias.pdf'),
        'Atestado-Carla-Dias.pdf',
      );
      expect(centerCertificateFileSlug('../..'), 'atestado');
      expect(centerCertificateFileSlug('   '), 'atestado');
      expect(centerFileSizeLabel(340 * 1024), '340 KB');
      expect(centerFileSizeLabel(1300000), '1,2 MB');
    });

    test('motivos do cancelamento na ordem do protótipo', () {
      expect([
        for (final (k, _) in kCenterCancelReasons) k
      ], [
        'price',
        'schedule',
        'moving',
        'health',
        'class',
        'other',
      ]);
    });
  });
}
