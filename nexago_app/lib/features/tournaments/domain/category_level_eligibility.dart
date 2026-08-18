import 'dart:async';

import '../../athlete/domain/athlete_firestore_codes.dart';
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

  /// Aguarda [profileFuture] (ex.: `athleteProfileProvider.future`) e monta
  /// os textos já prontos pra sheet de confirmação de nível — ou `null`
  /// quando `needsLevelConfirmation` decide que não precisa (já travado, sem
  /// esporte equivalente, ou perfil realmente ausente).
  ///
  /// Existe pra fechar um furo de corrida (achado do review de calibração de
  /// nível, I1): ler `athleteProfileProvider.valueOrNull` decide com `null`
  /// tanto quando o perfil está genuinamente ausente quanto quando o stream
  /// SÓ AINDA NÃO EMITIU (carregando) — os dois casos colapsam no mesmo
  /// `null` e o gate pula em silêncio no segundo. Passar o `Future` (não o
  /// snapshot) força esperar a primeira emissão antes de decidir; um
  /// `Future` já resolvido (`Future.value(profile)`) funciona igual — a
  /// diferença só importa quando ele ainda está pendente.
  static Future<LevelConfirmationPrompt?> resolveLevelConfirmationPrompt(
    Future<AthleteProfile?> profileFuture, {
    String? tournamentSport,
  }) async {
    final profile = await profileFuture;
    if (!needsLevelConfirmation(profile, tournamentSport: tournamentSport)) {
      return null;
    }
    final rank = athleteLevelRank(profile, tournamentSport: tournamentSport);
    final sportCode = tournamentSportToLevelSportCode(tournamentSport);
    return LevelConfirmationPrompt(
      levelLabel: AthleteProfileOptions.labelForRank(rank),
      sportLabel:
          AthleteFirestoreCodes.sportFirestoreToLabel(sportCode) ??
              tournamentSport ??
              '',
    );
  }

  /// Como [resolveLevelConfirmationPrompt], mas também AGUARDA o `Future` do
  /// ESPORTE DO TORNEIO em vez de aceitar um valor já resolvido pelo
  /// chamador — fix pós-review (calibração de nível, F2).
  ///
  /// `TournamentPartnerInvitePage._ensureLevelConfirmed` descobria o esporte
  /// de um `AsyncValue<TournamentDetail?>` que, no branch de ERRO da árvore
  /// de widgets, vira `null` — e `needsLevelConfirmation` trata "não sei o
  /// esporte" IGUAL a "esporte sem equivalente no perfil": pula a
  /// confirmação em SILÊNCIO, bem no aceite que pode ser a 1ª inscrição
  /// ativa do atleta naquele esporte (a que tranca a janela de calibração).
  /// Mesma classe de furo que o portal web corrigiu com
  /// `resolveLevelConfirmationPromptForTournament` (buscar o torneio
  /// FRESCO), e a mesma técnica que este arquivo já usa pro PERFIL (ver nota
  /// acima).
  ///
  /// [tournamentSportFuture] busca o esporte de novo (ex.:
  /// `ref.read(tournamentDetailProvider(id).future).then((t) => t?.sport)`)
  /// em vez de confiar no snapshot congelado da árvore de widgets — um
  /// provider vivo resolve o valor já emitido na hora, ou tenta de novo se
  /// ainda não emitiu. Erro real em QUALQUER um dos dois `Future`s ainda
  /// propaga pro chamador — quem decide bloquear a submissão é quem chama.
  ///
  /// Aguarda os dois em PARALELO (`Future.wait`, não `await` sequencial):
  /// aguardar um primeiro e só depois anexar o outro deixaria o segundo sem
  /// handler durante o `await` do primeiro — se ele for rejeitado nesse
  /// intervalo, o Dart marca a rejeição como não tratada mesmo sendo
  /// relançada depois. `Future.wait` (a estática, não o `.wait` de record —
  /// esse embrulha o erro em `ParallelWaitError`) anexa os handlers nos dois
  /// de uma vez e relança o erro ORIGINAL, sem essa janela nem embrulho.
  static Future<LevelConfirmationPrompt?>
  resolveLevelConfirmationPromptForTournament(
    Future<AthleteProfile?> profileFuture,
    Future<String?> tournamentSportFuture,
  ) async {
    AthleteProfile? profile;
    String? tournamentSport;
    await Future.wait<void>([
      profileFuture.then((p) => profile = p),
      tournamentSportFuture.then((s) => tournamentSport = s),
    ]);
    return resolveLevelConfirmationPrompt(
      Future.value(profile),
      tournamentSport: tournamentSport,
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

/// Textos já resolvidos para a sheet de confirmação de nível — ver
/// [CategoryLevelEligibility.resolveLevelConfirmationPrompt].
class LevelConfirmationPrompt {
  const LevelConfirmationPrompt({
    required this.levelLabel,
    required this.sportLabel,
  });

  final String levelLabel;
  final String sportLabel;
}
