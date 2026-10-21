import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/athlete_public_profile_models.dart';
import '../../athlete/domain/athlete_public_profile_providers.dart';
import '../../athlete/domain/match_history/athlete_match_history_models.dart';
import '../../athlete/domain/public_profile_game_summary.dart';

/// Prévia do perfil público do aluno no card "Perfil público" (I1).
///
/// Lê o MESMO que o perfil público mostra a qualquer visitante: com o perfil
/// privado, vem só [restricted] — sem número nenhum.
class ProfessorStudentProfilePreview {
  const ProfessorStudentProfilePreview({
    this.restricted = false,
    this.sportLevel,
    this.summary = const PublicProfileGameSummary(),
  });

  const ProfessorStudentProfilePreview.restricted()
      : this(restricted: true);

  final bool restricted;

  /// `"Beach Tennis · Iniciante"` — esporte principal e nível.
  final String? sportLevel;
  final PublicProfileGameSummary summary;

  /// Subtítulo do card.
  String get subtitle {
    if (restricted) return 'Perfil privado · resultados ocultos pelo atleta';
    final line = publicProfilePreviewLine(summary);
    final parts = [
      if (sportLevel != null && sportLevel!.isNotEmpty) sportLevel!,
      if (line.isNotEmpty) line,
    ];
    return parts.isEmpty ? 'Jogos, torneios e ranking' : parts.join(' · ');
  }
}

/// `null` = atleta sem perfil (ou ainda carregando no stream).
final professorStudentProfilePreviewProvider = FutureProvider.autoDispose
    .family<ProfessorStudentProfilePreview?, String>((ref, athleteId) async {
  final id = athleteId.trim();
  if (id.isEmpty) return null;
  final profile = await ref.watch(athleteProfileByIdProvider(id).future);
  if (profile == null) return null;
  if (profile.privacyPreferences.isProfilePrivate) {
    return const ProfessorStudentProfilePreview.restricted();
  }

  // Ranking e histórico são extras: se um falhar, o card segue sem o número.
  final ranking = await ref
      .watch(athletePublicRankingProvider(id).future)
      .then<AthletePublicRankingSnapshot?>((v) => v, onError: (_) => null);
  final history = await ref
      .watch(athletePublicMatchHistoryProvider(id).future)
      .then<AthleteMatchHistoryBundle?>((v) => v, onError: (_) => null);

  final primary = buildPublicSportEntries(profile)
      .where((e) => e.isPrimary)
      .firstOrNull;
  final sportLevel = primary == null
      ? null
      : [
          primary.label,
          if (primary.levelLabel.trim().isNotEmpty) primary.levelLabel.trim(),
        ].join(' · ');

  return ProfessorStudentProfilePreview(
    sportLevel: sportLevel,
    summary: summarizePublicProfileGames(history: history, ranking: ranking),
  );
});
