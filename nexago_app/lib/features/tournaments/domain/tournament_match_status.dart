/// Status exatamente como gravado no Firestore (espaço em "In Progress").
abstract final class TournamentMatchStatus {
  TournamentMatchStatus._();

  static const scheduled = 'Scheduled';
  static const inProgress = 'In Progress';
  static const completed = 'Completed';
  static const canceled = 'Canceled';

  static bool isCompleted(String status) =>
      status.trim().toLowerCase() == completed.toLowerCase();

  static bool isInProgress(String status) =>
      status.trim().toLowerCase() == inProgress.toLowerCase();

  static bool isScheduled(String status) =>
      status.trim().toLowerCase() == scheduled.toLowerCase();

  static bool isCanceled(String status) =>
      status.trim().toLowerCase() == canceled.toLowerCase();
}
