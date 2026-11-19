import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_offers_logic.dart';

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  test('nothing offered, no cards', () {
    expect(
      arenaOtherOffers(
        planMonthlyPrices: const [],
        nextClubSession: null,
        classSignupOpen: false,
        professorsCount: 0,
      ),
      isEmpty,
    );
  });

  test('cards come in order: fixed time, club, classes', () {
    final offers = arenaOtherOffers(
      planMonthlyPrices: const [480, 320],
      nextClubSession: ArenaOfferClubSession(
        startAt: DateTime(2030, 3, 14, 19),
        startTime: '19:00',
        spotsLeft: 3,
        priceReais: 25,
      ),
      classSignupOpen: true,
      professorsCount: 4,
    );

    expect(offers.map((o) => o.kind), [
      ArenaOfferKind.schedulePlan,
      ArenaOfferKind.club,
      ArenaOfferKind.classes,
    ]);
    expect(offers[0].subtitle, contains('320'));
    expect(offers[0].subtitle, startsWith('a partir de '));
    expect(offers[1].title, 'qui, 14 · 19:00');
    expect(offers[1].subtitle, startsWith('3 vagas · '));
    expect(offers[2].title, 'Planos de aula');
    expect(offers[2].subtitle, '4 professores');
  });

  test('a full club session says so', () {
    final offers = arenaOtherOffers(
      planMonthlyPrices: const [],
      nextClubSession: const ArenaOfferClubSession(
        startTime: '19:00',
        spotsLeft: 0,
        priceReais: 25,
      ),
      classSignupOpen: false,
      professorsCount: 0,
    );

    expect(offers.single.title, '19:00');
    expect(offers.single.subtitle, 'Lista cheia');
  });

  test('teachers without open class plans still show', () {
    final offers = arenaOtherOffers(
      planMonthlyPrices: const [0],
      nextClubSession: null,
      classSignupOpen: false,
      professorsCount: 1,
    );

    expect(offers.single.kind, ArenaOfferKind.classes);
    expect(offers.single.title, 'Professores');
    expect(offers.single.subtitle, '1 professor');
  });
}
