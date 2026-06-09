import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_helpers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('tournamentInviteExpiryLabel', () {
    test('formats hours and minutes remaining', () {
      final now = DateTime(2026, 5, 27, 12);
      final expires = now.add(const Duration(hours: 23, minutes: 47));
      expect(
        tournamentInviteExpiryLabel(expires, now),
        'expira em 23h 47min',
      );
    });
  });

  group('buildRegistrationQuote', () {
    test('computes display total, share and platform fee', () {
      final quote = buildRegistrationQuote(entryFee: 160);

      expect(quote.displayTotal, 160);
      expect(quote.shareAmount, 80);
      expect(quote.platformFee, kTournamentPlatformFeeBrl);
    });

    test('clamps negative entry fee to zero', () {
      final quote = buildRegistrationQuote(entryFee: -10);

      expect(quote.displayTotal, 0);
      expect(quote.shareAmount, 0);
    });
  });

  group('registrationRequiresPayment', () {
    test('false when entry fee is zero', () {
      expect(
        registrationRequiresPayment(buildRegistrationQuote(entryFee: 0)),
        isFalse,
      );
    });

    test('true when entry fee is positive', () {
      expect(
        registrationRequiresPayment(buildRegistrationQuote(entryFee: 90)),
        isTrue,
      );
    });
  });

  group('categoryBadgeLabel', () {
    test('uses level when available', () {
      const offer = TournamentCategoryOffer(
        id: 'sub19',
        name: 'Sub 19 Masculino',
        entryFee: 160,
        level: 'S19',
      );

      expect(categoryBadgeLabel(offer), 'S19');
    });

    test('uses initials from multi-word name', () {
      const offer = TournamentCategoryOffer(
        id: 'mc',
        name: 'Masculino C',
        entryFee: 90,
      );

      expect(categoryBadgeLabel(offer), 'MC');
    });
  });

  group('categoryRegistrationSubtitle', () {
    test('shows duplas and enrolled count for dupla format', () {
      const offer = TournamentCategoryOffer(
        id: 'sub19',
        name: 'Sub 19 Masculino',
        entryFee: 160,
        maxTeams: 8,
        spotsTotal: 8,
        spotsLeft: 3,
      );

      expect(
        categoryRegistrationSubtitle(
          offer,
          format: TournamentFormat.dupla,
        ),
        'Masculino · 8 duplas · 5/8 inscritas',
      );
    });

    test('uses genderType when present', () {
      const offer = TournamentCategoryOffer(
        id: 'fem',
        name: 'Sub 19',
        entryFee: 160,
        maxTeams: 8,
        spotsLeft: 8,
        genderType: 'feminino',
      );

      expect(categoryGenderDisplayLabel(offer), 'Feminino');
      expect(
        categoryRegistrationSubtitle(offer, format: TournamentFormat.dupla),
        'Feminino · 8 duplas · 0/8 inscritas',
      );
    });

    test('shows Misto for mixed categories', () {
      const offer = TournamentCategoryOffer(
        id: 'mix',
        name: 'Open',
        entryFee: 160,
        maxTeams: 4,
        genderType: 'misto',
      );

      expect(categoryGenderDisplayLabel(offer), 'Misto');
    });
  });

  group('leagueBadgeLabel', () {
    test('includes season when present', () {
      const ctx = ResolvedLeagueContext(
        league: DiscoveryLeague(
          id: 'liga',
          name: 'Copa Goiás',
          seasonLabel: '2026',
          stages: [],
        ),
        stage: DiscoveryLeagueStage(
          id: 's1',
          name: 'Etapa 1',
          order: 1,
          tournamentIds: [],
        ),
      );

      expect(leagueBadgeLabel(ctx), 'COPA GOIÁS · 2026');
    });

    test('falls back to TORNEIO without league context', () {
      expect(leagueBadgeLabel(null), 'TORNEIO');
    });
  });

  group('tournamentRegistrationHeroSubtitle', () {
    test('combines compact date range and location', () {
      final tournament = TournamentDetail(
        id: 't1',
        name: 'Etapa Goiânia',
        location: 'Arena Beach GYN',
        city: 'Goiânia, GO',
        dateLabel: '18–20 abr',
        startDate: DateTime(2026, 5, 18),
        endDate: DateTime(2026, 5, 20),
        categories: const [TournamentGenderCat.m],
        format: TournamentFormat.dupla,
        priceLabel: r'R$ 160',
        priceValue: 160,
        spotsLeft: 10,
        spotsTotal: 16,
        status: TournamentListingStatus.open,
        featured: false,
        enrolledCount: 6,
        liveMatchesNow: 0,
      );

      final subtitle = tournamentRegistrationHeroSubtitle(tournament);

      expect(subtitle, contains('Arena Beach GYN'));
      expect(subtitle, contains('Goiânia'));
      expect(subtitle, contains('18'));
      expect(subtitle, contains('20'));
    });
  });

  group('paymentAmountLabel', () {
    test('returns full or share amount', () {
      final quote = buildRegistrationQuote(entryFee: 160);

      expect(
        paymentAmountLabel(quote: quote, amountType: 'full'),
        contains('160'),
      );
      expect(
        paymentAmountLabel(quote: quote, amountType: 'share'),
        contains('80'),
      );
    });
  });

  group('registrationHeaderTitle', () {
    test('partner step uses Convidar parceiro', () {
      expect(
        registrationHeaderTitle(TournamentRegistrationStep.partner),
        'Convidar parceiro',
      );
      expect(
        registrationHeaderTitle(TournamentRegistrationStep.summary),
        'Inscrição',
      );
    });
  });

  group('registrationStepShowsHero', () {
    test('hides hero on partner and waiting', () {
      expect(registrationStepShowsHero(TournamentRegistrationStep.partner), isFalse);
      expect(registrationStepShowsHero(TournamentRegistrationStep.waiting), isFalse);
      expect(registrationStepShowsHero(TournamentRegistrationStep.summary), isTrue);
    });
  });

  group('registrationWaitingCanProceed', () {
    test('requires accepted invite and registration id', () {
      expect(
        registrationWaitingCanProceed(
          inviteAccepted: false,
          registrationId: 'reg1',
        ),
        isFalse,
      );
      expect(
        registrationWaitingCanProceed(
          inviteAccepted: true,
          registrationId: null,
        ),
        isFalse,
      );
      expect(
        registrationWaitingCanProceed(
          inviteAccepted: true,
          registrationId: 'reg1',
        ),
        isTrue,
      );
    });
  });

  group('currentAthleteSharePaid', () {
    test('true when uid in sharePaidUids', () {
      expect(
        currentAthleteSharePaid(
          sharePaidUids: const ['a', 'b'],
          athleteUid: 'a',
        ),
        isTrue,
      );
      expect(
        currentAthleteSharePaid(
          sharePaidUids: const ['a'],
          athleteUid: 'b',
        ),
        isFalse,
      );
    });
  });

  group('registrationDualPaymentProgressLabel', () {
    test('shows confirmed when fully paid', () {
      final quote = buildRegistrationQuote(entryFee: 160);
      final label = registrationDualPaymentProgressLabel(
        quote: quote,
        paidAmount: 160,
        isPaid: true,
      );
      expect(label, contains('confirmada'));
    });

    test('shows partner pending after one share', () {
      final quote = buildRegistrationQuote(entryFee: 160);
      final label = registrationDualPaymentProgressLabel(
        quote: quote,
        paidAmount: 80,
        isPaid: false,
      );
      expect(label, contains('parcela paga'));
    });

    test('shows free registration confirmation progress', () {
      final quote = buildRegistrationQuote(entryFee: 0);
      expect(
        registrationDualPaymentProgressLabel(
          quote: quote,
          paidAmount: 0,
          isPaid: false,
        ),
        contains('gratuita'),
      );
      expect(
        registrationDualPaymentProgressLabel(
          quote: quote,
          paidAmount: 0,
          isPaid: false,
          sharePaidUids: const ['partner'],
          currentAthleteUid: 'me',
        ),
        contains('parceiro já confirmou'),
      );
    });
  });

  group('categoryRequiresUniform', () {
    test('returns true for top_only, full and legacy top', () {
      expect(
        categoryRequiresUniform(
          const TournamentCategoryOffer(
            id: 'c',
            name: 'Cat',
            entryFee: 100,
            uniformType: 'top_only',
          ),
        ),
        isTrue,
      );
      expect(
        categoryRequiresUniform(
          const TournamentCategoryOffer(
            id: 'c',
            name: 'Cat',
            entryFee: 100,
            uniformType: 'full',
          ),
        ),
        isTrue,
      );
      expect(
        categoryRequiresUniform(
          const TournamentCategoryOffer(
            id: 'c',
            name: 'Cat',
            entryFee: 100,
            uniformType: 'top',
          ),
        ),
        isTrue,
      );
    });

    test('returns false for none or missing', () {
      expect(
        categoryRequiresUniform(
          const TournamentCategoryOffer(
            id: 'c',
            name: 'Cat',
            entryFee: 100,
            uniformType: 'none',
          ),
        ),
        isFalse,
      );
      expect(
        categoryRequiresUniform(
          const TournamentCategoryOffer(id: 'c', name: 'Cat', entryFee: 100),
        ),
        isFalse,
      );
    });
  });

  group('registration step navigation with uniform', () {
    const withUniform = TournamentCategoryOffer(
      id: 'c',
      name: 'Cat',
      entryFee: 100,
      uniformType: 'top_only',
      uniformNumberOnShirt: true,
    );
    const withoutUniform = TournamentCategoryOffer(
      id: 'c',
      name: 'Cat',
      entryFee: 100,
      uniformType: 'none',
    );

    test('summary leads to uniform when required', () {
      expect(
        nextStepAfterSummary(withUniform),
        TournamentRegistrationStep.uniform,
      );
      expect(
        nextStepAfterSummary(withoutUniform),
        TournamentRegistrationStep.partner,
      );
    });

    test('partner back goes to uniform or summary', () {
      expect(
        previousStepFromPartner(withUniform),
        TournamentRegistrationStep.uniform,
      );
      expect(
        previousStepFromPartner(withoutUniform),
        TournamentRegistrationStep.summary,
      );
    });
  });

  group('validateUniformSelection', () {
    test('requires top size and jersey number when configured', () {
      const category = TournamentCategoryOffer(
        id: 'c',
        name: 'Cat',
        entryFee: 100,
        uniformType: 'top_only',
        uniformNumberOnShirt: true,
        uniformSizeOptionsTop: ['M', 'G'],
      );
      expect(
        validateUniformSelection(
          category: category,
          selection: const TournamentUniformSelection(
            sizeTop: 'M',
            jerseyNumber: 10,
          ),
        ),
        isNull,
      );
      expect(
        validateUniformSelection(
          category: category,
          selection: const TournamentUniformSelection(jerseyNumber: 10),
        ),
        isNotNull,
      );
    });
  });

  group('athleteMatchesCategoryGender', () {
    test('allows mixed and open categories for any athlete', () {
      const mixed = TournamentCategoryOffer(
        id: 'm',
        name: 'Misto',
        entryFee: 90,
        genderType: 'Misto',
      );
      const open = TournamentCategoryOffer(
        id: 'o',
        name: 'Open',
        entryFee: 90,
      );

      expect(athleteMatchesCategoryGender(mixed, null), isTrue);
      expect(athleteMatchesCategoryGender(mixed, 'Feminino'), isTrue);
      expect(athleteMatchesCategoryGender(open, 'Masculino'), isTrue);
    });

    test('requires matching gender for restricted categories', () {
      const masc = TournamentCategoryOffer(
        id: 'm',
        name: 'Masculino B',
        entryFee: 90,
        genderType: 'Masculino',
      );

      expect(athleteMatchesCategoryGender(masc, 'Masculino'), isTrue);
      expect(athleteMatchesCategoryGender(masc, 'Feminino'), isFalse);
      expect(athleteMatchesCategoryGender(masc, null), isFalse);
    });
  });

  group('isCategorySelectable', () {
    test('returns false when closed or full', () {
      const closed = TournamentCategoryOffer(
        id: 'c1',
        name: 'Cat',
        entryFee: 90,
        registrationClosed: true,
      );
      const full = TournamentCategoryOffer(
        id: 'c2',
        name: 'Cat',
        entryFee: 90,
        spotsTotal: 8,
        spotsLeft: 0,
      );

      expect(isCategorySelectable(closed), isFalse);
      expect(isCategorySelectable(full), isFalse);
    });
  });

  group('registrationStickyEnabled', () {
    test('disabled when profile blocks tournament access', () {
      expect(
        registrationStickyEnabled(canAccess: false, stepEnabled: true),
        isFalse,
      );
    });

    test('follows step when access is allowed', () {
      expect(
        registrationStickyEnabled(canAccess: true, stepEnabled: false),
        isFalse,
      );
      expect(
        registrationStickyEnabled(canAccess: true, stepEnabled: true),
        isTrue,
      );
    });
  });
}
