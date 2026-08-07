import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_helpers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_payment_mode.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('tournamentInviteExpiryLabel', () {
    test('formats hours and minutes remaining', () {
      final now = DateTime(2026, 5, 27, 12);
      final expires = now.add(const Duration(hours: 23, minutes: 47));
      expect(tournamentInviteExpiryLabel(expires, now), 'expira em 23h 47min');
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

    test('trio divide a taxa pelo elenco de 3', () {
      final quote = buildRegistrationQuote(entryFee: 100, teamSize: 3);

      expect(quote.teamSize, 3);
      expect(quote.isTeamCategory, isTrue);
      expect(quote.unitSingular, 'equipe');
      expect(quote.shareAmount, closeTo(33.33, 0.01));
    });

    test('teamSize padrão 2 divide ao meio', () {
      final quote = buildRegistrationQuote(entryFee: 100);

      expect(quote.teamSize, 2);
      expect(quote.isTeamCategory, isFalse);
      expect(quote.unitSingular, 'dupla');
      expect(quote.shareAmount, 50);
    });

    test('teamSize menor que 2 é clampado para 2', () {
      expect(buildRegistrationQuote(entryFee: 100, teamSize: 1).teamSize, 2);
      expect(buildRegistrationQuote(entryFee: 100, teamSize: 0).teamSize, 2);
      expect(
        buildRegistrationQuote(entryFee: 100, teamSize: 1).shareAmount,
        50,
      );
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

  group('registrationAwaitingSoloPartner', () {
    const soloSnap = TournamentRegistrationSnapshot(
      registrationId: 'reg-1',
      isPaid: false,
      paidAmount: 0,
      partnerPending: true,
    );

    test('true when partner pending and not fully paid', () {
      expect(
        registrationAwaitingSoloPartner(snap: soloSnap, isFullyPaid: false),
        isTrue,
      );
    });

    test('false when fully paid', () {
      expect(
        registrationAwaitingSoloPartner(snap: soloSnap, isFullyPaid: true),
        isFalse,
      );
    });

    test('false when partner is not pending', () {
      expect(
        registrationAwaitingSoloPartner(
          snap: const TournamentRegistrationSnapshot(
            registrationId: 'reg-1',
            isPaid: false,
            paidAmount: 0,
            partnerPending: false,
          ),
          isFullyPaid: false,
        ),
        isFalse,
      );
    });

    test('false when snapshot is null', () {
      expect(
        registrationAwaitingSoloPartner(snap: null, isFullyPaid: false),
        isFalse,
      );
    });
  });

  group('registrationPaidAwaitingPartner', () {
    test('true quando pago e ainda sem parceiro (solo pagou total)', () {
      expect(
        registrationPaidAwaitingPartner(
          snap: const TournamentRegistrationSnapshot(
            registrationId: 'reg-1',
            isPaid: true,
            paidAmount: 160,
            partnerPending: true,
          ),
        ),
        isTrue,
      );
    });

    test('false quando já tem parceiro', () {
      expect(
        registrationPaidAwaitingPartner(
          snap: const TournamentRegistrationSnapshot(
            registrationId: 'reg-1',
            isPaid: true,
            paidAmount: 160,
            partnerPending: false,
          ),
        ),
        isFalse,
      );
    });

    test('false quando não pago', () {
      expect(
        registrationPaidAwaitingPartner(
          snap: const TournamentRegistrationSnapshot(
            registrationId: 'reg-1',
            isPaid: false,
            paidAmount: 0,
            partnerPending: true,
          ),
        ),
        isFalse,
      );
    });
  });

  group('registrationSuccessNavigationAction — gate por partnerPending', () {
    test('não navega para sucesso enquanto aguarda parceiro grátis', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: true,
          seenUnpaid: true,
          alreadyHandled: false,
          partnerPending: true,
        ),
        RegistrationSuccessNavigationAction.ignore,
      );
    });

    test('navega quando pago e dupla completa', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: true,
          seenUnpaid: true,
          alreadyHandled: false,
          partnerPending: false,
        ),
        RegistrationSuccessNavigationAction.navigate,
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
        categoryRegistrationSubtitle(offer, format: TournamentFormat.dupla),
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

    test('maps canonical Firestore genderType male/female/mixed', () {
      const male = TournamentCategoryOffer(
        id: 'm',
        name: 'Sub 19',
        entryFee: 160,
        maxTeams: 8,
        genderType: 'male',
      );
      const female = TournamentCategoryOffer(
        id: 'f',
        name: 'Sub 19',
        entryFee: 160,
        maxTeams: 8,
        genderType: 'female',
      );
      const mixed = TournamentCategoryOffer(
        id: 'x',
        name: 'Open',
        entryFee: 160,
        maxTeams: 4,
        genderType: 'mixed',
      );

      expect(categoryGenderDisplayLabel(male), 'Masculino');
      expect(categoryGenderDisplayLabel(female), 'Feminino');
      expect(categoryGenderDisplayLabel(mixed), 'Misto');
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

    test('trio prefixa o formato e usa equipes na unidade', () {
      const offer = TournamentCategoryOffer(
        id: 'trio',
        name: 'Trio Misto',
        entryFee: 210,
        maxTeams: 8,
        spotsLeft: 3,
        genderType: 'mixed',
        teamSize: 3,
        genderCompositionMen: 2,
        genderCompositionWomen: 1,
      );

      final subtitle = categoryRegistrationSubtitle(offer);
      expect(subtitle, contains('Trio'));
      expect(subtitle, contains('8 equipes'));
      expect(subtitle, 'Trio · Misto · 2H + 1M · 8 equipes · 5/8 inscritas');
    });

    test('equipe livre mostra Livre e omite composição', () {
      const offer = TournamentCategoryOffer(
        id: 'quarteto',
        name: 'Quarteto Livre',
        entryFee: 280,
        maxTeams: 6,
        spotsLeft: 6,
        genderType: 'mixed',
        teamSize: 4,
        genderFree: true,
      );

      expect(
        categoryRegistrationSubtitle(offer),
        'Quarteto · Livre · 6 equipes · 0/6 inscritas',
      );
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

  group('registration steps', () {
    test('has 5 steps after folding the summary step', () {
      expect(TournamentRegistrationStep.values, hasLength(5));
      expect(
        TournamentRegistrationStep.values.map((s) => s.name),
        isNot(contains('summary')),
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
        registrationHeaderTitle(TournamentRegistrationStep.category),
        'Inscrição',
      );
    });
  });

  group('registrationStepShowsHero', () {
    test('hides hero on partner, waiting and uniform; shows on category', () {
      expect(
        registrationStepShowsHero(TournamentRegistrationStep.partner),
        isFalse,
      );
      expect(
        registrationStepShowsHero(TournamentRegistrationStep.waiting),
        isFalse,
      );
      expect(
        registrationStepShowsHero(TournamentRegistrationStep.uniform),
        isFalse,
      );
      expect(
        registrationStepShowsHero(TournamentRegistrationStep.category),
        isTrue,
      );
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
        currentAthleteSharePaid(sharePaidUids: const ['a'], athleteUid: 'b'),
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

    test('partner back goes to uniform or category', () {
      expect(
        previousStepFromPartner(withUniform),
        TournamentRegistrationStep.uniform,
      );
      expect(
        previousStepFromPartner(withoutUniform),
        TournamentRegistrationStep.category,
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

    test('requires jersey name when uniformNameOnShirt is enabled', () {
      const category = TournamentCategoryOffer(
        id: 'c',
        name: 'Cat',
        entryFee: 100,
        uniformType: 'top_only',
        uniformNameOnShirt: true,
        uniformSizeOptionsTop: ['M'],
      );
      expect(
        validateUniformSelection(
          category: category,
          selection: const TournamentUniformSelection(sizeTop: 'M'),
        ),
        'Informe o nome para a camisa.',
      );
      expect(
        validateUniformSelection(
          category: category,
          selection: const TournamentUniformSelection(
            sizeTop: 'M',
            jerseyName: 'Silva',
          ),
        ),
        isNull,
      );
    });
  });

  group('defaultJerseyNameForAthlete', () {
    test('prefers nickname then surname', () {
      expect(
        defaultJerseyNameForAthlete(
          fullName: 'João Silva',
          nickname: 'Jota',
        ),
        'Jota',
      );
      expect(
        defaultJerseyNameForAthlete(fullName: 'João Silva'),
        'Silva',
      );
      expect(
        defaultJerseyNameForAthlete(fullName: 'Maria'),
        'Maria',
      );
    });
  });

  group('uniformPayloadForPartnerInvite', () {
    test('returns null for incomplete uniform', () {
      const category = TournamentCategoryOffer(
        id: 'c',
        name: 'Cat',
        entryFee: 100,
        uniformType: 'top_only',
        uniformNameOnShirt: true,
        uniformSizeOptionsTop: ['M'],
      );
      expect(
        uniformPayloadForPartnerInvite(
          category: category,
          selection: const TournamentUniformSelection(sizeTop: 'M'),
        ),
        isNull,
      );
      expect(
        uniformPayloadForPartnerInvite(
          category: category,
          selection: const TournamentUniformSelection(
            sizeTop: 'M',
            jerseyName: 'Silva',
          ),
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
      const open = TournamentCategoryOffer(id: 'o', name: 'Open', entryFee: 90);

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

    test('equipe livre aceita qualquer atleta, inclusive sem gênero', () {
      const free = TournamentCategoryOffer(
        id: 'trio-livre',
        name: 'Trio Livre',
        entryFee: 210,
        genderType: 'mixed',
        teamSize: 3,
        genderFree: true,
      );

      expect(athleteMatchesCategoryGender(free, 'Feminino'), isTrue);
      expect(athleteMatchesCategoryGender(free, 'Masculino'), isTrue);
      expect(athleteMatchesCategoryGender(free, null), isTrue);
    });

    test('composição 3H+0M só aceita Masculino', () {
      const menOnly = TournamentCategoryOffer(
        id: 'trio-masc',
        name: 'Trio Masculino',
        entryFee: 210,
        genderType: 'mixed',
        teamSize: 3,
        genderCompositionMen: 3,
        genderCompositionWomen: 0,
      );

      expect(athleteMatchesCategoryGender(menOnly, 'Masculino'), isTrue);
      expect(athleteMatchesCategoryGender(menOnly, 'Feminino'), isFalse);
      expect(athleteMatchesCategoryGender(menOnly, null), isFalse);
    });

    test('composição 0H+4M só aceita Feminino', () {
      const womenOnly = TournamentCategoryOffer(
        id: 'quarteto-fem',
        name: 'Quarteto Feminino',
        entryFee: 280,
        genderType: 'mixed',
        teamSize: 4,
        genderCompositionMen: 0,
        genderCompositionWomen: 4,
      );

      expect(athleteMatchesCategoryGender(womenOnly, 'Feminino'), isTrue);
      expect(athleteMatchesCategoryGender(womenOnly, 'Masculino'), isFalse);
    });

    test('composição mista exata 2H+2M aceita ambos', () {
      const mixedExact = TournamentCategoryOffer(
        id: 'quarteto-misto',
        name: 'Quarteto Misto',
        entryFee: 280,
        genderType: 'mixed',
        teamSize: 4,
        genderCompositionMen: 2,
        genderCompositionWomen: 2,
      );

      expect(athleteMatchesCategoryGender(mixedExact, 'Masculino'), isTrue);
      expect(athleteMatchesCategoryGender(mixedExact, 'Feminino'), isTrue);
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

  group('registrationRequiresAppPayment', () {
    TournamentDetail tournamentWithMode(TournamentPaymentMode mode) {
      return TournamentDetail(
        id: 't1',
        name: 'Open',
        location: 'Arena',
        city: 'Goiânia',
        dateLabel: '21/04',
        startDate: DateTime(2026, 4, 21),
        endDate: DateTime(2026, 4, 21),
        categories: const [TournamentGenderCat.m],
        format: TournamentFormat.dupla,
        priceLabel: r'R$ 180',
        priceValue: 180,
        spotsLeft: 8,
        spotsTotal: 16,
        status: TournamentListingStatus.open,
        featured: false,
        enrolledCount: 0,
        liveMatchesNow: 0,
        paymentMode: mode,
      );
    }

    test('false for direct organizer with fee', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      final tournament = tournamentWithMode(
        TournamentPaymentMode.directWithOrganizer,
      );
      expect(registrationRequiresAppPayment(quote, tournament), isFalse);
      expect(tournamentUsesDirectOrganizerPayment(tournament), isTrue);
    });

    test('true for app PIX with fee', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      final tournament = tournamentWithMode(TournamentPaymentMode.appPixCard);
      expect(registrationRequiresAppPayment(quote, tournament), isTrue);
    });

    test('false when entry fee is zero', () {
      final quote = buildRegistrationQuote(entryFee: 0);
      final tournament = tournamentWithMode(
        TournamentPaymentMode.directWithOrganizer,
      );
      expect(registrationRequiresAppPayment(quote, tournament), isFalse);
    });
  });

  group('directOrganizerPaymentBody', () {
    test('includes duo amount and bold phrase parts', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      final body = directOrganizerPaymentBody(quote);
      expect(body, contains('não é cobrada pelo app'));
      expect(body, contains('180'));

      final parts = directOrganizerPaymentBodyParts(quote);
      expect(parts.$2, 'não é cobrada pelo app');
      expect(parts.$3, contains('180'));
    });

    test('step 2 subtitle includes duo amount', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      final subtitle = directOrganizerPaymentStep2Subtitle(quote);
      expect(subtitle, contains('180'));
      expect(subtitle, contains('Pix, dinheiro ou maquininha'));
    });

    test('prereserve alert highlights pré-reservada', () {
      final parts = directOrganizerPrereserveAlertParts();
      expect(parts.$2, 'pré-reservada');
      expect(parts.$3, contains('organizador'));
    });

    test('directOrganizerPixAmount returns share or full', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      expect(directOrganizerPixAmount(quote, 'share'), 90);
      expect(directOrganizerPixAmount(quote, 'full'), 180);
    });

    test('directOrganizerShareHint warns about coordination', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      expect(
        directOrganizerShareHint(quote, 'share'),
        contains('90'),
      );
      expect(
        directOrganizerShareHint(quote, 'share'),
        contains('parceiro'),
      );
      expect(
        directOrganizerShareHint(quote, 'full'),
        contains('integral'),
      );
      expect(
        directOrganizerShareHint(quote, 'full'),
        contains('não pagar'),
      );
    });
  });

  group('registrationDualPaymentProgressLabel direct organizer', () {
    test('shows reserve copy for direct organizer flow', () {
      final quote = buildRegistrationQuote(entryFee: 180);
      expect(
        registrationDualPaymentProgressLabel(
          quote: quote,
          paidAmount: 0,
          isPaid: false,
          isDirectOrganizerPayment: true,
        ),
        contains('reservar'),
      );
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
