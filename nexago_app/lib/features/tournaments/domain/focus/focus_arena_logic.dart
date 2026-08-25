/// As duas listas da seção Arena. O segmento é o que o atleta escolhe nos
/// chips do topo — não são contadores, são as duas visões da arena.
enum FocusArenaSegment { live, upcoming }

/// "4 partidas em quadra agora." — a manchete do topo.
///
/// Fala do que está EM QUADRA mesmo quando o atleta está lendo a fila: é a
/// resposta à pergunta que traz ele para esta seção.
String focusArenaHeadline(int liveCount) {
  if (liveCount <= 0) return 'Nenhuma partida em quadra agora.';
  if (liveCount == 1) return '1 partida em quadra agora.';
  return '$liveCount partidas em quadra agora.';
}

/// "4 EM QUADRA" / "3 A SEGUIR".
///
/// "EM QUADRA", e não "QUADRAS": o número é de PARTIDAS, e contar quadras
/// discordaria da manchete no dia em que o dado trouxer dois jogos na mesma
/// quadra.
String focusArenaSegmentLabel(FocusArenaSegment segment, int count) {
  return switch (segment) {
    FocusArenaSegment.live => '$count EM QUADRA',
    FocusArenaSegment.upcoming => '$count A SEGUIR',
  };
}

/// Onde a seção abre.
///
/// Sem nada em quadra e com fila cheia, abrir no ao vivo mostraria uma lista
/// vazia com o conteúdo escondido atrás de um toque.
FocusArenaSegment focusArenaInitialSegment({
  required int liveCount,
  required int upcomingCount,
}) {
  if (liveCount == 0 && upcomingCount > 0) return FocusArenaSegment.upcoming;
  return FocusArenaSegment.live;
}
