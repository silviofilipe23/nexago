import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

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

  test('tournamentDetailStats uses live enrollment when resolved', () {
    final stats = tournamentDetailStats(
      sample,
      enrollmentByCategoryId: const {
        'Masc': 10,
        'Misto': 5,
      },
      enrollmentCountsResolved: true,
    );
    expect(stats.spotsEnrolled, 15);
  });

  test('tournamentDetailStats does not fall back to enrolledCount when live is zero',
      () {
    final stats = tournamentDetailStats(
      sample,
      enrollmentByCategoryId: const {},
      enrollmentCountsResolved: true,
    );
    expect(stats.spotsEnrolled, 0);
  });

  test('tournamentDetailStats keeps legacy fallback while loading', () {
    final stats = tournamentDetailStats(
      sample,
      enrollmentCountsResolved: false,
    );
    expect(stats.spotsEnrolled, 60);
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

  test('tournamentCategoryRowStatus encerra selo com torneio finalizado', () {
    for (final status in [
      TournamentListingStatus.completed,
      TournamentListingStatus.ended,
    ]) {
      final rowStatus = tournamentCategoryRowStatus(
        sample.categoryOffers[0],
        tournamentStatus: status,
      );
      expect(rowStatus.label, 'ENCERRADA');
      expect(rowStatus.isClosed, isTrue);
    }
  });

  test('bracketFormatLabel translates pool play', () {
    expect(
      bracketFormatLabel('Pool Play + SE'),
      'Fase de Grupos + Mata-mata',
    );
  });

  group('groups tab visibility', () {
    test('isDoubleEliminationBracketFormat detects double elimination', () {
      expect(isDoubleEliminationBracketFormat('Double Elimination'), isTrue);
      expect(isDoubleEliminationBracketFormat('double elimination'), isTrue);
      expect(isDoubleEliminationBracketFormat('Pool Play + SE'), isFalse);
    });

    test('categoryHasGroupsPhase is false for double elimination', () {
      const offer = TournamentCategoryOffer(
        id: 'de',
        name: 'Misto',
        entryFee: 90,
        spotsLeft: 8,
        spotsTotal: 16,
        bracketFormat: 'Double Elimination',
      );
      expect(categoryHasGroupsPhase(offer), isFalse);
    });

    test('categoryHasGroupsPhase is true for pool play', () {
      expect(categoryHasGroupsPhase(sample.categoryOffers.first), isTrue);
    });

    test('tournamentShouldShowGroupsTab hides when all categories are DE', () {
      final deOnly = TournamentDetail(
        id: sample.id,
        name: sample.name,
        location: sample.location,
        city: sample.city,
        dateLabel: sample.dateLabel,
        startDate: sample.startDate,
        endDate: sample.endDate,
        categories: sample.categories,
        format: sample.format,
        priceLabel: sample.priceLabel,
        priceValue: sample.priceValue,
        spotsLeft: sample.spotsLeft,
        spotsTotal: sample.spotsTotal,
        status: sample.status,
        featured: sample.featured,
        enrolledCount: sample.enrolledCount,
        liveMatchesNow: sample.liveMatchesNow,
        categoryOffers: const [
          TournamentCategoryOffer(
            id: 'de',
            name: 'Misto',
            entryFee: 90,
            spotsLeft: 8,
            spotsTotal: 16,
            bracketFormat: 'Double Elimination',
          ),
        ],
      );
      expect(tournamentShouldShowGroupsTab(deOnly), isFalse);
    });

    test('tournamentShouldShowGroupsTab shows when any category has groups', () {
      expect(tournamentShouldShowGroupsTab(sample), isTrue);
    });

    test('tournamentShouldShowBracketExploreCard hides without matches', () {
      expect(tournamentShouldShowBracketExploreCard(const []), isFalse);
    });

    test('tournamentShouldShowBracketExploreCard shows with matches', () {
      expect(
        tournamentShouldShowBracketExploreCard([
          TournamentMatch(
            id: 'm1',
            tournamentId: 't1',
            categoryId: 'cat',
            round: 1,
            matchType: 'wb',
            poolId: '',
            teamAId: 'a',
            teamBId: 'b',
            status: 'scheduled',
            resultA: '',
            resultB: '',
            isGroupMatch: false,
            matchNumber: 1,
          ),
        ]),
        isTrue,
      );
    });
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
      'Masculino · Fase de Grupos + Mata-mata',
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
    const maleCanonical = TournamentCategoryOffer(
      id: 'male',
      name: 'Sub 19',
      entryFee: 90,
      genderType: 'male',
      spotsLeft: 5,
      spotsTotal: 10,
    );
    expect(tournamentCategoryGenderTag(masc), 'MASCULINO');
    expect(tournamentCategoryGenderTag(misto), 'MISTO');
    expect(tournamentCategoryGenderTag(maleCanonical), 'MASCULINO');
    expect(categoryGenderDisplayLabel(maleCanonical), 'Masculino');
  });

  test('categoryGenderDisplayLabelFromRaw maps Firestore codes', () {
    expect(categoryGenderDisplayLabelFromRaw('male'), 'Masculino');
    expect(categoryGenderDisplayLabelFromRaw('female'), 'Feminino');
    expect(categoryGenderDisplayLabelFromRaw('mixed'), 'Misto');
    expect(categoryGenderDisplayLabelFromRaw(''), '');
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
    const fullWaitlist = TournamentCategoryOffer(
      id: 'f',
      name: 'Full',
      entryFee: 90,
      spotsLeft: 0,
      spotsTotal: 16,
      waitlistEnabled: true,
    );
    const fullNoWaitlist = TournamentCategoryOffer(
      id: 'n',
      name: 'NoWait',
      entryFee: 90,
      spotsLeft: 0,
      spotsTotal: 16,
      waitlistEnabled: false,
    );
    expect(
      tournamentCategoryCtaKind(open, TournamentListingStatus.open),
      TournamentCategoryCtaKind.register,
    );
    expect(
      tournamentCategoryCtaKind(fullWaitlist, TournamentListingStatus.open),
      TournamentCategoryCtaKind.waitlist,
    );
    expect(
      tournamentCategoryCtaKind(fullNoWaitlist, TournamentListingStatus.open),
      TournamentCategoryCtaKind.disabled,
    );
    expect(
      tournamentCategoryCtaKind(
        open,
        TournamentListingStatus.bracketsReady,
      ),
      TournamentCategoryCtaKind.disabled,
    );
    expect(
      tournamentCategoryCtaLabel(TournamentCategoryCtaKind.waitlist),
      'Entrar na lista de espera →',
    );
  });

  test('tournamentCategoryCtaKindForAthlete shows view only when paid', () {
    const offer = TournamentCategoryOffer(
      id: 'o',
      name: 'Open',
      entryFee: 90,
      spotsLeft: 4,
      spotsTotal: 16,
    );
    expect(
      tournamentCategoryCtaKindForAthlete(
        offer: offer,
        tournamentStatus: TournamentListingStatus.open,
        isRegistrationPaid: true,
      ),
      TournamentCategoryCtaKind.viewRegistration,
    );
    expect(
      tournamentCategoryCtaKindForAthlete(
        offer: offer,
        tournamentStatus: TournamentListingStatus.open,
        isRegistrationPaid: false,
      ),
      TournamentCategoryCtaKind.register,
    );
  });

  test('athleteRegistrationStatusLabel distinguishes waitlist', () {
    expect(
      athleteRegistrationStatusLabel(isPaid: true, isWaitlist: true),
      'Na fila',
    );
    expect(
      athleteRegistrationStatusLabel(isPaid: true, isWaitlist: false),
      'Confirmado',
    );
  });

  test('athleteRegistrationStatusLabel flags reserved awaiting organizer', () {
    expect(
      athleteRegistrationStatusLabel(
        isPaid: false,
        isWaitlist: false,
        athleteHasReserved: true,
      ),
      'Aguardando organizador',
    );
    expect(
      athleteRegistrationStatusLabel(isPaid: false, isWaitlist: false),
      'Pagamento pendente',
    );
  });

  test('bracketFormatLabel translates internal codes', () {
    expect(
      bracketFormatLabel('groups_knockout'),
      'Fase de Grupos + Mata-mata',
    );
    expect(
      bracketFormatLabel('single_elimination'),
      'Eliminatória simples',
    );
  });

  test('categoryHasGroupsPhase recognizes groups_knockout', () {
    const offer = TournamentCategoryOffer(
      id: 'g',
      name: 'Misto',
      entryFee: 90,
      spotsLeft: 8,
      spotsTotal: 16,
      bracketFormat: 'groups_knockout',
    );
    expect(categoryHasGroupsPhase(offer), isTrue);
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

  group('inscrições agendadas (registrationOpensAt futuro)', () {
    final opensAt = DateTime(2026, 9, 5, 10, 0);

    test('CTA da categoria desabilita enquanto as inscrições não abrem', () {
      final offer = sample.categoryOffers.first;

      expect(
        tournamentCategoryCtaKind(
          offer,
          TournamentListingStatus.open,
          registrationNotYetOpen: true,
        ),
        TournamentCategoryCtaKind.disabled,
      );
      expect(
        tournamentCategoryCtaKind(offer, TournamentListingStatus.open),
        TournamentCategoryCtaKind.register,
      );
    });

    // O organizador pode inscrever uma dupla antes da abertura (o guard do
    // servidor tem bypass para ele). Uma inscrição paga já é do atleta: o CTA
    // precisa continuar levando à inscrição, não sumir atrás do EM BREVE.
    test('inscrição paga ganha do EM BREVE; sem inscrição, desabilita', () {
      final offer = sample.categoryOffers.first;

      expect(
        tournamentCategoryCtaKindForAthlete(
          offer: offer,
          tournamentStatus: TournamentListingStatus.open,
          isRegistrationPaid: true,
          registrationNotYetOpen: true,
        ),
        TournamentCategoryCtaKind.viewRegistration,
      );
      expect(
        tournamentCategoryCtaKindForAthlete(
          offer: offer,
          tournamentStatus: TournamentListingStatus.open,
          isRegistrationPaid: false,
          registrationNotYetOpen: true,
        ),
        TournamentCategoryCtaKind.disabled,
      );
    });

    test('banner anuncia a data e a hora da abertura enquanto não abre', () {
      expect(
        tournamentRegistrationOpensBanner(
          opensAt,
          now: DateTime(2026, 9, 5, 8, 0),
        ),
        'Inscrições abrem em 05/09 às 10:00',
      );
      expect(tournamentRegistrationOpensBanner(opensAt, now: opensAt), isNull);
      expect(tournamentRegistrationOpensBanner(null), isNull);
    });
  });
}
