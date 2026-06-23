import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/category_age_eligibility.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer _offer({
  String ageBand = '',
  String mode = '',
  int? min,
  int? max,
  String reference = '',
}) =>
    TournamentCategoryOffer(
      id: 'c',
      name: 'Cat',
      entryFee: 0,
      ageBand: ageBand,
      ageRestrictionMode: mode,
      ageMinYears: min,
      ageMaxYears: max,
      ageReference: reference,
    );

AthleteProfile _athlete(String? birthDate) => AthleteProfile(
      id: 'a',
      name: 'Ana',
      sport: 'Vôlei de praia',
      level: 'Open',
      city: 'Goiânia',
      birthDate: birthDate,
    );

void main() {
  final start = DateTime(2026, 6, 1);

  group('CategoryAgeRestriction.fromOffer', () {
    test('deriva de ageBand', () {
      expect(
        CategoryAgeRestriction.fromOffer(_offer(ageBand: 'sub21')).mode,
        AgeRestrictionMode.max,
      );
      expect(
        CategoryAgeRestriction.fromOffer(_offer(ageBand: 'sub21')).maxAge,
        21,
      );
      expect(
        CategoryAgeRestriction.fromOffer(_offer(ageBand: 'plus40')).minAge,
        40,
      );
      expect(
        CategoryAgeRestriction.fromOffer(_offer(ageBand: 'open')).hasLimit,
        isFalse,
      );
    });

    test('usa ageRestriction explícita (faixa + referência)', () {
      final r = CategoryAgeRestriction.fromOffer(
        _offer(mode: 'range', min: 18, max: 35, reference: 'registration'),
      );
      expect(r.mode, AgeRestrictionMode.range);
      expect(r.minAge, 18);
      expect(r.maxAge, 35);
      expect(r.reference, AgeReference.registration);
    });
  });

  group('computeAge', () {
    test('início do torneio', () {
      expect(
        CategoryAgeEligibility.computeAge(
          birthDate: DateTime(2006, 7, 1),
          reference: AgeReference.tournamentStart,
          tournamentStart: start,
        ),
        19,
      );
    });
    test('completada no ano', () {
      expect(
        CategoryAgeEligibility.computeAge(
          birthDate: DateTime(2006, 7, 1),
          reference: AgeReference.yearEnd,
          tournamentStart: start,
        ),
        20,
      );
    });
  });

  group('evaluate — premissa Sub-21 (abaixo/acima)', () {
    final p = _athlete('10/03/2006'); // 20 anos em jun/2026

    test('própria e acima ok, abaixo bloqueia', () {
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'sub21'), p, tournamentStart: start),
        AgeEligibility.eligible,
      );
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'sub23'), p, tournamentStart: start),
        AgeEligibility.eligible,
      );
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'sub19'), p, tournamentStart: start),
        AgeEligibility.outOfRange,
      );
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'open'), p, tournamentStart: start),
        AgeEligibility.eligible,
      );
    });
  });

  group('evaluate — masters e faixa', () {
    test('+40 ok, +50 bloqueia (45 anos)', () {
      final p = _athlete('10/03/1981'); // 45 em 2026
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'plus40'), p, tournamentStart: start),
        AgeEligibility.eligible,
      );
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'plus50'), p, tournamentStart: start),
        AgeEligibility.outOfRange,
      );
    });

    test('faixa 18-35', () {
      final inside = _athlete('10/03/1996'); // 30
      final outside = _athlete('10/03/1985'); // 41
      final range = _offer(mode: 'range', min: 18, max: 35);
      expect(
        CategoryAgeEligibility.evaluate(range, inside, tournamentStart: start),
        AgeEligibility.eligible,
      );
      expect(
        CategoryAgeEligibility.evaluate(range, outside, tournamentStart: start),
        AgeEligibility.outOfRange,
      );
    });
  });

  group('evaluate — sem data e sem restrição', () {
    test('sem data de nascimento → missingBirthDate', () {
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'sub21'), _athlete(null), tournamentStart: start),
        AgeEligibility.missingBirthDate,
      );
    });
    test('categoria livre sempre elegível, mesmo sem data', () {
      expect(
        CategoryAgeEligibility.evaluate(_offer(ageBand: 'open'), _athlete(null), tournamentStart: start),
        AgeEligibility.eligible,
      );
    });
  });
}
