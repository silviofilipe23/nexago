import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  final sample = TournamentDetail(
    id: 't1',
    name: 'Etapa Garden',
    location: 'Arena Garden',
    city: 'Goiânia, GO',
    dateLabel: '21/04',
    startDate: DateTime(2026, 4, 21),
    endDate: DateTime(2026, 4, 21),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 20,
    spotsTotal: 80,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 60,
    liveMatchesNow: 0,
    leagueStageOrder: 1,
    tournamentPrizes: const [
      TournamentPrize(position: '1', value: 10000),
      TournamentPrize(position: '2', value: 3500),
    ],
    categoryOffers: const [
      TournamentCategoryOffer(
        id: 'Masc',
        name: 'Masculino B',
        entryFee: 90,
        genderType: 'Masculino',
        spotsLeft: 8,
        spotsTotal: 32,
        bracketFormat: 'Pool Play + SE',
        prizes: [
          TournamentCategoryPrize(position: '1', value: 1000),
          TournamentCategoryPrize(position: '2', value: 500),
        ],
      ),
      TournamentCategoryOffer(
        id: 'Fem',
        name: 'Fem',
        entryFee: 90,
        genderType: 'Feminino',
        spotsLeft: 0,
        spotsTotal: 16,
        registrationClosed: true,
        bracketFormat: 'Pool Play + SE',
        prizes: [
          TournamentCategoryPrize(position: '1', value: 2000),
          TournamentCategoryPrize(position: '2', value: 500),
        ],
      ),
      TournamentCategoryOffer(
        id: 'Misto',
        name: 'Misto',
        entryFee: 90,
        genderType: 'Misto',
        spotsLeft: 12,
        spotsTotal: 32,
        bracketFormat: 'Pool Play + SE',
      ),
    ],
  );

  test('tournamentStageEyebrow uses stage order', () {
    expect(tournamentStageEyebrow(sample), 'TORNEIO · 1 ETAPA');
  });

  test('tournamentDetailStats aggregates categories', () {
    final stats = tournamentDetailStats(sample);
    expect(stats.categoryCount, 3);
    expect(stats.openCategories, 2);
    expect(stats.spotsTotal, 80);
    expect(stats.spotsEnrolled, 60);
    expect(stats.prizeTotalLabel, contains('R\$'));
  });

  test('tournamentCategoryRowStatus closed vs open', () {
    expect(
      tournamentCategoryRowStatus(sample.categoryOffers[1]).label,
      'ENCERRADA',
    );
    expect(
      tournamentCategoryRowStatus(sample.categoryOffers[0]).label,
      '8 vagas',
    );
    expect(
      tournamentCategoryRowStatus(sample.categoryOffers[0]).color,
      AppColors.win,
    );
  });

  test('bracketFormatLabel translates pool play', () {
    expect(
      bracketFormatLabel('Pool Play + SE'),
      'Fase de Grupos + SE',
    );
  });

  test('tournamentPrizeTotalValue sums tournament prizes', () {
    expect(tournamentPrizeTotalValue(sample), 17500);
  });

  test('tournamentCategoryPrizesTotal sums offer prizes', () {
    expect(
      tournamentCategoryPrizesTotal(sample.categoryOffers[0]),
      1500,
    );
  });

  test('tournamentCategoryPrizesTotalAll sums all offers prizes', () {
    expect(
      tournamentCategoryPrizesTotalAll(sample.categoryOffers),
      4000,
    );
  });

  test('tournamentCategoryPrizesCategoriesCount counts offers with prizes',
      () {
    expect(
      tournamentCategoryPrizesCategoriesCount(sample.categoryOffers),
      2,
    );
  });

  test('tournamentEventPrizesTotalValue sums tournament + categories', () {
    expect(tournamentEventPrizesTotalValue(sample), 17500);
  });

  test('formatMoney formats pt_BR currency', () {
    final label = formatMoney(1500);
    expect(label, contains('R\$'));
    expect(label, contains('1.500'));
  });

  test('tournamentCategoryFirstPlaceTotalAll sums first place prizes', () {
    expect(
      tournamentCategoryFirstPlaceTotalAll(sample.categoryOffers),
      3000,
    );
  });

  test('tournamentCategoryPrizeSubtitle joins gender and format', () {
    expect(
      tournamentCategoryPrizeSubtitle(sample.categoryOffers[0]),
      'Masculino · Fase de Grupos + SE',
    );
  });

  test('tournamentCategoryGenderTag from genderType or name', () {
    const masc = TournamentCategoryOffer(
      id: 'm',
      name: 'Cat',
      entryFee: 90,
      genderType: 'Masculino',
      spotsLeft: 5,
      spotsTotal: 10,
    );
    const misto = TournamentCategoryOffer(
      id: 'x',
      name: 'Misto Open',
      entryFee: 90,
      spotsLeft: 5,
      spotsTotal: 10,
    );
    expect(tournamentCategoryGenderTag(masc), 'MASCULINO');
    expect(tournamentCategoryGenderTag(misto), 'MISTO');
  });

  test('tournamentCategoryVacancyUi closed full bar is red', () {
    const closed = TournamentCategoryOffer(
      id: 'c',
      name: 'Masculino C',
      entryFee: 90,
      spotsLeft: 0,
      spotsTotal: 30,
      registrationClosed: true,
    );
    final ui = tournamentCategoryVacancyUi(closed);
    expect(ui.fill, 1);
    expect(ui.barColor, AppColors.live);
    expect(ui.caption, contains('encerrada'));
  });

  test('tournamentCategoryCtaKind register vs waitlist', () {
    const open = TournamentCategoryOffer(
      id: 'o',
      name: 'Open',
      entryFee: 90,
      spotsLeft: 4,
      spotsTotal: 16,
    );
    const full = TournamentCategoryOffer(
      id: 'f',
      name: 'Full',
      entryFee: 90,
      spotsLeft: 0,
      spotsTotal: 16,
    );
    expect(
      tournamentCategoryCtaKind(open, TournamentListingStatus.open),
      TournamentCategoryCtaKind.register,
    );
    expect(
      tournamentCategoryCtaKind(full, TournamentListingStatus.open),
      TournamentCategoryCtaKind.waitlist,
    );
    expect(
      tournamentCategoryCtaLabel(TournamentCategoryCtaKind.register),
      'Inscrever-se →',
    );
  });

  test('categoryPrizeRows orders and formats prizes', () {
    const offer = TournamentCategoryOffer(
      id: 'p',
      name: 'P',
      entryFee: 90,
      spotsLeft: 1,
      spotsTotal: 8,
      prizes: [
        TournamentCategoryPrize(position: '3', value: 500),
        TournamentCategoryPrize(position: '1', value: 2000),
        TournamentCategoryPrize(position: '2', value: 1000),
      ],
    );
    final rows = categoryPrizeRows(offer);
    expect(rows, hasLength(3));
    expect(rows.first.positionLabel, '1º lugar');
    expect(rows.first.highlight, isTrue);
    expect(rows.first.amountLabel, contains('2.000'));
  });
}
