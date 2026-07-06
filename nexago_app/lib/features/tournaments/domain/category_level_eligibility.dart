import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_options.dart';
import 'tournament_discovery_models.dart';

/// Elegibilidade de categoria por nível do atleta (anti-sandbagging).
///
/// Regra: o atleta pode disputar a própria categoria ou categorias ACIMA do seu
/// nível, nunca ABAIXO. Ranks unificados (escada de 5 do vôlei):
/// Iniciante 1 (0) < Iniciante 2 (1) < Intermediário 1 (2) <
/// Intermediário 2 (3) < Open (5) — legados como o degrau inferior do split.
///
/// Pré-validação da UI, alinhada ao backend autoritativo
/// (`functions/src/category-level-eligibility.ts`). Resolve o nível do atleta
/// **por esporte** (`levelsBySportFirestore`) a partir do esporte do torneio,
/// com fallback no nível global do perfil.
abstract final class CategoryLevelEligibility {
  CategoryLevelEligibility._();

  static const int _highestRank = 5;

  /// Esporte do torneio (`tournaments/{id}.sport`, nome do enum) → código de
  /// esporte do perfil (`levelsBySportFirestore`). `null` quando não há
  /// equivalente (ex.: `footvolley`) — nesse caso usa-se o nível global.
  static String? tournamentSportToLevelSportCode(String? sport) {
    switch (sport?.trim().toLowerCase()) {
      case 'beachvolleyball':
        return 'VOLEI_PRAIA';
      case 'indoorvolleyball':
        return 'VOLEI_QUADRA';
      default:
        return null;
    }
  }

  /// Rank do nível a partir de label (`Open`) ou código (`open`); legados inclusos.
  /// `null` quando ausente/desconhecido.
  static int? levelRank(String? raw) => AthleteProfileOptions.levelRank(raw);

  /// Rank do nível da categoria; categoria sem nível → Open (aceita todos).
  static int categoryLevelRank(TournamentCategoryOffer offer) {
    return levelRank(offer.level) ?? _highestRank;
  }

  /// Rank do nível do atleta para o esporte do torneio: por esporte
  /// (`levelsBySportFirestore[code]`) → nível global → Iniciante (permissivo).
  ///
  /// [tournamentSport] é o esporte cru do torneio (`TournamentDetail.sport`);
  /// quando vazio/sem equivalente, usa apenas o nível global.
  static int athleteLevelRank(AthleteProfile? profile, {String? tournamentSport}) {
    if (profile == null) return 0;

    final sportCode = tournamentSportToLevelSportCode(tournamentSport);
    if (sportCode != null) {
      final perSport = levelRank(profile.levelsBySportFirestore[sportCode]);
      if (perSport != null) return perSport;
    }

    return levelRank(profile.level) ?? 0;
  }

  /// O atleta (rank) é elegível para a categoria? `categoryRank >= athleteRank`.
  static bool isCategoryEligibleForLevel(
    TournamentCategoryOffer offer,
    int athleteRank,
  ) {
    return categoryLevelRank(offer) >= athleteRank;
  }

  /// Atalho usando o perfil diretamente, considerando o esporte do torneio.
  static bool isCategoryEligibleForAthlete(
    TournamentCategoryOffer offer,
    AthleteProfile? profile, {
    String? tournamentSport,
  }) {
    return isCategoryEligibleForLevel(
      offer,
      athleteLevelRank(profile, tournamentSport: tournamentSport),
    );
  }

  /// Mensagem curta para o card quando a categoria está abaixo do nível do atleta.
  static String blockBadgeLabel() => 'ABAIXO DO SEU NÍVEL';

  /// Mensagem explicativa (snackbar/diálogo) ao tentar uma categoria inferior.
  static String blockMessage(AthleteProfile? profile, {String? tournamentSport}) {
    final rank = athleteLevelRank(profile, tournamentSport: tournamentSport);
    final label = AthleteProfileOptions.labelForRank(rank);
    return 'Seu nível ($label) não permite categorias inferiores. '
        'Escolha uma categoria igual ou superior.';
  }
}
