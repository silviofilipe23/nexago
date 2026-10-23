import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_management.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_messages_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_more_page.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/center_coach/presentation/center_mode_shell_page.dart';

CenterMembership _m(String role, {List<String> perms = const []}) =>
    CenterMembership(
      centerId: 'c1',
      centerName: 'CT',
      role: role,
      status: 'active',
      extraPerms: perms,
    );

CenterCoachClass _cls(
  String id, {
  int cap = 8,
  int taken = 0,
  String program = 'bt',
  String level = 'Iniciante',
  String status = 'active',
}) =>
    CenterCoachClass(
      id: id,
      name: id,
      programId: program,
      level: level,
      capacity: cap,
      seatsTaken: taken,
      status: status,
    );

void main() {
  group('1ª cobrança (espelho de billing.spec.ts do portal)', () {
    test('proporcional até o vencimento fixo; mês cheio; dia da matrícula', () {
      const b = CenterBillingConfig();
      final f = centerFirstInvoice(32000, b, '2026-10-20');
      expect(f.cents, (32000 * 16 / 31).round());
      expect(f.prorated, isTrue);
      expect(f.days, 16);
      expect(f.cycleDays, 31);
      expect(f.nextCharge, '2026-11-05');
      expect(
        centerFirstInvoice(
          32000,
          const CenterBillingConfig(firstMonth: 'full'),
          '2026-10-20',
        ).cents,
        32000,
      );
      expect(
        centerFirstInvoice(
          32000,
          const CenterBillingConfig(billingDayMode: 'enrollment'),
          '2026-10-20',
        ).nextCharge,
        '2026-11-20',
      );
      expect(centerShiftMonths('2026-01-31', 1, 31), '2026-02-28');
    });

    test('referência e valor da cobrança da matrícula', () {
      final plan = CenterPlan.fromMap('m2', {
        'name': 'Mensal 2x',
        'type': 'monthly',
        'priceCents': 32000,
        'classesPerWeek': 2,
      });
      final contract = centerBuildContract(plan, const {}, '2026-10-20');
      final inv = centerEnrollInvoice(
        contract: contract,
        billing: const CenterBillingConfig(),
        startDate: '2026-10-20',
        today: '2026-10-20',
      );
      expect(inv.amountCents, 16516);
      expect(inv.reference, 'Mensal 2x · out (proporcional)');
      expect(inv.detailSuffix, ' · 16/31 dias até o vencimento 05 nov');

      final pack = CenterPlan.fromMap('p8', {
        'name': 'Pacote 8',
        'type': 'class_pack',
        'priceCents': 40000,
        'credits': 8,
      });
      final packInv = centerEnrollInvoice(
        contract: centerBuildContract(pack, const {}, '2026-10-20'),
        billing: const CenterBillingConfig(),
        startDate: '2026-10-20',
        today: '2026-10-20',
      );
      expect(packInv.amountCents, 40000);
      expect(packInv.reference, 'Pacote 8');
    });

    test('preço agendado vale a partir da data; contrato congela políticas',
        () {
      final plan = CenterPlan.fromMap('m', {
        'name': 'Mensal',
        'priceCents': 30000,
        'scheduledPrice': {'priceCents': 34000, 'effectiveFrom': '2026-11-01'},
      });
      expect(centerPlanPriceOn(plan, '2026-10-31'), 30000);
      expect(centerPlanPriceOn(plan, '2026-11-01'), 34000);
      final c = centerBuildContract(
          plan,
          {
            'activation': 'on_confirmation',
            'pendingHoldHours': 'x',
            'extra': true,
          },
          '2026-10-20');
      final pol = c['policies']! as Map;
      expect(pol['activation'], 'on_confirmation');
      expect(pol['pendingHoldHours'], 48);
      expect(pol.containsKey('extra'), isFalse);
      expect(c['contractedAt'], '2026-10-20');
      expect(centerEnrollStatus({'activation': 'on_confirmation'}), 'active');
      expect(centerEnrollStatus(const {}), 'pending');
    });

    test('dinheiro no formato do portal', () {
      expect(centerBrl(32000), r'R$ 320');
      expect(centerBrl(16516), r'R$ 165,16');
      expect(centerBrl(386400000), r'R$ 3.864.000');
    });
  });

  group('turmas e planos da matrícula', () {
    test('lotada, alternativas do mesmo nível e roster', () {
      final full = _cls('a', cap: 8, taken: 8);
      expect(centerClassIsFull(full), isTrue);
      final alts = centerAlternativeClasses([
        full,
        _cls('b', taken: 6),
        _cls('c', taken: 8),
        _cls('d', level: 'Avançado'),
        _cls('e', program: 'volei'),
        _cls('f', status: 'draft'),
      ], full);
      expect(alts.map((c) => c.id), ['b']);
      expect(centerRosterAfter(['x'], 'y', 1), ['x', 'y']);
      expect(centerRosterAfter(['x', 'y'], 'y', 1), ['x', 'y']);
      expect(centerRosterAfter(['x', 'y'], 'x', -1), ['y']);
    });

    test('planos da modalidade, destaque primeiro', () {
      final plans = [
        CenterPlan.fromMap('a', {
          'priceCents': 300,
          'programIds': ['bt']
        }),
        CenterPlan.fromMap('b', {
          'priceCents': 100,
          'programIds': ['volei']
        }),
        CenterPlan.fromMap('c', {'priceCents': 200}),
        CenterPlan.fromMap('d', {'priceCents': 900, 'featured': true}),
        CenterPlan.fromMap('e', {'priceCents': 50, 'status': 'archived'}),
      ];
      expect(centerPlansForClass(plans, _cls('t')).map((p) => p.id), [
        'd',
        'c',
        'a',
      ]);
    });

    test('pagador do menor é o responsável', () {
      const s = CenterCoachStudent(
        id: 's',
        name: 'Lara',
        isMinor: true,
        guardianName: 'Paula',
      );
      expect(centerPayerName(s), 'Paula');
    });
  });

  group('equipe', () {
    test('convite: e-mail, já da equipe, já convidado', () {
      final members = [
        CenterTeamMember.fromMap(
            'u', {'email': 'ana@x.com', 'status': 'active'}),
      ];
      final invites = [
        CenterInvite.fromMap('i', {'email': 'bia@x.com', 'status': 'pending'}),
      ];
      String? err(String e) =>
          centerInviteError(email: e, members: members, invites: invites);
      expect(err('nope'), isNotNull);
      expect(err('ANA@x.com'), 'Essa pessoa já faz parte da equipe.');
      expect(err('bia@x.com'), contains('convite pendente'));
      expect(err('caio@x.com'), isNull);
    });

    test('admin só pelo owner; revogar segue as rules', () {
      expect(
          centerInvitableRoles(_m('center_owner')), contains('center_admin'));
      expect(centerInvitableRoles(_m('center_admin')), [
        'coach',
        'receptionist',
      ]);
      final admin = CenterTeamMember.fromMap('a', {'role': 'center_admin'});
      final coach = CenterTeamMember.fromMap('c', {'role': 'coach'});
      final owner = CenterTeamMember.fromMap('o', {'role': 'center_owner'});
      expect(centerCanRevoke(_m('center_owner'), admin), isTrue);
      expect(centerCanRevoke(_m('center_admin'), admin), isFalse);
      expect(centerCanRevoke(_m('center_admin'), coach), isTrue);
      expect(centerCanRevoke(_m('center_owner'), owner), isFalse);
      expect(centerCanRevoke(_m('coach'), coach), isFalse);
    });
  });

  group('local da aula (espelho de locations.spec.ts)', () {
    const pepe = CenterLocation(
      id: 'pepe',
      name: 'Arena Pepê',
      type: 'partner',
      windows: [
        CenterWindow(weekdays: [2, 4], start: '18:00', end: '22:00'),
      ],
    );
    const sede = CenterLocation(id: 'sede', name: 'Sede Barra');
    // 2026-10-22 é quinta.
    const s = CenterCoachSession(
      id: 's',
      classId: 'k',
      className: 'BT B',
      date: '2026-10-22',
      startTime: '19:00',
      coachUid: 't',
      courtId: 'q2',
      locationId: 'sede',
    );
    const prev = CenterCoachSession(
      id: 'p',
      classId: 'k2',
      className: 'BT A',
      date: '2026-10-22',
      startTime: '17:45',
      coachUid: 't',
      courtId: 'q1',
      locationId: 'sede',
    );

    test('janela, agenda e deslocamento', () {
      expect(centerWindowLabel(pepe.windows), 'Ter, Qui · 18:00–22:00');
      final checks = centerSessionMoveChecks(
        session: s,
        location: pepe,
        sameDay: [s, prev],
        travelBufferMin: 30,
      );
      expect(checks.map((c) => (c.label.split(' ').first, c.ok)), [
        ('Janela', true),
        ('Agenda', true),
        ('Deslocamento', false),
      ]);
    });

    test('quadra ocupada no local próprio', () {
      const moved = CenterCoachSession(
        id: 's',
        classId: 'k',
        className: 'BT B',
        date: '2026-10-22',
        startTime: '19:00',
        coachUid: 't',
        locationId: 'pepe',
      );
      const other = CenterCoachSession(
        id: 'p',
        classId: 'k2',
        className: 'BT A',
        date: '2026-10-22',
        startTime: '19:30',
        coachUid: 'x',
        courtId: 'q1',
        locationId: 'sede',
      );
      final checks = centerSessionMoveChecks(
        session: moved,
        location: sede,
        courtId: 'q1',
        courtName: 'Quadra 1',
        sameDay: [other],
        travelBufferMin: 30,
      );
      expect(
          checks.firstWhere((c) => c.label.startsWith('Quadra')).ok, isFalse);
      expect(centerPlaceLabel('', ''), 'Local a definir');
    });
  });

  group('assinatura', () {
    test('lê o doc e o que a gestão pode fazer', () {
      final s = CenterSubscription.fromMap('e1', {
        'studentId': 's',
        'status': 'past_due',
        'method': 'boleto',
        'priceCents': 32000,
      });
      expect(s.method, 'pix_manual');
      expect(s.statusLabel, 'Em atraso');
      expect(s.canScheduleCancel, isTrue);
      expect(s.canUndoCancel, isFalse);
      expect(
        CenterSubscription.fromMap('e', {'status': 'canceling'}).canUndoCancel,
        isTrue,
      );
      expect(centerCycleTitle('2026-11'), 'Nov 2026');
    });
  });

  group('modo Centro', () {
    test('abas por papel', () {
      expect(centerModeTabs(_m('center_owner')), [
        CenterModeTab.today,
        CenterModeTab.agenda,
        CenterModeTab.students,
        CenterModeTab.finance,
        CenterModeTab.more,
      ]);
      expect(centerModeTabs(_m('receptionist'))[3], CenterModeTab.checkin);
      expect(
        centerModeTabs(_m('receptionist', perms: ['view_finance']))[3],
        CenterModeTab.finance,
      );
      expect(centerModeTabs(_m('coach')), [
        CenterModeTab.agenda,
        CenterModeTab.classes,
        CenterModeTab.students,
        CenterModeTab.more,
      ]);
    });

    test('Mais mostra só o que o papel pode', () {
      List<String> keys(CenterMembership m) => [
            for (final g in centerMoreGroups(m))
              for (final i in g.items) i.key,
          ];
      expect(keys(_m('center_owner')), [
        'new-student',
        'enroll',
        'waitlist',
        'checkin',
        'messages',
        'team',
        'alerts',
        'classes',
      ]);
      expect(keys(_m('receptionist')), [
        'new-student',
        'enroll',
        'waitlist',
        'messages',
        'classes',
      ]);
      expect(keys(_m('coach')), ['messages']);
    });
  });

  group('chat do centro', () {
    Conversation conv(String id,
            {String kind = 'center',
            String center = 'c1',
            String staff = 'tm'}) =>
        Conversation.fromMap(id, {
          'kind': kind,
          'professorUid': staff,
          'athleteUid': 'lucas',
          'centerId': center,
          'studentId': 's1',
          'title': 'CT Maré Alta',
          'memberIds': [staff, 'lucas'],
          'memberNames': {staff: 'Thiago', 'lucas': 'Lucas Prado'},
        });

    test('o aluno vê de qual centro é; a equipe vê o aluno', () {
      final c = conv('t1');
      expect(c.isCenter, isTrue);
      expect(c.titleFor('lucas'), 'Thiago · CT Maré Alta');
      expect(c.titleFor('tm'), 'Lucas Prado');
    });

    test('caixa do centro: só as do centro e de quem está vendo', () {
      final list = centerConversations(
        [
          conv('a'),
          conv('b', center: 'c2'),
          conv('c', staff: 'outro'),
          conv('d', kind: 'direct'),
        ],
        centerId: 'c1',
        uid: 'tm',
      );
      expect(list.map((c) => c.id), ['a']);
    });
  });

  group('novo aluno', () {
    const existing = [
      CenterCoachStudent(
        id: 's1',
        name: 'Marina',
        uid: 'u1',
        email: 'marina@x.com',
      ),
    ];
    List<String> problems(CenterNewStudentInput i) =>
        centerNewStudentProblems(input: i, existing: existing);

    test('convite exige nome e e-mail válidos', () {
      expect(problems(const CenterNewStudentInput(name: 'Al')), [
        'Informe o nome completo.',
        'Informe um e-mail válido.',
      ]);
      expect(
        problems(
            const CenterNewStudentInput(name: 'Ana Reis', email: 'a@b.co')),
        isEmpty,
      );
    });

    test('e-mail e conta já usados no centro', () {
      expect(
        problems(
          const CenterNewStudentInput(name: 'Outra', email: ' MARINA@x.com '),
        ),
        ['Já existe aluno com esse e-mail neste centro.'],
      );
      expect(
        problems(const CenterNewStudentInput(uid: 'u1', name: 'Marina')),
        ['Essa conta já é aluno deste centro.'],
      );
      // Conta vinculada: contato é opcional.
      expect(
        problems(const CenterNewStudentInput(uid: 'u2', name: 'João')),
        isEmpty,
      );
    });

    test('menor exige nascimento e responsável completo', () {
      const base = CenterNewStudentInput(
        uid: 'u2',
        name: 'Leo',
        isMinor: true,
      );
      expect(problems(base), [
        'Informe a data de nascimento.',
        'Informe o nome do responsável.',
        'Informe o parentesco.',
        'Informe o e-mail do responsável.',
        'Informe o telefone do responsável.',
      ]);
      expect(
        problems(
          const CenterNewStudentInput(
            uid: 'u2',
            name: 'Leo',
            isMinor: true,
            birthDate: '2015-03-02',
            guardian: (
              name: 'Carla Dias',
              relation: 'Mãe',
              email: 'carla@x.com',
              phone: '(81) 99999-0000',
            ),
          ),
        ),
        isEmpty,
      );
    });

    test('doc igual ao do portal', () {
      final invited = centerNewStudentDoc(
        const CenterNewStudentInput(
          name: ' Bia Nunes ',
          email: ' Bia@Mail.com ',
          phone: ' 81 9999 ',
          guardian: (name: 'X', relation: 'Y', email: 'z@z.z', phone: '1'),
        ),
      );
      expect(invited['uid'], isNull);
      expect(invited['status'], 'invited');
      expect(invited['name'], 'Bia Nunes');
      expect(invited['email'], 'bia@mail.com');
      expect(invited['phone'], '81 9999');
      // Responsável só vai para menor.
      expect(invited['guardian'], isNull);
      expect(invited['makeupCredits'], 0);
      expect(invited['lgpdConsentAt'], isNull);
      expect(invited.containsKey('billingHold'), isFalse);
      expect(invited.containsKey('coachUids'), isFalse);

      final minor = centerNewStudentDoc(
        const CenterNewStudentInput(
          uid: 'u2',
          name: 'Leo',
          isMinor: true,
          birthDate: '2015-03-02',
          guardian: (
            name: 'Carla',
            relation: 'Mãe',
            email: 'CARLA@x.com',
            phone: '81',
          ),
        ),
      );
      expect(minor['status'], 'active');
      expect(minor['birthDate'], '2015-03-02');
      expect((minor['guardian'] as Map)['email'], 'carla@x.com');
      expect(
        centerNewStudentAuditDetail(
          const CenterNewStudentInput(uid: 'u2', name: 'Leo', isMinor: true),
        ),
        'Leo vinculado ao centro · menor',
      );
    });
  });
}
