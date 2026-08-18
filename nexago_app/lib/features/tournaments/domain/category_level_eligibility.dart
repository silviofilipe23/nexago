import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_options.dart';
import 'tournament_discovery_models.dart';

/// Elegibilidade de categoria por nível do atleta (anti-sandbagging) e por
/// piso mínimo da categoria.
///
/// Regra: o atleta pode disputar a própria categoria ou categorias ACIMA do seu
/// nível, nunca ABAIXO. Ranks unificados (escada única de 7, todos os esportes):
/// Iniciante 1 (0) < Iniciante 2 (1) < Intermediário 1 (2) <
/// Intermediário 2 (3) < Avançado 1 (4) < Avançado 2 (5) < Open (6) —
/// legados como o degrau inferior do split.
///
/// Além do teto (`categories[].level`), uma categoria pode declarar um piso
/// (`categories[].minLevel`): o atleta só entra se seu rank estiver DENTRO da
/// faixa `[categoryMinLevelRank, categoryLevelRank]`.
///
/// Pré-validação da UI, alinhada ao backend autoritativo
/// (`functions/src/category-level-eligibility.ts`). Resolve o nível do atleta
/// **por esporte** (`levelsBySportFirestore`) a partir do esporte do torneio,
/// com fallback no nível global do perfil.
abstract final class CategoryLevelEligibility {
  CategoryLevelEligibility._();

  static const int _highestRank = 6;

  /// Esporte do torneio (`tournaments/{id}.sport`, nome do enum) → código de
  /// esporte do perfil (chave de `sportOnboarding.levelsBySport`). `null`
  /// quando não há equivalente — nesse caso usa-se o nível global.
  static String? tournamentSportToLevelSportCode(String? sport) {
    switch (sport?.trim().toLowerCase()) {
      case 'beachvolleyball':
        return 'VOLEI_PRAIA';
      case 'indoorvolleyball':
        return 'VOLEI_QUADRA';
      case 'footvolley':
        return 'FUTEVOLEI';
      case 'beachtennis':
        return 'BEACH_TENNIS';
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

  /// Rank do piso da categoria; ausente/desconhecido → 0 (sem piso).
  static int categoryMinLevelRank(TournamentCategoryOffer offer) {
    return levelRank(offer.minLevel) ?? 0;
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

  /// O atleta (rank) é elegível para a categoria? Precisa estar dentro da
  /// faixa: não pode exceder o teto (`categoryLevelRank`) nem ficar abaixo
  /// do piso (`categoryMinLevelRank`).
  static bool isCategoryEligibleForLevel(
    TournamentCategoryOffer offer,
    int athleteRank,
  ) {
    return categoryLevelRank(offer) >= athleteRank &&
        athleteRank >= categoryMinLevelRank(offer);
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

  /// Janela de calibração (plano de calibração de nível, Task 6): a PRIMEIRA
  /// inscrição do atleta em um esporte merece um último aviso antes de
  /// travar o ratchet "nível só sobe" — [AthleteProfile.levelLocked] é
  /// gravado pelo backend na 1ª inscrição ATIVA daquele esporte.
  ///
  /// `true` quando o esporte do torneio mapeia para um código de esporte do
  /// perfil E esse código ainda não está travado (`levelLocked[code] != true`).
  /// `false` quando já travado, quando o esporte do torneio não tem
  /// equivalente no perfil (sem janela de calibração aplicável) ou quando o
  /// perfil é nulo.
  static bool needsLevelConfirmation(
    AthleteProfile? profile, {
    String? tournamentSport,
  }) {
    if (profile == null) return false;
    final sportCode = tournamentSportToLevelSportCode(tournamentSport);
    if (sportCode == null) return false;
    return profile.levelLocked[sportCode] != true;
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

  /// Selo do card quando o atleta está abaixo do piso da categoria.
  static String minLevelBadgeLabel() => 'NÍVEL MÍNIMO NÃO ATINGIDO';

  /// Mensagem explicativa quando a categoria exige nível mínimo acima do atleta.
  static String minLevelBlockMessage(
    TournamentCategoryOffer offer,
    AthleteProfile? profile, {
    String? tournamentSport,
  }) {
    final minLabel =
        AthleteProfileOptions.labelForRank(categoryMinLevelRank(offer));
    final rank = athleteLevelRank(profile, tournamentSport: tournamentSport);
    final label = AthleteProfileOptions.labelForRank(rank);
    return 'Esta categoria exige nível mínimo $minLabel. Seu nível atual é $label.';
  }
}
