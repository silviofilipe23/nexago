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
}
