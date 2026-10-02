import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_event_mapper.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_event.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('organizerEventListingOf (espelho do backend)', () {
    test('open, closed e completed são listados', () {
      expect(organizerEventListingOf({'listingStatus': 'open'}), OrganizerEventListing.open);
      expect(organizerEventListingOf({'listingStatus': 'closed'}), OrganizerEventListing.closed);
      expect(
        organizerEventListingOf({'listingStatus': 'Completed'}),
        OrganizerEventListing.completed,
      );
    });

    test('cai em `status` quando `listingStatus` falta', () {
      expect(organizerEventListingOf({'status': 'open'}), OrganizerEventListing.open);
    });

    test('rascunho, cancelado e estados fora da lista não entram', () {
      expect(organizerEventListingOf({'listingStatus': 'draft'}), isNull);
      expect(organizerEventListingOf({'listingStatus': 'cancelled'}), isNull);
      expect(organizerEventListingOf({'listingStatus': 'live'}), isNull);
      expect(organizerEventListingOf(const {}), isNull);
    });

    test('"por link" some; doc sem visibility conta como público', () {
      expect(
        organizerEventListingOf({'listingStatus': 'open', 'visibility': 'linkOnly'}),
        isNull,
      );
      expect(
        organizerEventListingOf({'listingStatus': 'open', 'visibility': 'publicListing'}),
        OrganizerEventListing.open,
      );
      expect(isOrganizerListedEventDoc({'listingStatus': 'completed'}), isTrue);
    });
  });

  group('organizerEventFromMap', () {
    Map<String, dynamic> doc({
      String listing = 'completed',
      Object? categoryOps,
    }) => {
      'name': 'Copa Verão',
      'managerId': 'org1',
      'listingStatus': listing,
      'sport': 'beachVolleyball',
      'locationName': 'Arena ErreJota',
      'startAt': Timestamp.fromDate(DateTime(2026, 5, 2, 8)),
      'endAt': Timestamp.fromDate(DateTime(2026, 5, 3, 18)),
      'categories': [
        {'id': 'c-masc', 'categoryName': 'Masculino B', 'entryFee': 140, 'maxTeams': 16},
        {'id': 'c-fem', 'categoryName': 'Feminino B', 'entryFee': 120, 'maxTeams': 16},
      ],
      'categoryOps': ?categoryOps,
    };

    test('não listado devolve null', () {
      expect(organizerEventFromMap('t1', doc(listing: 'draft')), isNull);
    });

    test('mapeia o torneio e os campeões na ordem das categorias', () {
      final event = organizerEventFromMap(
        't1',
        doc(
          categoryOps: {
            'c-fem': {'championTeamId': 'team-f', 'bracketStatus': 'completed'},
            'c-masc': {'championTeamId': ' team-m '},
            'c-velha': {'championTeamId': 'team-x'},
            'c-sem': {'bracketStatus': 'completed'},
            'c-lixo': 'x',
          },
        ),
      )!;

      expect(event.id, 't1');
      expect(event.listing, OrganizerEventListing.completed);
      expect(event.detail.name, 'Copa Verão');
      expect(event.detail.location, 'Arena ErreJota');
      expect(event.detail.priceValue, 120);
      expect([for (final c in event.champions) c.teamId], ['team-m', 'team-f', 'team-x']);
      expect(event.champions.first.categoryName, 'Masculino B');
      expect(event.champions.last.categoryName, '');
    });

    test('sem categoryOps não há campeões', () {
      final event = organizerEventFromMap('t1', doc(listing: 'open'))!;
      expect(event.listing, OrganizerEventListing.open);
      expect(event.champions, isEmpty);
    });
  });
}
