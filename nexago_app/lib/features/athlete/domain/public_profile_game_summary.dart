import 'athlete_privacy_preferences.dart';
import 'athlete_public_profile_models.dart';
import 'match_history/athlete_match_history_models.dart';

/// Números do perfil público que o professor lê de relance: jogos de torneio,
/// vitórias, posição no ranking e torneios disputados.
///
/// Tudo sai do que o perfil público já carrega para qualquer visitante
/// (`athletePublicMatchHistoryProvider` e `athletePublicRankingProvider`) —
/// nada aqui é exclusivo do professor.
class PublicProfileGameSummary {
  const PublicProfileGameSummary({
    this.matches = 0,
    this.wins = 0,
    this.tournaments = 0,
    this.rank,
    this.recentForm = const [],
  });

  final int matches;
  final int wins;
  final int tournaments;
  final int? rank;

  /// Resultado das últimas partidas, da mais recente para a mais antiga.
  final List<bool> recentForm;

  int get losses => matches - wins;

  /// `null` sem partida: "0%" leria como "perde tudo".
  int? get winRatePercent =>
      matches == 0 ? null : (wins * 100 / matches).round();

  bool get hasRank => rank != null && rank! > 0;
}

/// Quantas partidas entram na "forma recente".
const kPublicProfileRecentFormSize = 5;

PublicProfileGameSummary summarizePublicProfileGames({
  AthleteMatchHistoryBundle? history,
  AthletePublicRankingSnapshot? ranking,
}) {
  final matches = [...?history?.matches]
    ..sort((a, b) => b.playedAt.compareTo(a.playedAt));
  return PublicProfileGameSummary(
    matches: matches.length,
    wins: matches.where((m) => m.isWin).length,
    tournaments: history?.tournaments.length ?? 0,
    rank: ranking?.hasRank == true ? ranking!.rank : null,
    recentForm: [
      for (final m in matches.take(kPublicProfileRecentFormSize)) m.isWin,
    ],
  );
}

/// Linha de prévia do card "Perfil público" na página do aluno:
/// `"34 jogos · 2 torneios · #38 no ranking"`. Vazia sem nenhum número.
String publicProfilePreviewLine(PublicProfileGameSummary s) {
  final parts = <String>[
    if (s.matches > 0) '${s.matches} jogo${s.matches == 1 ? '' : 's'}',
    if (s.tournaments > 0)
      '${s.tournaments} torneio${s.tournaments == 1 ? '' : 's'}',
    if (s.hasRank) '#${s.rank} no ranking',
  ];
  return parts.join(' · ');
}

/// Texto da nota "para o professor" a partir dos números reais.
String publicProfileProfessorNote(PublicProfileGameSummary s) {
  if (s.matches == 0) {
    return 'Ainda sem partidas de torneio registradas. A avaliação técnica é '
        'o melhor registro da evolução por enquanto.';
  }
  final form = s.recentForm;
  final formWins = form.where((w) => w).length;
  final formLine = form.length < 2
      ? ''
      : ' Nos ${form.length} últimos: ${formWins}V · '
          '${form.length - formWins}D.';
  return '${s.wins} vitória${s.wins == 1 ? '' : 's'} em ${s.matches} '
      'partida${s.matches == 1 ? '' : 's'} de torneio '
      '(${s.winRatePercent}%).$formLine';
}

/// O que o visitante vê, segundo a privacidade escolhida pelo atleta.
///
/// O professor NÃO recebe nada a mais: perfil privado fica fechado para ele
/// como para qualquer pessoa. Na visão do professor, "Parceiros frequentes"
/// desligado também esconde as duplas — o atleta disse "o que outros veem".
class PublicProfileVisibility {
  const PublicProfileVisibility({
    required this.blocked,
    required this.showPartners,
  });

  final bool blocked;
  final bool showPartners;
}

PublicProfileVisibility publicProfileVisibilityFor(
  AthletePrivacyPreferences prefs, {
  required bool isSelf,
  required bool professorView,
}) {
  if (isSelf) {
    return const PublicProfileVisibility(blocked: false, showPartners: true);
  }
  return PublicProfileVisibility(
    blocked: prefs.isProfilePrivate,
    // A visão comum segue como era (mostra as duplas); a do professor
    // respeita o interruptor.
    showPartners: !professorView || prefs.showOthers.frequentPartners,
  );
}
