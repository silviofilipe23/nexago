import '../../athlete/domain/athlete_profile.dart';
import 'tournament_discovery_models.dart';
import 'tournament_registration_logic.dart';

/// Elegibilidade de categoria por gênero do atleta (pré-validação na UI).
///
/// Regra: o atleta pode se inscrever em categorias do próprio gênero ou Misto.
abstract final class CategoryGenderEligibility {
  CategoryGenderEligibility._();

  static bool isCategoryEligibleForAthlete(
    TournamentCategoryOffer offer,
    AthleteProfile? profile,
  ) {
    return athleteMatchesCategoryGender(offer, profile?.gender);
  }

  static String blockBadgeLabel() => 'GÊNERO INCOMPATÍVEL';

  static String blockMessage(
    TournamentCategoryOffer offer,
    AthleteProfile? profile,
  ) {
    final categoryGender = categoryGenderDisplayLabel(offer);
    final athleteGender = profile?.gender?.trim();
    if (athleteGender == null || athleteGender.isEmpty) {
      if (categoryGender.isEmpty || categoryGender == 'Misto') {
        return 'Informe seu gênero no perfil para continuar a inscrição.';
      }
      return 'Informe seu gênero no perfil para se inscrever em categorias '
          '${categoryGender.toLowerCase()}.';
    }
    if (categoryGender.isEmpty) {
      return 'Você só pode se inscrever em categorias do seu gênero ou Misto.';
    }
    return 'Esta categoria é $categoryGender. '
        'Você só pode se inscrever em categorias do seu gênero ou Misto.';
  }
}
