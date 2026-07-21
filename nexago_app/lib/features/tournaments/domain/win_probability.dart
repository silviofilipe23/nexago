import 'dart:math' as math;

/// Probabilidade pré-partida a partir do rating técnico Glicko-2 já exposto
/// pelo app (`athleteRatings/{uid}_{sportCode}`, campo `rating`, escala
/// pública ~1500). Cálculo 100% client-side (sem Cloud Function): os
/// documentos de rating das duas partes já são de leitura pública.

/// Rating "composto" de uma dupla: média simples dos ratings individuais.
/// Mesma convenção de "jogador composto" documentada no backend em
/// `functions/src/glicko.ts` (`compositeTeamRating`), replicada aqui porque
/// o app não tem acesso a essa função — só a composição simples, não o
/// Glicko-2 inteiro (RD/volatilidade ficam exclusivamente no backend).
double compositeTeamRating(List<double> memberRatings) {
  if (memberRatings.isEmpty) return 1500;
  final sum = memberRatings.reduce((a, b) => a + b);
  return sum / memberRatings.length;
}

/// Probabilidade de o lado A vencer o lado B, fórmula logística padrão na
/// escala pública (400) — mesma convenção do Elo/Glicko em escala 1500/400.
double winProbability({required double ratingA, required double ratingB}) =>
    1 / (1 + math.pow(10, (ratingB - ratingA) / 400));
