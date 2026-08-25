/// Carregamento inicial do Modo Focus.
///
/// A casca do Focus abria com um `CircularProgressIndicator` seco enquanto o
/// torneio chegava e, logo em seguida, a seção "Agora" abria OUTRO enquanto as
/// partidas chegavam. Dois giradores em sequência, nenhum dizendo o que falta.
///
/// Aqui os passos são FONTES DE DADO REAIS da casca, não enfeite de tempo: o
/// visto verde só acende quando aquele stream chega. Um passo de mentira
/// mentiria justamente no momento em que o atleta está decidindo se sai do app
/// para perguntar o horário na mesa.
library;

/// Os passos do carregamento inicial, na ordem em que a casca os mostra.
enum FocusBootStep {
  /// `tournamentMatchCardsProvider` — as partidas do torneio com nomes e fotos.
  nextMatch('Sua próxima partida'),

  /// `tournamentDetailProvider` + `tournamentUserTeamIdsByCategoryProvider` —
  /// o torneio e os times do atleta, que é o que Trajetória e Grupo desenham.
  journey('Trajetória e grupo'),

  /// `tournamentAnnouncementsProvider` — os recados do organizador.
  announcements('Avisos da arena');

  const FocusBootStep(this.label);

  /// Rótulo do passo, na voz do atleta ("Sua próxima partida", não
  /// "tournamentMatchCards").
  final String label;
}

/// Quais passos já chegaram.
///
/// "Chegou" é ASSENTOU, não "deu certo": um stream que falhou também sai do
/// pendente. Ficar girando para sempre num aviso que a regra do Firestore negou
/// prenderia o atleta numa tela sem saída.
class FocusBootProgress {
  const FocusBootProgress(this.settled);

  /// Nenhum passo assentado — o estado do primeiro quadro.
  static const FocusBootProgress none = FocusBootProgress(<FocusBootStep>{});

  final Set<FocusBootStep> settled;

  bool isDone(FocusBootStep step) => settled.contains(step);

  bool get isComplete => settled.length == FocusBootStep.values.length;

  /// Fração para o anel de progresso (0 a 1).
  double get fraction => settled.length / FocusBootStep.values.length;

  @override
  bool operator ==(Object other) =>
      other is FocusBootProgress &&
      other.settled.length == settled.length &&
      other.settled.containsAll(settled);

  @override
  int get hashCode => Object.hashAllUnordered(settled);
}

/// A casca ainda deve mostrar o loader?
///
/// Três guardas, nesta ordem:
///
/// 1. Sem torneio não há o que desenhar — nem as seções nem a nav sabem o
///    formato da categoria. Segura mesmo depois do prazo.
/// 2. [minimumHoldElapsed] evita o pisca: `tournamentDetailProvider` guarda
///    cache, então reabrir o Focus resolve em milissegundos e o loader
///    apareceria por um quadro só.
/// 3. [deadlineElapsed] é o oposto — um stream que nunca emite (offline, sem
///    cache) não pode prender o atleta. Passado o prazo, entra: cada seção tem
///    o próprio estado de carregamento e de erro.
bool shouldShowFocusBoot({
  required bool hasTournament,
  required FocusBootProgress progress,
  required bool minimumHoldElapsed,
  required bool deadlineElapsed,
}) {
  if (!hasTournament) return true;
  if (!minimumHoldElapsed) return true;
  if (progress.isComplete) return false;
  return !deadlineElapsed;
}
