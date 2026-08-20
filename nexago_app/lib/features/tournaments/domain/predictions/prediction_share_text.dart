import 'package:nexago_app/core/links/nexago_links.dart';

import 'tournament_predictions_logic.dart';

export 'package:nexago_app/core/links/nexago_links.dart' show kAthletePortalBaseUrl;

/// Texto, link e conteúdo do card de compartilhamento do ranking de palpites.
///
/// Módulo puro (sem Flutter, sem Firestore): o desenho fica em
/// `presentation/widgets/predictions/prediction_share_card_painter.dart`; aqui
/// mora a decisão do QUE mostrar. Espelha `predictions-share.ts` do portal do
/// atleta — as duas superfícies compartilham a mesma imagem e o mesmo texto.

/// Quantas posições do topo entram na imagem.
const int kPredictionShareTopCount = 3;



class PredictionShareRow {
  const PredictionShareRow({
    required this.rank,
    required this.name,
    required this.score,
    required this.isMe,
  });

  final int rank;
  final String name;
  final int score;
  final bool isMe;
}

class PredictionShareData {
  const PredictionShareData({
    required this.tournamentName,
    required this.top,
    required this.me,
    required this.totalPlayers,
    required this.urlLabel,
  });

  final String? tournamentName;

  /// O pódio — até três linhas. Menos que isso quando ainda tem pouca gente.
  final List<PredictionShareRow> top;

  /// A linha do próprio atleta, SÓ quando ele está fora do pódio: dentro dele
  /// a linha destacada já é a mesma pessoa.
  final PredictionShareRow? me;

  final int totalPlayers;

  /// Impressa no rodapé do card, sem `https://` para não virar linha de código.
  final String urlLabel;
}

/// "Marcelo Antunes" → "Marcelo A.". Preserva o primeiro nome inteiro (é como a
/// pessoa se reconhece) e reduz o resto à inicial.
String shortDisplayName(String? fullName) {
  final parts = (fullName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'Atleta';
  if (parts.length == 1) return parts.first;
  return '${parts.first} ${parts.last[0].toUpperCase()}.';
}

/// `/torneios/{id}/palpites` no portal do atleta. A rota é protegida, mas o
/// guard leva o destino em `?redirect=` e atravessa o onboarding — quem não tem
/// conta cadastra e cai exatamente aqui.
String predictionShareUrl(String tournamentId, {String base = kAthletePortalBaseUrl}) {
  final origin = base.replaceAll(RegExp(r'/+$'), '');
  return '$origin/torneios/${tournamentId.trim()}/palpites';
}

PredictionShareData buildPredictionShareData({
  required String? tournamentName,
  required List<PredictionLeaderboardRow> leaderboard,
  required String url,
}) {
  PredictionShareRow rowOf(PredictionLeaderboardRow row) => PredictionShareRow(
        rank: row.entry.rank,
        name: shortDisplayName(row.entry.displayName),
        score: row.entry.points,
        isMe: row.entry.isCurrentUser,
      );

  final top = leaderboard.take(kPredictionShareTopCount).map(rowOf).toList();

  PredictionLeaderboardRow? mine;
  for (final row in leaderboard) {
    if (row.entry.isCurrentUser) {
      mine = row;
      break;
    }
  }

  final name = tournamentName?.trim();
  return PredictionShareData(
    tournamentName: name != null && name.isNotEmpty ? name : null,
    top: top,
    me: mine != null && mine.entry.rank > kPredictionShareTopCount
        ? rowOf(mine)
        : null,
    totalPlayers: leaderboard.length,
    urlLabel: url.replaceFirst(RegExp(r'^https?://'), ''),
  );
}

/// Legenda que acompanha a imagem na folha nativa. Curta de propósito: no
/// WhatsApp o texto longo come o espaço do preview.
String predictionShareText(PredictionShareData data, String url) {
  final where = data.tournamentName != null ? ' do ${data.tournamentName}' : '';
  final me = data.me;
  if (me != null) {
    return 'Estou em #${me.rank} no ranking de palpites$where. Dá o seu: $url';
  }
  final leader = data.top.isNotEmpty ? data.top.first : null;
  if (leader == null) return 'Ranking de palpites$where: $url';
  if (leader.isMe) {
    return 'Estou liderando o ranking de palpites$where. Vem tentar: $url';
  }
  return '${leader.name} lidera o ranking de palpites$where. Dá o seu: $url';
}
