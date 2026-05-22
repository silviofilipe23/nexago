/// Resultado de [GamificationService.syncProfileCompletionRewards].
class ProfileCompletionSyncResult {
  const ProfileCompletionSyncResult({
    required this.totalXpGained,
    required this.newlyAwardedStepIds,
    required this.profileMarkedComplete,
    required this.unlockedProfileBadge,
  });

  final int totalXpGained;
  final List<String> newlyAwardedStepIds;
  final bool profileMarkedComplete;
  final bool unlockedProfileBadge;

  static const empty = ProfileCompletionSyncResult(
    totalXpGained: 0,
    newlyAwardedStepIds: [],
    profileMarkedComplete: false,
    unlockedProfileBadge: false,
  );
}
