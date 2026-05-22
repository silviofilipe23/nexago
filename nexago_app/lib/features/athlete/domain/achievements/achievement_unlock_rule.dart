/// Regra declarativa para progresso e desbloqueio de uma conquista.
sealed class AchievementUnlockRule {
  const AchievementUnlockRule();

  const factory AchievementUnlockRule.onboardingCompleted() =
      OnboardingCompletedRule;

  const factory AchievementUnlockRule.totalGames({required int target}) =
      TotalGamesRule;

  const factory AchievementUnlockRule.streak({required int target}) =
      StreakRule;

  const factory AchievementUnlockRule.gamesInLastDays({
    required int days,
    required int target,
  }) = GamesInLastDaysRule;

  const factory AchievementUnlockRule.profileStepsDone({required int target}) =
      ProfileStepsDoneRule;

  const factory AchievementUnlockRule.profileAllComplete() =
      ProfileAllCompleteRule;

  const factory AchievementUnlockRule.identityComplete() =
      IdentityCompleteRule;

  const factory AchievementUnlockRule.invitesCount({required int target}) =
      InvitesCountRule;

  const factory AchievementUnlockRule.profileSharesCount({required int target}) =
      ProfileSharesCountRule;

  const factory AchievementUnlockRule.attendanceConfirmations({
    required int target,
  }) = AttendanceConfirmationsRule;

  const factory AchievementUnlockRule.attendanceStreak({required int target}) =
      AttendanceStreakRule;

  const factory AchievementUnlockRule.totalBookings({required int target}) =
      TotalBookingsRule;

  const factory AchievementUnlockRule.favoriteArenasCount({required int target}) =
      FavoriteArenasCountRule;

  const factory AchievementUnlockRule.checkInsCount({required int target}) =
      CheckInsCountRule;
}

final class OnboardingCompletedRule extends AchievementUnlockRule {
  const OnboardingCompletedRule();
}

final class TotalGamesRule extends AchievementUnlockRule {
  const TotalGamesRule({required this.target});
  final int target;
}

final class StreakRule extends AchievementUnlockRule {
  const StreakRule({required this.target});
  final int target;
}

final class GamesInLastDaysRule extends AchievementUnlockRule {
  const GamesInLastDaysRule({required this.days, required this.target});
  final int days;
  final int target;
}

final class ProfileStepsDoneRule extends AchievementUnlockRule {
  const ProfileStepsDoneRule({required this.target});
  final int target;
}

final class ProfileAllCompleteRule extends AchievementUnlockRule {
  const ProfileAllCompleteRule();
}

final class IdentityCompleteRule extends AchievementUnlockRule {
  const IdentityCompleteRule();
}

final class InvitesCountRule extends AchievementUnlockRule {
  const InvitesCountRule({required this.target});
  final int target;
}

final class ProfileSharesCountRule extends AchievementUnlockRule {
  const ProfileSharesCountRule({required this.target});
  final int target;
}

final class AttendanceConfirmationsRule extends AchievementUnlockRule {
  const AttendanceConfirmationsRule({required this.target});
  final int target;
}

final class AttendanceStreakRule extends AchievementUnlockRule {
  const AttendanceStreakRule({required this.target});
  final int target;
}

final class TotalBookingsRule extends AchievementUnlockRule {
  const TotalBookingsRule({required this.target});
  final int target;
}

final class FavoriteArenasCountRule extends AchievementUnlockRule {
  const FavoriteArenasCountRule({required this.target});
  final int target;
}

final class CheckInsCountRule extends AchievementUnlockRule {
  const CheckInsCountRule({required this.target});
  final int target;
}
