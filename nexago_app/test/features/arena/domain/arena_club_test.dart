import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_club.dart';

void main() {
  ArenaClub clubFrom(Map<String, dynamic> data, {String id = 'club1'}) =>
      ArenaClub.fromFirestore(_FakeDoc(id: id, data: data));

  group('ArenaClub.fromFirestore', () {
    test('parseia mapa completo (trim, normalização de horário, num→double)',
        () {
      final createdAt = DateTime(2026, 7, 1, 10);
      final club = clubFrom({
        'arenaId': ' arena1 ',
        'arenaName': ' Arena Beach ',
        'name': 'Clubinho da Sexta',
        'description': '  Jogo aberto semanal  ',
        'weekday': 5,
        'startTime': '15:00:00',
        'endTime': '19:00',
        'courtIds': ['q1', ' q2 ', '', 42],
        'courtNames': ['Quadra 1', 'Quadra 2'],
        'capacity': 12,
        'priceReais': 25, // int no Firestore
        'cancelWindowHours': 12,
        'status': 'active',
        'startDate': '2026-07-03',
        'endDate': '2026-12-18',
        'skippedDates': ['2026-07-10'],
        'createdAt': Timestamp.fromDate(createdAt),
      });

      expect(club.id, 'club1');
      expect(club.arenaId, 'arena1');
      expect(club.arenaName, 'Arena Beach');
      expect(club.name, 'Clubinho da Sexta');
      expect(club.description, 'Jogo aberto semanal');
      expect(club.weekday, 5);
      expect(club.isWeekly, isTrue);
      expect(club.startTime, '15:00'); // '15:00:00' normalizado para HH:mm
      expect(club.endTime, '19:00');
      expect(club.courtIds, ['q1', 'q2']); // vazio e não-string descartados
      expect(club.courtNames, ['Quadra 1', 'Quadra 2']);
      expect(club.capacity, 12);
      expect(club.priceReais, 25.0);
      expect(club.cancelWindowHours, 12);
      expect(club.status, 'active');
      expect(club.isActive, isTrue);
      expect(club.startDate, '2026-07-03');
      expect(club.endDate, '2026-12-18');
      expect(club.skippedDates, ['2026-07-10']);
      expect(club.createdAt, createdAt);
    });

    test('mapa vazio cai nos defaults sem lançar', () {
      final club = clubFrom({});

      expect(club.arenaId, '');
      expect(club.arenaName, 'Arena');
      expect(club.name, 'Clubinho');
      expect(club.description, isNull);
      expect(club.weekday, isNull);
      expect(club.isWeekly, isFalse);
      expect(club.startTime, '');
      expect(club.endTime, '');
      expect(club.courtIds, isEmpty);
      expect(club.courtNames, isEmpty);
      expect(club.capacity, 0);
      expect(club.priceReais, 0);
      expect(club.cancelWindowHours, 0);
      expect(club.status, '');
      expect(club.isActive, isFalse);
      expect(club.startDate, '');
      expect(club.endDate, isNull);
      expect(club.skippedDates, isEmpty);
      expect(club.createdAt, isNull);
    });

    test('tipos errados caem nos defaults sem lançar', () {
      final club = clubFrom({
        'arenaId': 10,
        'arenaName': true,
        'name': 42,
        'description': 7,
        'weekday': 'sexta',
        'startTime': 1500,
        'endTime': null,
        'courtIds': 'q1',
        'courtNames': {'a': 1},
        'capacity': 'doze',
        'priceReais': 'vinte e cinco',
        'cancelWindowHours': false,
        'status': 5,
        'startDate': 20260703,
        'endDate': 99,
        'skippedDates': 'x',
        'createdAt': '2026-07-01',
      });

      expect(club.arenaId, '');
      expect(club.arenaName, 'Arena');
      expect(club.name, 'Clubinho');
      expect(club.description, isNull);
      expect(club.weekday, isNull);
      expect(club.startTime, '');
      expect(club.endTime, '');
      expect(club.courtIds, isEmpty);
      expect(club.courtNames, isEmpty);
      expect(club.capacity, 0);
      expect(club.priceReais, 0);
      expect(club.cancelWindowHours, 0);
      expect(club.status, '');
      expect(club.startDate, '');
      expect(club.endDate, isNull);
      expect(club.skippedDates, isEmpty);
      expect(club.createdAt, isNull);
    });

    test('weekday fora de 1..7 vira null (sessões avulsas)', () {
      expect(clubFrom({'weekday': 0}).weekday, isNull);
      expect(clubFrom({'weekday': 8}).weekday, isNull);
      expect(clubFrom({'weekday': -3}).weekday, isNull);
      expect(clubFrom({'weekday': 1}).weekday, 1);
      expect(clubFrom({'weekday': 7}).weekday, 7);
    });
  });

  group('recurrenceLabel', () {
    ArenaClub weekly(int? weekday) => clubFrom({
          if (weekday != null) 'weekday': weekday,
          'startTime': '15:00',
          'endTime': '19:00',
        });

    test('semanal: "Toda sexta · 15:00–19:00"', () {
      expect(weekly(5).recurrenceLabel, 'Toda sexta · 15:00–19:00');
    });

    test('sem weekday: "Sessões avulsas · 15:00–19:00"', () {
      expect(weekly(null).recurrenceLabel, 'Sessões avulsas · 15:00–19:00');
    });

    test('todos os dias da semana em PT (ISO 1=segunda … 7=domingo)', () {
      const expected = {
        1: 'segunda',
        2: 'terça',
        3: 'quarta',
        4: 'quinta',
        5: 'sexta',
        6: 'sábado',
        7: 'domingo',
      };
      for (final entry in expected.entries) {
        expect(weekly(entry.key).weekdayLabel, entry.value);
        expect(
          weekly(entry.key).recurrenceLabel,
          'Toda ${entry.value} · 15:00–19:00',
        );
      }
    });

    test('weekdayLabel de clube avulso é "avulso"', () {
      expect(weekly(null).weekdayLabel, 'avulso');
    });
  });

  group('statusLabel e flags de status', () {
    test('labels PT por status', () {
      expect(clubFrom({'status': 'active'}).statusLabel, 'Ativo');
      expect(clubFrom({'status': 'paused'}).statusLabel, 'Pausado');
      expect(clubFrom({'status': 'archived'}).statusLabel, 'Arquivado');
    });

    test('status desconhecido passa cru (sem quebrar a UI)', () {
      expect(clubFrom({'status': 'draft'}).statusLabel, 'draft');
    });

    test('flags isActive/isPaused/isArchived são mutuamente exclusivas', () {
      final paused = clubFrom({'status': 'paused'});
      expect(paused.isPaused, isTrue);
      expect(paused.isActive, isFalse);
      expect(paused.isArchived, isFalse);

      final archived = clubFrom({'status': 'archived'});
      expect(archived.isArchived, isTrue);
      expect(archived.isActive, isFalse);
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({required this.id, required Map<String, dynamic> data})
      : _fields = data;

  @override
  final String id;
  final Map<String, dynamic> _fields;

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference =>
      throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}
