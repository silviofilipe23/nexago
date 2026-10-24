import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_leads.dart';

// Sáb 24/10/2026 10:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 24, 13);

CenterLead _lead(
  String id, {
  String stage = 'new',
  DateTime? createdAt,
  DateTime? updatedAt,
  Map<String, Object?> extra = const {},
}) =>
    CenterLead.fromMap(id, {
      'name': 'Pessoa $id',
      'phone': '(21) 99604-1182',
      'source': 'instagram',
      'interest': {'programId': 'bt', 'programName': 'Beach Tennis'},
      'stage': stage,
      'createdAt': createdAt ?? _now.subtract(const Duration(minutes: 18)),
      'updatedAt': updatedAt ?? createdAt ?? _now,
      ...extra,
    });

const _cls = CenterCoachClass(
  id: 'k1',
  name: 'BT Iniciante A',
  programId: 'bt',
  coachName: 'Thiago Mendes',
  capacity: 4,
  rosterStudentIds: ['s1', 's2'],
);

CenterCoachSession _session(
  String id, {
  String date = '2026-10-26',
  String start = '07:00',
  String classId = 'k1',
  String status = 'scheduled',
  Map<String, Object?> trials = const {},
}) =>
    CenterCoachSession.fromMap(id, {
      'classId': classId,
      'className': 'BT Iniciante A',
      'date': date,
      'startTime': start,
      'coachName': 'Thiago Mendes',
      'status': status,
      'trials': trials,
    });

void main() {
  group('CenterLead.fromMap', () {
    test('tolera doc vazio', () {
      final l = CenterLead.fromMap('x', const {});
      expect(l.name, 'Interessado');
      expect(l.stage, 'new');
      expect(l.source, 'other');
      expect(l.trial, isNull);
      expect(l.coachFeedback, isNull);
      expect(l.history, isEmpty);
      expect(l.trialsCount, 0);
    });

    test('lê interesse, experimental, avaliação e histórico', () {
      final l = CenterLead.fromMap('a', {
        'name': 'Mariana Couto',
        'interest': {
          'programId': 'bt',
          'programName': 'Beach Tennis',
          'experience': 'plays',
          'period': 'morning',
          'goal': 'competir',
        },
        'stage': 'attended',
        'lostReason': null,
        'trial': {
          'bookingId': 'b1',
          'sessionId': 's1',
          'date': '2026-10-24',
          'startTime': '07:00',
          'status': 'confirmed',
          'attendance': 'attended',
        },
        'coachFeedback': {'level': 'intermediate', 'note': 'boa base'},
        'history': [
          {'kind': 'created', 'byName': 'Camila', 'at': _now},
          'lixo',
        ],
        'trialsCount': 1,
      });
      expect(l.firstName, 'Mariana');
      expect(l.experience, 'plays');
      expect(l.period, 'morning');
      expect(l.trial!.attendance, 'attended');
      expect(l.trial!.className, 'Turma');
      expect(l.coachFeedback!.level, 'intermediate');
      expect(l.history.single.kind, 'created');
      expect(l.trialKey, 'l_a');
      expect(l.trialsCount, 1);
    });
  });

  test('CenterLeadSettings: padrões e limites do contrato', () {
    const d = CenterLeadSettings();
    final none = CenterLeadSettings.fromMap(null);
    expect(
      (none.maxTrialsPerPerson, none.maxTrialsPerSession, none.onlyWithSpots),
      (d.maxTrialsPerPerson, 2, true),
    );
    expect(none.alertHours, 2);
    final s = CenterLeadSettings.fromMap({
      'maxTrialsPerSession': 0, // fora do intervalo → padrão
      'onlyWithSpots': false,
      'alertHours': 24,
      'coachReview': 'optional',
      'offerDays': 0,
    });
    expect(s.maxTrialsPerSession, 2);
    expect(s.onlyWithSpots, isFalse);
    expect(s.alertHours, 24);
    expect(s.coachReview, 'optional');
    expect(s.offerDays, 0);
  });

  group('C6 · quadro', () {
    test('agrupa por etapa e marca o novo atrasado', () {
      final board = buildCenterLeadsBoard(
        now: _now,
        settings: const CenterLeadSettings(),
        leads: [
          _lead('fresh'),
          _lead('late', createdAt: _now.subtract(const Duration(hours: 3))),
          _lead('talk', stage: 'contacted'),
          _lead(
            'today',
            stage: 'scheduled',
            extra: {
              'trial': {
                'date': '2026-10-24',
                'startTime': '19:00',
                'className': 'BT Iniciante A',
                'coachName': 'Thiago Mendes',
                'status': 'confirmed',
              },
            },
          ),
          _lead(
            'later',
            stage: 'scheduled',
            extra: {
              'trial': {
                'date': '2026-10-26',
                'startTime': '07:00',
                'className': 'BT Iniciante A',
              },
            },
          ),
          _lead(
            'did',
            stage: 'attended',
            extra: {
              'coachFeedback': {'level': 'intermediate'},
              'proposalUntil': '2026-10-31',
            },
          ),
          _lead('won', stage: 'won'),
          _lead('lost', stage: 'lost'),
          _lead(
            'oldwon',
            stage: 'won',
            createdAt: DateTime.utc(2026, 9, 2, 15),
          ),
        ],
      );
      // Mais antigo primeiro: quem espera há mais tempo.
      expect(board.respondNow.map((r) => r.lead.id), ['late', 'fresh']);
      expect(board.respondNow.first.late, isTrue);
      expect(board.respondNow.last.late, isFalse);
      expect(
        board.respondNow.last.line,
        'Instagram · Beach Tennis · há 18 min',
      );
      expect(board.contacted.single.lead.id, 'talk');
      expect(board.trialToday.single.lead.id, 'today');
      expect(
        board.trialToday.single.line,
        'BT Iniciante A · 19:00 · Thiago · Confirmada',
      );
      expect(
          board.trialsScheduled.single.line,
          'Seg 26/10 · 07:00 · '
          'BT Iniciante A');
      expect(
        board.attended.single.line,
        'Avaliado · intermediário · Proposta até 31/10',
      );
      expect(board.newCount, 2);
      expect(board.scheduledCount, 2);
      // Mês corrente: 1 matriculado ÷ (1 + 1 perdido + 1 fez experimental).
      expect(board.conversionPercent, 33);
      expect(board.monthWon, 1);
      expect(board.monthLeads, 8);
      expect(
        centerLeadsSubtitle(board, _now),
        'OUT · 8 INTERESSADOS · 1 MATRICULADO',
      );
    });

    test('sem base no mês, conversão é nula', () {
      final b = buildCenterLeadsBoard(
        now: _now,
        settings: const CenterLeadSettings(),
        leads: [_lead('a')],
      );
      expect(b.conversionPercent, isNull);
      expect(b.isEmpty, isFalse);
      expect(
        buildCenterLeadsBoard(
          now: _now,
          settings: const CenterLeadSettings(),
          leads: const [],
        ).isEmpty,
        isTrue,
      );
    });

    test('alertHours de 24h não marca quem chegou há 3h', () {
      final l = _lead('x', createdAt: _now.subtract(const Duration(hours: 3)));
      expect(centerLeadIsLate(l, _now, 2), isTrue);
      expect(centerLeadIsLate(l, _now, 24), isFalse);
    });
  });

  group('C7 · cadastro', () {
    test('telefone: dígitos sem DDI e validação BR', () {
      expect(centerLeadPhoneDigits('(21) 99604-1182'), '21996041182');
      expect(centerLeadPhoneDigits('+55 21 99604 1182'), '21996041182');
      expect(centerLeadPhoneValid('(21) 3333-4444'), isTrue);
      expect(centerLeadPhoneValid('99604-1182'), isFalse);
      expect(centerLeadPhoneValid('(01) 99604-1182'), isFalse);
    });

    test('problemas: nome e WhatsApp obrigatórios', () {
      expect(
        centerNewLeadProblems(const CenterNewLeadInput(name: '', phone: '')),
        hasLength(2),
      );
      expect(
        centerNewLeadProblems(
          const CenterNewLeadInput(name: 'Bia', phone: '21996041182'),
        ),
        isEmpty,
      );
    });

    test('doc novo: etapa new, sem campos do servidor', () {
      final doc = centerNewLeadFields(
        const CenterNewLeadInput(
          name: ' Beatriz Lemos ',
          phone: '(21) 99604-1182',
          programId: 'bt',
          programName: 'Beach Tennis',
          experience: 'plays',
          period: 'morning',
        ),
        actorUid: 'cn',
        actorName: 'Camila',
      );
      expect(doc['name'], 'Beatriz Lemos');
      expect(doc['phoneDigits'], '21996041182');
      expect(doc['source'], 'desk');
      expect(doc['stage'], 'new');
      expect(doc['ownerUid'], 'cn');
      expect((doc['interest'] as Map)['period'], 'morning');
      expect(doc.containsKey('trial'), isFalse);
      expect(doc.containsKey('coachFeedback'), isFalse);
      expect(doc.containsKey('trialsCount'), isFalse);
    });
  });

  group('agendar experimental', () {
    test('ocupação, limite de experimentais e vaga', () {
      final slots = centerTrialSlots(
        sessions: [
          _session('free'),
          _session(
            'limit',
            date: '2026-10-27',
            trials: {
              'u1': {'name': 'A', 'status': 'confirmed'},
              'l_x': {'name': 'B', 'status': 'confirmed'},
            },
          ),
          _session('past', date: '2026-10-24', start: '07:00'),
          _session('cancel', status: 'cancelled'),
          _session('far', date: '2026-11-20'),
        ],
        classes: const [_cls],
        settings: const CenterLeadSettings(),
        todayKey: '2026-10-24',
        nowHm: '10:00',
        toKey: '2026-11-07',
      );
      expect(slots.map((s) => s.session.id), ['free', 'limit']);
      expect(slots.first.spotsLabel, '2 vagas · 0 experimentais');
      expect(slots.first.enabled, isTrue);
      expect(slots.last.blockedReason, 'Limite de experimentais atingido');
    });

    test('sem vaga bloqueia só com onlyWithSpots; já agendada bloqueia', () {
      final full = _session(
        'full',
        trials: {
          'l_me': {'name': 'Eu', 'status': 'confirmed'},
        },
      );
      const cls = CenterCoachClass(
        id: 'k1',
        name: 'BT',
        programId: 'bt',
        capacity: 3,
        rosterStudentIds: ['a', 'b'],
      );
      List<CenterTrialSlot> run(CenterLeadSettings st, {String? key}) =>
          centerTrialSlots(
            sessions: [full],
            classes: const [cls],
            settings: st,
            todayKey: '2026-10-24',
            nowHm: '10:00',
            toKey: '2026-11-07',
            leadTrialKey: key,
          );
      expect(run(const CenterLeadSettings()).single.blockedReason, 'Sem vaga');
      expect(
        run(const CenterLeadSettings(onlyWithSpots: false)).single.enabled,
        isTrue,
      );
      expect(
        run(const CenterLeadSettings(), key: 'l_me').single.blockedReason,
        'Já agendada nesta aula',
      );
    });

    test('filtro por modalidade e período', () {
      List<String> ids({String programId = '', String period = ''}) =>
          centerTrialSlots(
            sessions: [
              _session('m'),
              _session('n', start: '19:00'),
              _session('v', classId: 'k2'),
            ],
            classes: const [
              _cls,
              CenterCoachClass(id: 'k2', name: 'Vôlei', programId: 'volei'),
            ],
            settings: const CenterLeadSettings(),
            todayKey: '2026-10-24',
            nowHm: '10:00',
            toKey: '2026-11-07',
            programId: programId,
            period: period,
          ).map((s) => s.session.id).toList();
      expect(ids(), ['m', 'v', 'n']);
      expect(ids(programId: 'bt'), ['m', 'n']);
      expect(ids(programId: 'bt', period: 'night'), ['n']);
    });

    test('mensagem e link do WhatsApp', () {
      final msg = centerLeadTrialMessage(
        leadName: 'Mariana Couto',
        centerName: 'CT Maré Alta',
        dateKey: '2026-10-26',
        startTime: '07:00',
        className: 'BT Iniciante A',
        coachName: 'Thiago',
      );
      expect(
        msg,
        'Olá, Mariana! Sua aula experimental no CT Maré Alta ficou para '
        'seg 26/10 às 07:00 · BT Iniciante A com Thiago.',
      );
      final uri = centerLeadWhatsAppUri('(21) 99604-1182', text: msg)!;
      expect(uri.host, 'wa.me');
      expect(uri.path, '/5521996041182');
      expect(uri.queryParameters['text'], msg);
      expect(centerLeadWhatsAppUri('123'), isNull);
      expect(
          centerLeadPhoneUri('(21) 99604-1182').toString(), 'tel:21996041182');
    });
  });

  group('C8 · avaliação', () {
    test('espelho da aula lê os campos do interessado', () {
      final s = _session(
        'x',
        trials: {
          'l_a': {
            'bookingId': 'x_l_a',
            'name': 'Gustavo Reis',
            'status': 'confirmed',
            'leadId': 'a',
            'experience': 'plays',
            'goal': 'quer competir',
            'attendance': 'attended',
            'evaluated': true,
          },
          'u1': {'name': 'App', 'status': 'pending'},
        },
      );
      final t = s.trials.firstWhere((t) => t.key == 'l_a');
      expect(t.leadId, 'a');
      expect(t.evaluated, isTrue);
      expect(t.attendance, 'attended');
      expect(centerTrialProfileLine(t), 'Já joga · quer competir');
      final app = s.trials.firstWhere((t) => t.key == 'u1');
      expect((app.evaluated, app.attendance, app.leadId), (false, null, ''));
    });

    test('turmas sugeridas: mesmo programa, senão todas as ativas', () {
      const classes = [
        CenterCoachClass(id: 'b', name: 'BT B', programId: 'bt'),
        CenterCoachClass(id: 'a', name: 'BT A', programId: 'bt'),
        CenterCoachClass(id: 'v', name: 'Vôlei', programId: 'volei'),
        CenterCoachClass(
          id: 'x',
          name: 'BT Fechada',
          programId: 'bt',
          status: 'closed',
        ),
      ];
      expect(
        centerTrialSuggestedClasses(classes: classes, programId: 'bt')
            .map((c) => c.id),
        ['a', 'b'],
      );
      expect(
        centerTrialSuggestedClasses(classes: classes, programId: 'fut')
            .map((c) => c.id),
        ['a', 'b', 'v'],
      );
      expect(
        centerClassSpotsLabel(
          const CenterCoachClass(
            id: 'k',
            name: 'k',
            capacity: 6,
            seatsTaken: 5,
          ),
        ),
        '1 vaga',
      );
      expect(
        centerClassSpotsLabel(const CenterCoachClass(id: 'k', name: 'k')),
        isNull,
      );
    });
  });
}
