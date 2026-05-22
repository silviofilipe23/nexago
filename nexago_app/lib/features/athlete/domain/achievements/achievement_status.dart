import 'achievement_catalog.dart';
import 'achievement_category.dart';
import 'achievement_definition.dart';

/// Estado de uma conquista para a UI.
sealed class AchievementStatus {
  const AchievementStatus();
}

final class AchievementLocked extends AchievementStatus {
  const AchievementLocked();
}

final class AchievementInProgress extends AchievementStatus {
  const AchievementInProgress({
    required this.current,
    required this.target,
    required this.progress,
  });

  final int current;
  final int target;
  final double progress;
}

final class AchievementUnlocked extends AchievementStatus {
  const AchievementUnlocked({this.unlockedAt});

  final DateTime? unlockedAt;
}

class AchievementViewModel {
  const AchievementViewModel({
    required this.definition,
    required this.status,
  });

  final AchievementDefinition definition;
  final AchievementStatus status;

  bool get isUnlocked => status is AchievementUnlocked;
  bool get isInProgress => status is AchievementInProgress;
}

class AchievementsScreenState {
  const AchievementsScreenState({
    required this.items,
    required this.unlockedCount,
    required this.inProgressCount,
    required this.totalCount,
  });

  final List<AchievementViewModel> items;
  final int unlockedCount;
  final int inProgressCount;
  final int totalCount;

  static const empty = AchievementsScreenState(
    items: [],
    unlockedCount: 0,
    inProgressCount: 0,
    totalCount: AchievementCatalog.totalCount,
  );

  List<AchievementViewModel> forCategory(AchievementCategory category) {
    return items.where((i) => i.definition.category == category).toList();
  }
}
