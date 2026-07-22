import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_club_session.dart';

void main() {
  ArenaClubSession sessionFrom(
    Map<String, dynamic> data, {
    String id = 'club_c1_2026-07-24',
  }) =>
      ArenaClubSession.fromFirestore(_FakeDoc(id: id, data: data));

  ClubParticipant participantFrom(
    Map<String, dynamic> data, {
    String docId = 'ath1',
    String? sessionId = 's1',
  }) =>
      ClubParticipant.fromFirestore(
        _FakeDoc(
          id: docId,
          data: data,
          reference: _FakeParticipantDocRef(sessionId),
        ),
      );

  group('ArenaClubSession.fromFirestore', () {
    test('parseia mapa completo (trim, HH:mm, num→double, Timestamp)', () {
      final startAt = DateTime(2026, 7, 24, 15);
      final session = sessionFrom({
        'clubId': ' c1 ',
        'arenaId': 'arena1',
        'arenaName': ' Arena Beach ',
        'clubName': 'Clubinho da Sexta',
        'description': '  Jogo aberto  ',
        'date': '2026-07-24',
        'startTime': '15:00:00',
        'endTime': '19:00',
        'startAt': Timestamp.fromDate(startAt),
        'courtIds': ['q1', ' q2 ', '', 42],
        'courtNames': ['Quadra 1', 'Quadra 2'],
        'capacity': 12,
        'priceReais': 25, // int no Firestore
        'cancelWindowHours': 12,
        'confirmedCount': 5,
        'pendingCount': 3,
        'status': 'scheduled',
        'source': 'manual',
      });

      expect(session.id, 'club_c1_2026-07-24');
      expect(session.clubId, 'c1');
      expect(session.arenaId, 'arena1');
      expect(session.arenaName, 'Arena Beach');
      expect(session.clubName, 'Clubinho da Sexta');
      expect(session.description, 'Jogo aberto');
      expect(session.date, '2026-07-24');
      expect(session.startTime, '15:00'); // '15:00:00' vira HH:mm
      expect(session.endTime, '19:00');
      expect(session.startAt, startAt);
      expect(session.courtIds, ['q1', 'q2']);
      expect(session.courtNames, ['Quadra 1', 'Quadra 2']);
      expect(session.capacity, 12);
      expect(session.priceReais, 25.0);
      expect(session.cancelWindowHours, 12);
      expect(session.confirmedCount, 5);
      expect(session.pendingCount, 3);
      expect(session.status, 'scheduled');
      expect(session.isScheduled, isTrue);
      expect(session.isCanceled, isFalse);
      expect(session.source, 'manual');
    });

    test('mapa vazio cai nos defaults sem lançar', () {
      final session = sessionFrom({});

      expect(session.clubId, '');
      expect(session.arenaName, 'Arena');
      expect(session.clubName, 'Clubinho');
      expect(session.description, isNull);
      expect(session.date, '');
      expect(session.startTime, '');
      expect(session.startAt, isNull);
      expect(session.courtIds, isEmpty);
      expect(session.capacity, 0);
      expect(session.priceReais, 0);
      expect(session.cancelWindowHours, 0);
      expect(session.confirmedCount, 0);
      expect(session.pendingCount, 0);
      expect(session.status, '');
      expect(session.isScheduled, isFalse);
      expect(session.source, 'series');
      // Sem capacidade não há vaga — e sem startAt não há estorno automático.
      expect(session.spotsLeft, 0);
      expect(session.isFull, isTrue);
      expect(session.cancelDeadline, isNull);
      expect(session.canLeaveWithRefund(DateTime(2026, 7, 24)), isFalse);
    });

    test('tipos errados caem nos defaults sem lançar', () {
      final session = sessionFrom({
        'clubId': 9,
        'arenaId': true,
        'arenaName': 1.5,
        'clubName': ['x'],
        'description': 42,
        'date': 20260724,
        'startTime': 1500,
        'endTime': {'h': 19},
        'startAt': '2026-07-24T15:00:00',
        'courtIds': 'q1',
        'courtNames': 3,
        'capacity': 'doze',
        'priceReais': true,
        'cancelWindowHours': 'meia hora',
        'confirmedCount': [],
        'pendingCount': 'três',
        'status': 5,
        'source': 0,
      });

      expect(session.clubId, '');
      expect(session.arenaName, 'Arena');
      expect(session.clubName, 'Clubinho');
      expect(session.description, isNull);
      expect(session.date, '');
      expect(session.startTime, '');
      expect(session.endTime, '');
      expect(session.startAt, isNull);
      expect(session.courtIds, isEmpty);
      expect(session.courtNames, isEmpty);
      expect(session.capacity, 0);
      expect(session.priceReais, 0);
      expect(session.cancelWindowHours, 0);
      expect(session.confirmedCount, 0);
      expect(session.pendingCount, 0);
      expect(session.status, '');
      expect(session.source, 'series');
    });

    test('startAt aceita DateTime além de Timestamp', () {
      final start = DateTime(2026, 7, 24, 15);
      expect(sessionFrom({'startAt': start}).startAt, start);
    });
  });

  group('spotsLeft / isFull', () {
    ArenaClubSession counts({
      required int capacity,
      int confirmed = 0,
      int pending = 0,
    }) =>
        sessionFrom({
          'capacity': capacity,
          'confirmedCount': confirmed,
          'pendingCount': pending,
        });

    test('desconta confirmados e PIX pendentes (pendente segura vaga)', () {
      final session = counts(capacity: 12, confirmed: 5, pending: 3);
      expect(session.spotsLeft, 4);
      expect(session.isFull, isFalse);
    });

    test('cheia quando confirmados + pendentes atingem a capacidade', () {
      final session = counts(capacity: 4, confirmed: 2, pending: 2);
      expect(session.spotsLeft, 0);
      expect(session.isFull, isTrue);
    });

    test('nunca fica negativo em overbooking', () {
      final session = counts(capacity: 4, confirmed: 5, pending: 2);
      expect(session.spotsLeft, 0);
      expect(session.isFull, isTrue);
    });

    test('capacidade zero: sem vagas', () {
      expect(counts(capacity: 0).spotsLeft, 0);
      expect(counts(capacity: 0).isFull, isTrue);
    });
  });

  group('cancelDeadline / canLeaveWithRefund', () {
    final startAt = DateTime(2026, 7, 24, 15);

    ArenaClubSession windowed(int hours) => sessionFrom({
          'startAt': Timestamp.fromDate(startAt),
          'cancelWindowHours': hours,
        });

    test('deadline = startAt - cancelWindowHours', () {
      expect(windowed(12).cancelDeadline, DateTime(2026, 7, 24, 3));
      expect(windowed(24).cancelDeadline, DateTime(2026, 7, 23, 15));
    });

    test('antes do deadline pode sair com estorno', () {
      final session = windowed(12);
      expect(
        session.canLeaveWithRefund(DateTime(2026, 7, 24, 2, 59)),
        isTrue,
      );
    });

    test('exatamente no deadline ainda pode sair (limite inclusivo)', () {
      final session = windowed(12);
      expect(session.canLeaveWithRefund(DateTime(2026, 7, 24, 3)), isTrue);
    });

    test('depois do deadline não pode mais', () {
      final session = windowed(12);
      expect(
        session.canLeaveWithRefund(DateTime(2026, 7, 24, 3, 0, 1)),
        isFalse,
      );
      expect(session.canLeaveWithRefund(startAt), isFalse);
    });

    test('janela zero: pode sair até o horário de início', () {
      final session = windowed(0);
      expect(session.cancelDeadline, startAt);
      expect(
        session.canLeaveWithRefund(DateTime(2026, 7, 24, 14, 59)),
        isTrue,
      );
      expect(session.canLeaveWithRefund(startAt), isTrue);
      expect(
        session.canLeaveWithRefund(DateTime(2026, 7, 24, 15, 0, 1)),
        isFalse,
      );
    });

    test('sem startAt: nunca há estorno automático', () {
      final session = sessionFrom({'cancelWindowHours': 48});
      expect(session.cancelDeadline, isNull);
      expect(session.canLeaveWithRefund(DateTime(2020, 1, 1)), isFalse);
    });
  });

  group('dateOnly / labels de data e horário', () {
    test('date ISO vira meia-noite local e dd/MM', () {
      final session = sessionFrom({
        'date': '2026-07-24',
        'startTime': '15:00',
        'endTime': '19:00',
      });
      expect(session.dateOnly, DateTime(2026, 7, 24));
      expect(session.dateShortLabel, '24/07');
      expect(session.timeRangeLabel, '15:00 – 19:00');
    });

    test('date com sufixo de horário usa só os 10 primeiros caracteres', () {
      final session = sessionFrom({'date': '2026-07-24T15:00:00'});
      expect(session.dateOnly, DateTime(2026, 7, 24));
    });

    test('date inválida cai no dia do startAt', () {
      final session = sessionFrom({
        'date': '24/07/2026', // formato BR não é ISO
        'startAt': Timestamp.fromDate(DateTime(2026, 7, 24, 15)),
      });
      expect(session.dateOnly, DateTime(2026, 7, 24));
      expect(session.dateShortLabel, '24/07');
    });

    test('date inválida e sem startAt: dateOnly null, label devolve o cru',
        () {
      final session = sessionFrom({'date': 'amanhã'});
      expect(session.dateOnly, isNull);
      expect(session.dateShortLabel, 'amanhã');
    });
  });

  group('ClubParticipant.fromFirestore', () {
    test('parseia mapa completo e resolve sessionId pelo doc pai', () {
      final startAt = DateTime(2026, 7, 24, 15);
      final expiresAt = DateTime(2026, 7, 22, 12, 30);
      final joinedAt = DateTime(2026, 7, 22, 12);
      final participant = participantFrom(
        {
          'athleteId': 'ath1',
          'athleteName': ' João Silva ',
          'athletePhotoUrl': 'https://foto',
          'clubId': 'c1',
          'arenaId': 'arena1',
          'arenaName': 'Arena Beach',
          'clubName': 'Clubinho da Sexta',
          'date': '2026-07-24',
          'startTime': '15:00:00',
          'endTime': '19:00',
          'startAt': Timestamp.fromDate(startAt),
          'status': 'pending_payment',
          'amountReais': 25, // int no Firestore
          'refundStatus': 'none',
          'asaasPaymentId': 'pay_1',
          'pixCopyPaste': '000201...br.gov.bcb.pix',
          'paymentExpiresAt': Timestamp.fromDate(expiresAt),
          'joinedAt': Timestamp.fromDate(joinedAt),
        },
        sessionId: 'club_c1_2026-07-24',
      );

      expect(participant.sessionId, 'club_c1_2026-07-24');
      expect(participant.athleteId, 'ath1');
      expect(participant.athleteName, 'João Silva');
      expect(participant.athletePhotoUrl, 'https://foto');
      expect(participant.clubId, 'c1');
      expect(participant.arenaName, 'Arena Beach');
      expect(participant.clubName, 'Clubinho da Sexta');
      expect(participant.date, '2026-07-24');
      expect(participant.startTime, '15:00');
      expect(participant.endTime, '19:00');
      expect(participant.startAt, startAt);
      expect(participant.status, 'pending_payment');
      expect(participant.amountReais, 25.0);
      expect(participant.refundStatus, 'none');
      expect(participant.asaasPaymentId, 'pay_1');
      expect(participant.pixCopyPaste, '000201...br.gov.bcb.pix');
      expect(participant.paymentExpiresAt, expiresAt);
      expect(participant.joinedAt, joinedAt);
      expect(participant.confirmedAt, isNull);
    });

    test('mapa vazio: athleteId cai no id do doc e defaults seguros', () {
      final participant = participantFrom({}, docId: 'uid42');

      expect(participant.sessionId, 's1');
      expect(participant.athleteId, 'uid42');
      expect(participant.athleteName, 'Atleta');
      expect(participant.athletePhotoUrl, isNull);
      expect(participant.arenaName, 'Arena');
      expect(participant.clubName, 'Clubinho');
      expect(participant.status, '');
      expect(participant.amountReais, 0);
      expect(participant.refundStatus, 'none');
      expect(participant.isActive, isFalse);
      expect(participant.wasRefunded, isFalse);
    });

    test('sem doc pai o sessionId fica vazio (não lança)', () {
      final participant = participantFrom({}, sessionId: null);
      expect(participant.sessionId, '');
    });

    test('tipos errados caem nos defaults sem lançar', () {
      final participant = participantFrom({
        'athleteId': 7,
        'athleteName': true,
        'athletePhotoUrl': 1,
        'clubId': [],
        'arenaName': 2.5,
        'clubName': {},
        'date': 20260724,
        'startTime': 1500,
        'startAt': '2026-07-24',
        'status': 9,
        'amountReais': 'vinte e cinco',
        'refundStatus': 0,
        'asaasPaymentId': 1,
        'pixCopyPaste': 2,
        'paymentExpiresAt': 'amanhã',
      }, docId: 'uid42');

      expect(participant.athleteId, 'uid42');
      expect(participant.athleteName, 'Atleta');
      expect(participant.athletePhotoUrl, isNull);
      expect(participant.clubId, '');
      expect(participant.arenaName, 'Arena');
      expect(participant.clubName, 'Clubinho');
      expect(participant.date, '');
      expect(participant.startTime, '');
      expect(participant.startAt, isNull);
      expect(participant.status, '');
      expect(participant.amountReais, 0);
      expect(participant.refundStatus, 'none');
      expect(participant.asaasPaymentId, isNull);
      expect(participant.pixCopyPaste, isNull);
      expect(participant.paymentExpiresAt, isNull);
    });
  });

  group('ClubParticipant.statusLabel (PT)', () {
    String labelOf(String status) =>
        participantFrom({'status': status}).statusLabel;

    test('todos os status conhecidos têm label em português', () {
      expect(labelOf('pending_payment'), 'Aguardando PIX');
      expect(labelOf('confirmed'), 'Confirmado');
      expect(labelOf('expired'), 'PIX expirado');
      expect(labelOf('canceled'), 'Cancelado');
      expect(labelOf('canceled_refunded'), 'Saiu (estornado)');
      expect(
        labelOf('canceled_by_arena_refunded'),
        'Estornado pela arena',
      );
    });

    test('status desconhecido passa cru (sem quebrar a UI)', () {
      expect(labelOf('em_analise'), 'em_analise');
    });
  });

  group('ClubParticipant flags', () {
    ClubParticipant withStatus(String status) =>
        participantFrom({'status': status});

    test('confirmado e PIX pendente seguram vaga (isActive)', () {
      expect(withStatus('confirmed').isActive, isTrue);
      expect(withStatus('confirmed').isConfirmed, isTrue);
      expect(withStatus('pending_payment').isActive, isTrue);
      expect(withStatus('pending_payment').isPendingPayment, isTrue);
    });

    test('expirado/cancelado/estornado ficam fora da lista', () {
      expect(withStatus('expired').isActive, isFalse);
      expect(withStatus('canceled').isActive, isFalse);
      expect(withStatus('canceled_refunded').isActive, isFalse);
      expect(withStatus('canceled_by_arena_refunded').isActive, isFalse);
    });

    test('wasRefunded só para os dois status de estorno', () {
      expect(withStatus('canceled_refunded').wasRefunded, isTrue);
      expect(withStatus('canceled_by_arena_refunded').wasRefunded, isTrue);
      expect(withStatus('canceled').wasRefunded, isFalse);
      expect(withStatus('confirmed').wasRefunded, isFalse);
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({
    required this.id,
    required Map<String, dynamic> data,
    DocumentReference<Map<String, dynamic>>? reference,
  })  : _fields = data,
        _reference = reference;

  @override
  final String id;
  final Map<String, dynamic> _fields;
  final DocumentReference<Map<String, dynamic>>? _reference;

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference =>
      _reference ?? (throw UnimplementedError());

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}

/// Cadeia mínima `doc → parent (subcoleção) → parent (doc da sessão)` para o
/// `sessionId` resolvido em `ClubParticipant.fromFirestore`.
class _FakeParticipantDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeParticipantDocRef(this._sessionDocId);

  final String? _sessionDocId;

  @override
  CollectionReference<Map<String, dynamic>> get parent =>
      _FakeParticipantsCollection(_sessionDocId);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeParticipantsCollection
    implements CollectionReference<Map<String, dynamic>> {
  _FakeParticipantsCollection(this._sessionDocId);

  final String? _sessionDocId;

  @override
  DocumentReference<Map<String, dynamic>>? get parent {
    final id = _sessionDocId;
    return id == null ? null : _FakeSessionDocRef(id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeSessionDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeSessionDocRef(this.id);

  @override
  final String id;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
