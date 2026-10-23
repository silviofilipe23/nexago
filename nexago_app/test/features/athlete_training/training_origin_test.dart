import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete_training/domain/athlete_training.dart';
import 'package:nexago_app/features/athlete_training/domain/class_presence.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';
import 'package:nexago_app/features/athlete_training/domain/training_origin_links.dart';
import 'package:nexago_app/features/athlete_training/domain/training_plans.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';

// Qua 21/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 21, 15);

/// Resposta de `getMyTrainingCenters` como o servidor manda.
Map<String, Object?> centerResponse() => {
  'centers': [
    {
      'centerId': 'ct1',
      'name': 'CT Areia Alta',
      'city': 'Rio de Janeiro',
      'state': 'RJ',
      'makeupCredits': 1,
      'billingHold': false,
          'checkinCode': 'ABCDEFGH23',
      'policies': {'excusedNoticeHours': 6, 'excusedAbsenceMakeup': true},
      'enrollments': [
        {
          'enrollmentId': 'e1',
          'classId': 'k1',
          'className': 'Performance',
          'status': 'active',
          'startDate': '2026-08-01',
          'planName': 'Mensal 3×',
          'planType': 'monthly',
          'priceCents': 48000,
          'classesPerWeek': 3,
          'coachName': 'Paula Viana',
          'weekdays': [1, 3, 5],
          'startTime': '07:00',
          'billing': {
            'status': 'active',
            'billingDay': 5,
            'method': 'pix_manual',
            'nextChargeDate': '2026-11-05',
          },
        },
      ],
      'sessions': [
        {
          'sessionId': 'k1_2026-10-19',
          'classId': 'k1',
          'className': 'Performance',
          'date': '2026-10-19',
          'startTime': '07:00',
          'durationMin': 90,
          'status': 'done',
          'myMark': 'present',
        },
        {
          'sessionId': 'k1_2026-10-23',
          'classId': 'k1',
          'className': 'Performance',
          'date': '2026-10-23',
          'startTime': '07:00',
          'durationMin': 90,
          'coachName': 'Paula',
          'locationName': 'Sede Barra',
          'status': 'scheduled',
        },
        {
          'sessionId': 'k1_2026-10-26',
          'classId': 'k1',
          'className': 'Performance',
          'date': '2026-10-26',
          'startTime': '07:00',
          'durationMin': 90,
          'coachName': 'Rafael Souza',
          'locationName': 'Praia do Leme',
          'defaultLocationName': 'Sede Barra',
          'locationChanged': true,
          'changed': true,
          'changeReason': 'Físico na areia',
          'status': 'scheduled',
        },
      ],
      'locations': [
        {'name': 'Sede Barra', 'type': 'own', 'address': 'Av. Lúcio Costa'},
        {'name': 'Praia do Leme', 'type': 'adhoc'},
      ],
      'invoices': [
        {
          'invoiceId': 'i1',
          'reference': 'Novembro',
          'amountCents': 48000,
          'dueDate': '2026-11-05',
          'status': 'pending',
          'payUrl': 'https://www.asaas.com/i/1',
        },
        {
          'invoiceId': 'i0',
          'reference': 'Outubro',
          'amountCents': 48000,
          'dueDate': '2026-10-05',
          'status': 'approved',
          'paidOn': '2026-10-03',
          'method': 'pix',
        },
      ],
    },
  ],
};

ClassAgendaEntry _arenaClass(String id, String date) => ClassAgendaEntry(
  sessionId: id,
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  classId: 'c1',
  className: 'Intermediário B',
  teacherName: 'Juliana Rocha',
  courtName: 'Quadra 2',
  date: date,
  startTime: '19:00',
  endTime: '20:00',
  startAt: null,
  status: 'scheduled',
  role: 'student',
  kind: 'regular',
);

PrivateLesson _private(String id, DateTime start) => PrivateLesson(
  id: id,
  professorUid: 'tm',
  professorName: 'Thiago Mendes',
  athleteId: 'me',
  athleteName: 'Eu',
  startAt: start,
  endAt: start.add(const Duration(hours: 1)),
  durationMin: 60,
  status: PrivateLessonStatus.confirmed,
);

const _arenaPlan = ArenaTrainingPlan(
  enrollmentId: 'ae1',
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  planName: 'Trimestral',
  kind: 'monthly',
  priceReais: 380,
  slots: [
    ArenaPlanSlot(
      classId: 'c1',
      className: 'Intermediário B',
      weekday: 2,
      startTime: '19:00',
      teacherName: 'Juliana Rocha',
    ),
  ],
);

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('getMyTrainingCenters → modelo', () {
    test('lê centro, matrícula, aulas, locais e faturas', () {
      final c = trainingCentersFromResponse(centerResponse()).single;
      expect(c.name, 'CT Areia Alta');
      expect(c.placeLabel, 'Rio de Janeiro · RJ');
      expect(c.policies.excusedNoticeHours, 6);
      final e = c.enrollments.single;
      expect(e.weekdays, [1, 3, 5]);
      expect(e.priceReais, 480);
      expect(e.nextChargeDate, '2026-11-05');
      expect(centerPlanSummary(e), 'Mensal · 3×/sem');
      expect(c.sessions, hasLength(3));
      expect(c.sessionById('k1_2026-10-26')!.locationChanged, isTrue);
      expect(c.openInvoices.single.payUrl, 'https://www.asaas.com/i/1');
      expect(c.coachNames, ['Paula Viana', 'Rafael Souza']);
      expect(c.monthPresencePercent('2026-10-21'), 100);
    });

    test('resposta inesperada vira lista vazia', () {
      expect(trainingCentersFromResponse(null), isEmpty);
      expect(trainingCentersFromResponse({'centers': 'x'}), isEmpty);
    });

    test('fatura vencida e rótulos', () {
      const i = CenterInvoice(
        invoiceId: 'x',
        reference: 'Outubro',
        amountCents: 100,
        dueDate: '2026-10-05',
        status: 'pending',
      );
      expect(i.isOverdue('2026-10-21'), isTrue);
      expect(centerInvoiceStatusLabel(i, '2026-10-21'), 'VENCIDA');
      expect(centerInvoiceStatusLabel(i, '2026-10-01'), 'EM ABERTO');
    });

    test('faturas pagas entram nos últimos pagamentos, em ordem', () {
      final c = trainingCentersFromResponse(centerResponse());
      final merged = centerPaymentsMerged([
        TrainingPayment.fromMap(const {
          'source': 'arena',
          'chargeId': 'a',
          'payee': 'Arena CFC',
          'description': 'Trimestral',
          'amountReais': 380,
          'paidOn': '2026-10-15',
        }),
      ], c);
      expect(merged.map((p) => p.chargeId), ['a', 'i0']);
      expect(merged.last.payee, 'CT Areia Alta');
      expect(merged.last.method, 'Pix');
    });
  });

  group('origem na linha do tempo', () {
    test(
      'aula do centro vira treino com origem Centro e estado da chamada',
      () {
        final c = trainingCentersFromResponse(centerResponse()).single;
        final all = buildTrainings(
          classes: [_arenaClass('s1', '2026-10-22')],
          privateLessons: [_private('p1', DateTime.utc(2026, 10, 24, 12))],
          centers: [c],
          now: _now,
        );
        expect(all.map((t) => t.origin), [
          TrainingOrigin.center, // 19/10, passada
          TrainingOrigin.arena,
          TrainingOrigin.center,
          TrainingOrigin.private,
          TrainingOrigin.center,
        ]);
        final past = all.first;
        expect(past.state, TrainingState.present);
        expect(
          past.endAt.difference(past.startAt),
          const Duration(minutes: 90),
        );
        final moved = all.last;
        expect(moved.isCenter, isTrue);
        expect(moved.centerId, 'ct1');
        expect(moved.locationChanged, isTrue);
        expect(moved.placeLabel, 'Praia do Leme');
        expect(trainingOriginsOf(all), TrainingOrigin.values);
      },
    );

    test('filtro por origem e semana', () {
      final c = trainingCentersFromResponse(centerResponse()).single;
      final all = buildTrainings(
        classes: [_arenaClass('s1', '2026-10-22')],
        privateLessons: const [],
        centers: [c],
        now: _now,
      );
      expect(
        all.where((t) => trainingMatchesOrigin(t, TrainingOrigin.arena)),
        hasLength(1),
      );
      expect(all.where((t) => trainingMatchesOrigin(t, null)), hasLength(4));
      expect(trainingWeekKeys('2026-10-29'), [
        '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', //
        '2026-11-02', '2026-11-03', '2026-11-04',
      ]);
    });
  });

  group('O1 · onde eu treino', () {
    test('um vínculo por professor, turma e centro, com o aviso certo', () {
      final c = trainingCentersFromResponse(centerResponse()).single;
      final all = buildTrainings(
        classes: [_arenaClass('s1', '2026-10-22')],
        privateLessons: [_private('p1', DateTime.utc(2026, 10, 24, 12))],
        centers: [c],
        now: _now,
      );
      final links = trainingOriginLinks(
        upcoming: upcomingTrainings(all, _now),
        plans: const MyTrainingPlans(arenaPlans: [_arenaPlan]),
        centers: [c],
        credits: const [
          ClassMakeupCredit(
            creditId: 'cr1',
            arenaId: 'a1',
            arenaName: 'Arena CFC',
            classId: 'c1',
            className: 'Intermediário B',
            level: '',
            sourceDate: '2026-10-15',
            expiresOn: '2026-11-21',
          ),
        ],
        todayKey: '2026-10-21',
      );
      expect(links.map((l) => l.origin), TrainingOrigin.values);
      final private = links[0];
      expect(private.id, 'tm');
      expect(private.name, 'Thiago Mendes');
      expect(private.plan, 'Por aula');
      final arena = links[1];
      expect(arena.next, 'Amanhã · 19:00 · Quadra 2');
      expect(arena.notice, '1 reposição livre');
      final center = links[2];
      expect(center.next, 'Sex 23 · 07:00 · Sede Barra');
      expect(center.plan, 'Mensal · 3×/sem · ${formatBRL(480)}/mês');
      expect(center.notice, 'Local muda Seg 26');
      expect(center.noticeTone, TrainingLinkNoticeTone.warning);
    });

    test('mensalidade vencida do centro passa na frente do aviso de local', () {
      final raw = centerResponse();
      final c0 = (raw['centers'] as List).first as Map<String, Object?>;
      c0['billingHold'] = true;
      final c = trainingCentersFromResponse(raw).single;
      final links = trainingOriginLinks(
        upcoming: const [],
        plans: null,
        centers: [c],
        credits: const [],
        todayKey: '2026-10-21',
      );
      expect(links.single.notice, 'Mensalidade vencida');
      expect(links.single.noticeTone, TrainingLinkNoticeTone.danger);
      expect(links.single.next, 'Sem aula marcada');
    });
  });

  group('push do centro', () {
    test('aula abre a aula do centro', () {
      expect(
        resolveNotificationRoute({
          'type': 'training_center_session_notice',
          'centerId': 'ct1',
          'sessionId': 'k1_2026-10-26',
        }),
        '/treinos/centro/ct1/aula/k1_2026-10-26',
      );
      expect(
        resolveNotificationRoute({
          'type': 'training_center_class_reminder',
          'centerId': 'ct1',
        }),
        '/treinos/centro/ct1',
      );
    });

    test('fatura abre a fatura no app; sem id, a aba Plano do centro', () {
      final data = {
        'type': 'training_center_billing_notice',
        'centerId': 'ct1',
        'invoiceId': 'sub_e1_2026-11',
        'invoiceUrl': 'https://www.asaas.com/i/1',
      };
      // A fatura abre no app (Pix + cartão), não no navegador.
      expect(externalNotificationUrl(data), isNull);
      expect(
        resolveNotificationRoute(data),
        '/treinos/centro/ct1/fatura/sub_e1_2026-11',
      );
      expect(
        resolveNotificationRoute({
          'type': 'training_center_payment_confirmed',
          'centerId': 'ct1',
        }),
        '/treinos/centro/ct1?aba=plano',
      );
    });

    test('chamada pendente e aluno que não vai abrem a chamada do professor',
        () {
      for (final type in [
        'training_center_attendance_pending',
        'training_center_student_absence',
      ]) {
        expect(
          resolveNotificationRoute({
            'type': type,
            'centerId': 'ct1',
            'sessionId': 'k1_2026-10-26',
          }),
          '/athlete/professor/centros/ct1/aula/k1_2026-10-26',
        );
      }
      expect(
        resolveNotificationRoute({'type': 'training_center_student_absence'}),
        '/athlete/professor/centros',
      );
    });

    test('matrícula e vaga abrem o centro; sem centro, o hub', () {
      expect(
        resolveNotificationRoute({
          'type': 'training_center_seat_offer',
          'centerId': 'ct1',
          'enrollmentId': 'e1',
        }),
        '/treinos/centro/ct1',
      );
      expect(
        resolveNotificationRoute({'type': 'training_center_enrollment_notice'}),
        '/treinos',
      );
    });
  });
}
