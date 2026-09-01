import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_payment_mode.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

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

  test('detailFromMap maps paymentMode directWithOrganizer', () {
    final d = TournamentDocumentMapper.detailFromMap('direct', {
      'name': 'Copa',
      'capacity': 16,
      'enrolledCount': 0,
      'paymentMode': 'directWithOrganizer',
    });

    expect(d.paymentMode, TournamentPaymentMode.directWithOrganizer);
  });

  test('detailFromMap defaults paymentMode to appPixCard', () {
    final d = TournamentDocumentMapper.detailFromMap('pix', {
      'name': 'Copa',
      'capacity': 16,
      'enrolledCount': 0,
    });

    expect(d.paymentMode, TournamentPaymentMode.appPixCard);
  });

  test('detailFromMap parses team category (trio) with composition', () {
    final d = TournamentDocumentMapper.detailFromMap('team-cat', {
      'name': 'Copa dos Trios',
      'capacity': 8,
      'enrolledCount': 0,
      'categories': [
        {
          'id': 'cat-trio',
          'categoryName': 'Trio Misto',
          'entryFee': 210,
          'maxTeams': 8,
          'genderType': 'mixed',
          'disputeType': 'trio',
          'teamSize': 3,
          'genderMode': 'composition',
          'genderComposition': {'men': 2, 'women': 1},
        },
      ],
    });

    final offer = d.categoryOffers.single;
    expect(offer.isTeamCategory, isTrue);
    expect(offer.teamSize, 3);
    expect(offer.rosterSize, 3);
    expect(offer.formatLabel, 'Trio');
    expect(offer.unitLabel, 'equipes');
    expect(offer.genderFree, isFalse);
    expect(offer.genderCompositionMen, 2);
    expect(offer.genderCompositionWomen, 1);
    expect(offer.genderDetail, '2H + 1M');
  });

  test('detailFromMap parses team category genderMode free', () {
    final d = TournamentDocumentMapper.detailFromMap('team-free', {
      'name': 'Copa Livre',
      'capacity': 6,
      'enrolledCount': 0,
      'categories': [
        {
          'id': 'cat-quarteto',
          'categoryName': 'Quarteto Livre',
          'entryFee': 280,
          'maxTeams': 6,
          'genderType': 'mixed',
          'disputeType': 'quarteto',
          'teamSize': 4,
          'genderMode': 'free',
        },
      ],
    });

    final offer = d.categoryOffers.single;
    expect(offer.isTeamCategory, isTrue);
    expect(offer.teamSize, 4);
    expect(offer.formatLabel, 'Quarteto');
    expect(offer.genderFree, isTrue);
    expect(offer.genderDetail, 'Livre');
  });

  test('detailFromMap degrades invalid composition to null (livre)', () {
    final d = TournamentDocumentMapper.detailFromMap('team-invalid', {
      'name': 'Copa Bugada',
      'capacity': 8,
      'enrolledCount': 0,
      'categories': [
        {
          'id': 'cat-trio',
          'categoryName': 'Trio',
          'entryFee': 210,
          'maxTeams': 8,
          'teamSize': 3,
          'genderMode': 'composition',
          // 2 + 2 != 3 → composição inválida, degrada para null.
          'genderComposition': {'men': 2, 'women': 2},
        },
      ],
    });

    final offer = d.categoryOffers.single;
    expect(offer.isTeamCategory, isTrue);
    expect(offer.genderCompositionMen, isNull);
    expect(offer.genderCompositionWomen, isNull);
    expect(offer.genderDetail, isNull);
  });

  test('detailFromMap without teamSize keeps classic dupla category', () {
    final d = TournamentDocumentMapper.detailFromMap('classic', {
      'name': 'Open Duplas',
      'capacity': 16,
      'enrolledCount': 0,
      'categories': [
        {
          'id': 'cat-dupla',
          'categoryName': 'Masculino Open',
          'entryFee': 180,
          'maxTeams': 16,
          'genderType': 'male',
        },
      ],
    });

    final offer = d.categoryOffers.single;
    expect(offer.isTeamCategory, isFalse);
    expect(offer.teamSize, isNull);
    expect(offer.rosterSize, 2);
    expect(offer.formatLabel, 'Dupla');
    expect(offer.genderDetail, isNull);
  });

  test('detailFromMap rejects teamSize out of 3–5 range', () {
    final d = TournamentDocumentMapper.detailFromMap('team-range', {
      'name': 'Copa',
      'capacity': 8,
      'enrolledCount': 0,
      'categories': [
        {
          'id': 'c2',
          'categoryName': 'Dupla com teamSize',
          'entryFee': 90,
          'maxTeams': 8,
          'teamSize': 2,
        },
        {
          'id': 'c6',
          'categoryName': 'Sexteto',
          'entryFee': 90,
          'maxTeams': 8,
          'teamSize': 6,
        },
      ],
    });

    expect(d.categoryOffers[0].isTeamCategory, isFalse);
    expect(d.categoryOffers[1].isTeamCategory, isFalse);
  });

  test('detailFromMap falls back to tournament-level uniform flags', () {
    final d = TournamentDocumentMapper.detailFromMap('uniform-root', {
      'name': 'Open',
      'capacity': 16,
      'enrolledCount': 0,
      'uniformRequired': true,
      'uniformNumberOnShirt': true,
      'uniformNameOnShirt': false,
      'categories': [
        {
          'id': 'cat-1',
          'categoryName': 'Misto',
          'entryFee': 90,
          'maxTeams': 16,
        },
      ],
    });

    final category = d.categoryOffers.first;
    expect(category.uniformType, 'top_only');
    expect(category.uniformNumberOnShirt, isTrue);
    expect(category.uniformNameOnShirt, isFalse);
    expect(categoryRequiresUniform(category), isTrue);
  });

  test('detailFromMap lê registrationOpensAt e o leva para a vitrine', () {
    final opensAt = DateTime(2026, 9, 5, 10, 0);
    final d = TournamentDocumentMapper.detailFromMap('t-agendado', {
      'name': 'Etapa Futuro',
      'listingStatus': 'open',
      'registrationOpensAt': Timestamp.fromDate(opensAt),
    });

    expect(d.registrationOpensAt, opensAt);
    expect(d.toDiscovery().registrationOpensAt, opensAt);
  });

  test('detailFromMap sem registrationOpensAt fica nulo', () {
    final d = TournamentDocumentMapper.detailFromMap('t-sem-agenda', {
      'name': 'Etapa Livre',
      'listingStatus': 'open',
    });

    expect(d.registrationOpensAt, isNull);
  });

  test('detailFromMap lê registrationClosesAt', () {
    final t = TournamentDocumentMapper.detailFromMap('t-prazo', {
      'name': 'Copa Aparecida',
      'registrationClosesAt': Timestamp.fromDate(
        DateTime.utc(2026, 7, 8, 23, 59),
      ),
    });
    // `Timestamp.toDate()` devolve DateTime LOCAL, e o `==` do Dart compara
    // também a flag isUtc — comparar direto contra `DateTime.utc` falha mesmo
    // com o instante certo.
    expect(t.registrationClosesAt!.toUtc(), DateTime.utc(2026, 7, 8, 23, 59));
  });

  test('detailFromMap sem registrationClosesAt devolve null', () {
    final t = TournamentDocumentMapper.detailFromMap('t-sem-prazo', {
      'name': 'Copa',
    });
    expect(t.registrationClosesAt, isNull);
  });

  group('requireFormedPair (exigir dupla já formada)', () {
    test('lê o campo do doc do torneio', () {
      final t = TournamentDocumentMapper.detailFromMap('t1', {
        'name': 'Copa',
        'dateLabel': '1 mai',
        'startAt': DateTime(2026, 5, 1),
        'requireFormedPair': true,
      });
      expect(t.requireFormedPair, isTrue);
    });

    test('torneio antigo (campo ausente) aceita inscrição individual', () {
      final t = TournamentDocumentMapper.detailFromMap('t1', {
        'name': 'Copa',
        'dateLabel': '1 mai',
        'startAt': DateTime(2026, 5, 1),
      });
      expect(t.requireFormedPair, isFalse);
    });
  });
}
