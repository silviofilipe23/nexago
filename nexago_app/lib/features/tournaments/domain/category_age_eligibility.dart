import '../../athlete/domain/athlete_firestore_codes.dart';
import '../../athlete/domain/athlete_profile.dart';
import 'tournament_discovery_models.dart';

/// Elegibilidade de categoria por faixa etária (pré-validação na UI).
/// Espelha o backend `functions/src/category-age-eligibility.ts`.
enum AgeRestrictionMode { none, min, max, range }

enum AgeReference { tournamentStart, yearEnd, registration }

enum AgeEligibility { eligible, missingBirthDate, outOfRange }

class CategoryAgeRestriction {
  const CategoryAgeRestriction({
    required this.mode,
    this.minAge,
    this.maxAge,
    this.reference = AgeReference.tournamentStart,
  });

  final AgeRestrictionMode mode;
  final int? minAge;
  final int? maxAge;
  final AgeReference reference;

  static const none = CategoryAgeRestriction(mode: AgeRestrictionMode.none);

  bool get hasLimit {
    switch (mode) {
      case AgeRestrictionMode.min:
        return minAge != null;
      case AgeRestrictionMode.max:
        return maxAge != null;
      case AgeRestrictionMode.range:
        return minAge != null || maxAge != null;
      case AgeRestrictionMode.none:
        return false;
    }
  }

  /// Restrição da categoria; usa `ageRestriction` explícita, com fallback no
  /// preset `ageBand` (Sub-N→máx N, +N→mín N, Livre→nenhuma).
  factory CategoryAgeRestriction.fromOffer(TournamentCategoryOffer offer) {
    final reference = _referenceFromName(offer.ageReference);
    final mode = _modeFromName(offer.ageRestrictionMode);
    if (mode != null) {
      return CategoryAgeRestriction(
        mode: mode,
        minAge: offer.ageMinYears,
        maxAge: offer.ageMaxYears,
        reference: reference,
      );
    }
    return _fromAgeBand(offer.ageBand, reference);
  }

  static AgeRestrictionMode? _modeFromName(String raw) {
    switch (raw.trim()) {
      case 'none':
        return AgeRestrictionMode.none;
      case 'min':
        return AgeRestrictionMode.min;
      case 'max':
        return AgeRestrictionMode.max;
      case 'range':
        return AgeRestrictionMode.range;
      default:
        return null;
    }
  }

  static AgeReference _referenceFromName(String raw) {
    switch (raw.trim()) {
      case 'yearEnd':
        return AgeReference.yearEnd;
      case 'registration':
        return AgeReference.registration;
      default:
        return AgeReference.tournamentStart;
    }
  }

  static CategoryAgeRestriction _fromAgeBand(String ageBand, AgeReference ref) {
    final band = ageBand.trim().toLowerCase();
    if (band.isEmpty || band == 'open') return CategoryAgeRestriction(mode: AgeRestrictionMode.none, reference: ref);
    if (band.startsWith('sub')) {
      final n = int.tryParse(band.substring(3));
      if (n != null) {
        return CategoryAgeRestriction(mode: AgeRestrictionMode.max, maxAge: n, reference: ref);
      }
    }
    if (band.startsWith('plus')) {
      final n = int.tryParse(band.substring(4));
      if (n != null) {
        return CategoryAgeRestriction(mode: AgeRestrictionMode.min, minAge: n, reference: ref);
      }
    }
    return CategoryAgeRestriction(mode: AgeRestrictionMode.none, reference: ref);
  }

  bool isAgeEligible(int age) {
    switch (mode) {
      case AgeRestrictionMode.min:
        return minAge == null || age >= minAge!;
      case AgeRestrictionMode.max:
        return maxAge == null || age <= maxAge!;
      case AgeRestrictionMode.range:
        return (minAge == null || age >= minAge!) &&
            (maxAge == null || age <= maxAge!);
      case AgeRestrictionMode.none:
        return true;
    }
  }

  String get label {
    switch (mode) {
      case AgeRestrictionMode.min:
        return minAge != null ? '$minAge+ anos' : 'idade mínima';
      case AgeRestrictionMode.max:
        return maxAge != null ? 'até $maxAge anos' : 'idade máxima';
      case AgeRestrictionMode.range:
        if (minAge != null && maxAge != null) return '$minAge–$maxAge anos';
        if (minAge != null) return '$minAge+ anos';
        if (maxAge != null) return 'até $maxAge anos';
        return 'faixa etária';
      case AgeRestrictionMode.none:
        return 'livre';
    }
  }
}

abstract final class CategoryAgeEligibility {
  CategoryAgeEligibility._();

  static DateTime? parseBirthDate(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final iso = AthleteFirestoreCodes.birthDateBrToIso(raw) ?? raw.trim();
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso);
    if (m == null) return null;
    return DateTime(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
  }

  static int computeAge({
    required DateTime birthDate,
    required AgeReference reference,
    DateTime? tournamentStart,
    DateTime? now,
  }) {
    final clock = now ?? DateTime.now();
    if (reference == AgeReference.yearEnd) {
      final refYear = (tournamentStart ?? clock).year;
      return refYear - birthDate.year;
    }
    final ref = reference == AgeReference.registration
        ? clock
        : (tournamentStart ?? clock);
    var age = ref.year - birthDate.year;
    final beforeBirthday = ref.month < birthDate.month ||
        (ref.month == birthDate.month && ref.day < birthDate.day);
    if (beforeBirthday) age -= 1;
    return age;
  }

  /// Avalia a elegibilidade etária do atleta para a categoria.
  static AgeEligibility evaluate(
    TournamentCategoryOffer offer,
    AthleteProfile? profile, {
    DateTime? tournamentStart,
    DateTime? now,
  }) {
    final restriction = CategoryAgeRestriction.fromOffer(offer);
    if (!restriction.hasLimit) return AgeEligibility.eligible;

    final birthDate = parseBirthDate(profile?.birthDate);
    if (birthDate == null) return AgeEligibility.missingBirthDate;

    final age = computeAge(
      birthDate: birthDate,
      reference: restriction.reference,
      tournamentStart: tournamentStart,
      now: now,
    );
    return restriction.isAgeEligible(age)
        ? AgeEligibility.eligible
        : AgeEligibility.outOfRange;
  }

  static bool isCategoryEligibleForAthlete(
    TournamentCategoryOffer offer,
    AthleteProfile? profile, {
    DateTime? tournamentStart,
    DateTime? now,
  }) {
    return evaluate(offer, profile, tournamentStart: tournamentStart, now: now) ==
        AgeEligibility.eligible;
  }

  static String blockBadgeLabel(AgeEligibility result) {
    return result == AgeEligibility.missingBirthDate
        ? 'COMPLETE SUA DATA DE NASCIMENTO'
        : 'FORA DA FAIXA ETÁRIA';
  }

  static String blockMessage(
    TournamentCategoryOffer offer,
    AgeEligibility result,
  ) {
    if (result == AgeEligibility.missingBirthDate) {
      return 'Informe sua data de nascimento no perfil para se inscrever '
          'nesta categoria.';
    }
    final restriction = CategoryAgeRestriction.fromOffer(offer);
    return 'Você está fora da faixa etária desta categoria '
        '(${restriction.label}).';
  }
}
