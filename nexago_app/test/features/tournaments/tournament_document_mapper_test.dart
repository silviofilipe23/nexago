import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  test('fromMap maps categories and pricing', () {
    final t = TournamentDocumentMapper.fromMap('t1', {
      'name': 'Beach Open',
      'city': 'Salvador',
      'location': 'Arena Sul',
      'dateLabel': '1 mai',
      'startAt': DateTime(2026, 5, 1),
      'capacity': 32,
      'enrolledCount': 20,
      'categories': [
        {
          'categoryName': 'Misto A',
          'entryFee': 180,
          'spotsLeft': 12,
          'spotsTotal': 32,
        },
      ],
    });

    expect(t.id, 't1');
    expect(t.name, 'Beach Open');
    expect(t.spotsLeft, 12);
    expect(t.categoryOffers, hasLength(1));
    expect(t.categoryOffers.first.entryFee, 180);
    expect(t.priceValue, 180);
  });

  test('fromMap maps Completed operational status', () {
    final t = TournamentDocumentMapper.fromMap('t-done', {
      'name': 'Copa',
      'status': 'Completed',
      'capacity': 16,
      'enrolledCount': 16,
    });
    expect(t.status, TournamentListingStatus.completed);
  });

  test('fromMap reads cover image url', () {
    final t = TournamentDocumentMapper.fromMap('t2', {
      'name': 'Open',
      'coverUrl': 'https://cdn.example.com/cover.jpg',
      'capacity': 8,
      'enrolledCount': 0,
    });
    expect(t.imageUrl, 'https://cdn.example.com/cover.jpg');
  });

  test('fromMap defaults when minimal doc', () {
    final t = TournamentDocumentMapper.fromMap('x', {
      'name': 'Torneio X',
      'capacity': 16,
      'enrolledCount': 4,
      'listingStatus': 'open',
    });
    expect(t.name, 'Torneio X');
    expect(t.status, isNot(TournamentListingStatus.ended));
  });

  test('detailFromMap maps regulations and category fields', () {
    final d = TournamentDocumentMapper.detailFromMap('d1', {
      'name': 'Etapa Garden',
      'locationName': 'Arena Garden',
      'city': 'Goiânia',
      'startDate': DateTime(2026, 4, 21),
      'dateLabel': '21/04',
      'regulationsText': 'Texto do regulamento.',
      'managerId': 'org-1',
      'leagueStageOrder': 2,
      'prizes': [
        {'position': '1', 'value': 5000},
      ],
      'categories': [
        {
          'categoryName': 'Misto',
          'entryFee': 90,
          'maxTeams': 16,
          'spotsLeft': 4,
          'bracketFormat': 'Pool Play + SE',
          'registrationClosed': false,
        },
      ],
    });

    expect(d.regulationsText, 'Texto do regulamento.');
    expect(d.location, 'Arena Garden');
    expect(d.leagueStageOrder, 2);
    expect(d.tournamentPrizes, hasLength(1));
    expect(d.categoryOffers.first.bracketFormat, 'Pool Play + SE');
    expect(d.categoryOffers.first.maxTeams, 16);
    expect(d.categoryOffers.first.spotsTotal, 16);
  });

  test('detailFromMap uses category id when present in Firestore', () {
    const categoryUuid = '51e5b0b4-7de7-4e39-a883-e83325a2391e';
    final d = TournamentDocumentMapper.detailFromMap('t-open', {
      'name': 'nexaGO',
      'capacity': 8,
      'enrolledCount': 0,
      'categories': [
        {
          'id': categoryUuid,
          'categoryName': 'Open',
          'entryFee': 0,
          'maxTeams': 8,
          'bracketFormat': 'Double Elimination',
        },
      ],
    });

    expect(d.categoryOffers, hasLength(1));
    expect(d.categoryOffers.first.id, categoryUuid);
    expect(d.categoryOffers.first.name, 'Open');
  });

  test('detailFromMap parses category prizes with string values', () {
    final d = TournamentDocumentMapper.detailFromMap('d2', {
      'name': 'Open',
      'capacity': 32,
      'enrolledCount': 0,
      'categories': [
        {
          'categoryName': 'Masculino C',
          'entryFee': 90,
          'maxTeams': 30,
          'genderType': 'Masculino',
          'bracketFormat': 'Pool Play + SE',
          'prizes': [
            {'position': '1', 'value': '2000'},
            {'position': '2', 'value': '2000.00'},
            {'position': '3', 'value': 'R\$ 500,00'},
          ],
        },
      ],
    });

    final prizes = d.categoryOffers.first.prizes;
    expect(prizes, hasLength(3));
    expect(prizes[0].value, 2000);
    expect(prizes[1].value, 2000);
    expect(prizes[2].value, 500);
  });
}
