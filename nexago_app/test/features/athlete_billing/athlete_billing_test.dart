import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';
import 'package:nexago_app/features/athlete_training/domain/training_plans.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_payment_mode.dart';

const _uid = 'me';
final _now = DateTime(2026, 11, 3, 10);
const _today = '2026-11-03';

ClassChargeEntry _classCharge({
  String id = 'cc1',
  bool overdue = false,
  String? url = 'https://asaas.com/i/1',
  String source = 'arena',
  String due = '2026-11-05',
}) =>
    ClassChargeEntry(
      chargeId: id,
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      description: 'Mensalidade nov',
      amountReais: 200,
      dueDate: due,
      overdue: overdue,
      payment: url == null ? 'manual' : 'online',
      invoiceUrl: url,
      source: source,
    );

ScheduleSubscription _sub({
  List<ScheduleCharge> charges = const [],
  List<ScheduleSubscriptionMember> members = const [],
  ScheduleSubscriptionStatus status = ScheduleSubscriptionStatus.active,
}) =>
    ScheduleSubscription(
      id: 's1',
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      planId: 'p1',
      planName: 'Fixo Noite 2x',
      monthlyPriceReais: 450,
      dueDay: 5,
      status: status,
      members: members,
      slots: const [
        ScheduleSubscriptionSlot(
            weekday: 2, startTime: '20:00', endTime: '21:00'),
        ScheduleSubscriptionSlot(
            weekday: 4, startTime: '20:00', endTime: '21:00'),
      ],
      charges: charges,
    );

MyBookingItem _booking({
  String status = 'pending_payment',
  String date = '2026-11-10',
  String? owner = _uid,
}) =>
    MyBookingItem(
      id: 'b1',
      ownerAthleteId: owner,
      arenaName: 'Arena Norte',
      courtName: 'Quadra 3',
      dateRaw: date,
      startTime: '18:00',
      endTime: '19:00',
      rawStatus: status,
      amountReais: 120,
      paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX'),
    );

MyTournamentEnrollment _enrollment({
  bool isPaid = false,
  bool partnerPending = false,
  TournamentPaymentMode mode = TournamentPaymentMode.appPixCard,
}) =>
    MyTournamentEnrollment(
      registration: MyTournamentRegistration(
        registrationId: 'r1',
        tournamentId: 't1',
        tournamentName: 'Open CFC',
        dateLabel: '2026-11-20',
        statusLabel: '',
        isPaid: isPaid,
        categoryId: 'c1',
        partnerPending: partnerPending,
        paymentMode: mode,
        category: const TournamentCategoryOffer(
          id: 'c1',
          name: 'Dupla mista',
          entryFee: 240,
        ),
      ),
    );

void main() {
  group('buildOpenCharges', () {
    test('junta as origens com vencidas primeiro e depois o vencimento', () {
      final list = buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        classCharges: [
          _classCharge(id: 'late', overdue: true, due: '2026-10-30'),
          _classCharge(id: 'next', due: '2026-11-07'),
        ],
        subscriptions: [
          _sub(charges: [
            ScheduleCharge(
              id: 'sc1',
              period: '2026-11',
              amountReais: 112.5,
              dueDate: DateTime(2026, 11, 5),
              billingMode: 'asaas',
            ),
          ]),
        ],
        bookings: [_booking()],
        enrollments: [_enrollment()],
      );

      expect(list.map((c) => c.id), [
        'class-late',
        'schedule-sc1',
        'class-next',
        'booking-b1',
        'tournament-r1',
      ]);
      expect(list.first.state, AthleteChargeState.overdue);
      expect(list.first.target, isA<ClassInvoiceTarget>());
      expect(list[1].title, 'Fixo Noite 2x · nov');
      expect(list[1].state, AthleteChargeState.due);
    });

    test('aula sem fatura é paga direto e leva aos planos', () {
      final c = buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        classCharges: [_classCharge(url: null, source: 'professor')],
      ).single;

      expect(c.state, AthleteChargeState.direct);
      expect(c.note, 'direto ao professor');
      expect(c.target, isA<TrainingPlansTarget>());
    });

    test('fatura do centro vencida vira vencida e abre a F2', () {
      final c = buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        centers: const [
          TrainingCenterLink(
            centerId: 'ct1',
            name: 'CT Areia Alta',
            invoices: [
              CenterInvoice(
                invoiceId: 'i1',
                reference: 'Mensalidade out',
                amountCents: 48000,
                dueDate: '2026-10-05',
                status: 'pending',
              ),
              CenterInvoice(
                invoiceId: 'i0',
                reference: 'Mensalidade set',
                amountCents: 48000,
                dueDate: '2026-09-05',
                status: 'approved',
              ),
            ],
          ),
        ],
      ).single;

      expect(c.isOverdue, isTrue);
      expect(c.amountReais, 480);
      expect(c.payee, 'CT Areia Alta');
      final t = c.target as CenterInvoiceTarget;
      expect((t.centerId, t.invoiceId), ('ct1', 'i1'));
    });

    test('horário fixo: só a parte do atleta, e mensalidade na arena é direta',
        () {
      final list = buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        subscriptions: [
          _sub(
            members: const [
              ScheduleSubscriptionMember(athleteId: _uid, name: 'Eu'),
              ScheduleSubscriptionMember(athleteId: 'x', name: 'Marina'),
            ],
            charges: [
              ScheduleCharge(
                id: 'mine',
                period: '2026-11',
                amountReais: 225,
                dueDate: DateTime(2026, 11, 1),
                payerAthleteId: _uid,
                billingMode: 'manual',
              ),
              ScheduleCharge(
                id: 'hers',
                amountReais: 225,
                payerAthleteId: 'x',
              ),
              const ScheduleCharge(id: 'paid', status: 'paid'),
            ],
          ),
        ],
      );

      expect(list.single.id, 'schedule-mine');
      expect(list.single.isOverdue, isTrue);
      expect(list.single.note, 'sua parte · na arena');
    });

    test('mensalidade com débito agendado: selo com o dia', () {
      List<AthleteCharge> build(String state) => buildOpenCharges(
            uid: _uid,
            todayKey: _today,
            now: _now,
            subscriptions: [
              _sub(charges: [
                ScheduleCharge(
                  id: 'c',
                  period: '2026-12',
                  amountReais: 300,
                  dueDate: DateTime(2026, 12, 5),
                  payerAthleteId: _uid,
                  billingMode: 'asaas',
                  autopay: ScheduleChargeAutopay(
                    state: state,
                    scheduledFor: '2026-12-05',
                  ),
                ),
              ]),
            ],
          );
      expect(build('scheduled').single.note, 'Débito automático em 05/12');
      expect(build('failed').single.note, isNull);
    });

    test('assinatura cancelada não cobra', () {
      final list = buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        subscriptions: [
          _sub(
            status: ScheduleSubscriptionStatus.canceled,
            charges: const [ScheduleCharge(id: 'x')],
          ),
        ],
      );
      expect(list, isEmpty);
    });

    test('reserva: só a própria, aguardando Pix e ainda por vir', () {
      expect(
        bookingAwaitsMyPayment(_booking(), uid: _uid, now: _now),
        isTrue,
      );
      expect(
        bookingAwaitsMyPayment(_booking(status: 'confirmed'),
            uid: _uid, now: _now),
        isFalse,
      );
      expect(
        bookingAwaitsMyPayment(_booking(date: '2026-11-01'),
            uid: _uid, now: _now),
        isFalse,
      );
      expect(
        bookingAwaitsMyPayment(_booking(owner: 'outro'), uid: _uid, now: _now),
        isFalse,
      );
    });

    test('inscrição: parte do atleta e pagamento direto ao organizador', () {
      expect(enrollmentShareReais(_enrollment()), 120);
      expect(enrollmentAwaitsPayment(_enrollment(isPaid: true)), isFalse);
      expect(
        enrollmentAwaitsPayment(_enrollment(partnerPending: true)),
        isFalse,
      );

      final direct = buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        enrollments: [
          _enrollment(mode: TournamentPaymentMode.directWithOrganizer),
        ],
      ).single;
      expect(direct.state, AthleteChargeState.direct);
      expect(direct.note, 'direto ao organizador');
      expect(direct.target, isA<TournamentRegistrationTarget>());
    });
  });

  test('resumo conta vencidas, a pagar e diretas', () {
    final s = AthleteChargesSummary.of(
      buildOpenCharges(
        uid: _uid,
        todayKey: _today,
        now: _now,
        classCharges: [
          _classCharge(id: 'a', overdue: true),
          _classCharge(id: 'b'),
          _classCharge(id: 'c', url: null),
        ],
      ),
    );
    expect(s.total, 600);
    expect((s.overdueCount, s.dueCount, s.directCount), (1, 1, 1));
    expect(s.overdueTotal, 200);
  });

  test('selo do vencimento', () {
    AthleteCharge c(AthleteChargeState st, String? due) => AthleteCharge(
          id: 'x',
          kind: AthleteChargeKind.classes,
          title: '',
          payee: '',
          amountReais: 0,
          state: st,
          dueDate: due,
          target: const TrainingPlansTarget(),
        );
    expect(athleteChargeDueLabel(c(AthleteChargeState.overdue, '2026-10-30')),
        'VENCEU 30 OUT');
    expect(athleteChargeDueLabel(c(AthleteChargeState.due, '2026-11-05')),
        'VENCE 05 NOV');
    expect(athleteChargeDueLabel(c(AthleteChargeState.due, null)), 'A PAGAR');
    expect(
      athleteChargeDueLabel(c(AthleteChargeState.direct, null)),
      'PAGAR DIRETO',
    );
  });

  group('recorrentes', () {
    test('horário fixo dividido mostra a parte e o total', () {
      final list = buildRecurringCharges(
        uid: _uid,
        subscriptions: [
          _sub(
            members: const [
              ScheduleSubscriptionMember(
                athleteId: _uid,
                name: 'Eu',
                shareReais: 112.5,
                isHolder: true,
              ),
              ScheduleSubscriptionMember(athleteId: 'a', name: 'A'),
              ScheduleSubscriptionMember(athleteId: 'b', name: 'B'),
              ScheduleSubscriptionMember(athleteId: 'c', name: 'C'),
            ],
          ),
        ],
      );
      final r = list.single;
      expect(r.amountReais, 112.5);
      expect(r.totalReais, 450);
      expect(r.cycleLabel, 'Mensal · dia 05 · dividido em 4');
      expect(r.target, isA<SchedulePlanTarget>());
    });

    test('compromisso mensal deixa pacote de fora', () {
      final list = buildRecurringCharges(
        uid: _uid,
        plans: const MyTrainingPlans(
          arenaPlans: [
            ArenaTrainingPlan(
              enrollmentId: 'e1',
              arenaName: 'Arena CFC',
              planName: 'Mensal 2x',
              kind: 'monthly',
              priceReais: 300,
              dueDay: 10,
            ),
            ArenaTrainingPlan(
              enrollmentId: 'e2',
              arenaName: 'Arena CFC',
              planName: 'Pacote 8',
              kind: 'package',
              priceReais: 640,
              creditsLeft: 3,
            ),
          ],
          professorPlans: [
            ProfessorTrainingPlan(
              professorUid: 'p1',
              professorName: 'Thiago',
              recurringReais: 400,
              recurringDueDay: 7,
            ),
            // Sem mensalidade: cobra por aula, não é recorrente.
            ProfessorTrainingPlan(professorUid: 'p2', professorName: 'Ana'),
          ],
        ),
      );

      expect(list.map((r) => r.id), ['arena-e1', 'arena-e2', 'professor-p1']);
      expect(list[1].cycleLabel, 'Pacote · 3 aulas restantes');
      expect(monthlyCommitment(list), 700);
    });
  });

  test('histórico agrupa por mês, do mais recente, com comprovante', () {
    final months = buildPaidHistory(
      uid: _uid,
      plans: const MyTrainingPlans(
        payments: [
          TrainingPayment(
            fromProfessor: true,
            chargeId: 'pc1',
            payee: 'Thiago',
            description: 'Pacote 8 aulas',
            amountReais: 640,
            paidOn: '2026-10-01',
          ),
          TrainingPayment(
            fromProfessor: false,
            chargeId: 'ac1',
            payee: 'Arena CFC',
            description: 'Turma B',
            amountReais: 300,
            paidOn: '2026-09-15',
          ),
        ],
      ),
      subscriptions: [
        _sub(charges: [
          ScheduleCharge(
            id: 'sc',
            period: '2026-10',
            amountReais: 112.5,
            dueDate: DateTime(2026, 10, 5),
            status: 'paid',
          ),
        ]),
      ],
    );

    expect(months.map((m) => m.monthKey), ['2026-10', '2026-09']);
    expect(months.first.total, 752.5);
    expect(months.first.byKind, [
      (AthleteChargeKind.classes, 640.0),
      (AthleteChargeKind.fixedSchedule, 112.5),
    ]);
    expect(months.first.items.first.professorChargeId, isNull);
    expect(months.first.items.last.professorChargeId, 'pc1');
    expect(paidMonthLabel('2026-10'), 'Outubro 2026');
    expect(paidMonthName('2026-10'), 'outubro');
  });

  test('tipo pela chave da rota', () {
    for (final k in AthleteChargeKind.values) {
      expect(athleteChargeKindFromKey(k.key), k);
    }
    expect(athleteChargeKindFromKey('x'), isNull);
  });
}
