/// Status canônico de partida (PascalCase no Firestore).
abstract final class TournamentMatchStatus {
  TournamentMatchStatus._();

  static const scheduled = 'Scheduled';
  static const inProgress = 'In Progress';
  static const completed = 'Completed';
  static const canceled = 'Canceled';

  /// Chave normalizada para comparar legado (`in_progress`, etc.).
  static String canonicalKey(String status) =>
      status.trim().toLowerCase().replaceAll('_', ' ');

  /// Converte legado para valor canônico quando reconhecido.
  static String normalize(String status) {
    return switch (canonicalKey(status)) {
      'scheduled' => scheduled,
      'in progress' => inProgress,
      'completed' => completed,
      'canceled' || 'cancelled' => canceled,
      _ => status,
    };
  }

  static bool isCompleted(String status) =>
      canonicalKey(status) == canonicalKey(completed);

  static bool isInProgress(String status) =>
      canonicalKey(status) == canonicalKey(inProgress);

  static bool isScheduled(String status) =>
      canonicalKey(status) == canonicalKey(scheduled);

  static bool isCanceled(String status) =>
      canonicalKey(status) == canonicalKey(canceled);
}
