import 'package:flutter/material.dart';

import 'achievement_category.dart';
import 'achievement_unlock_rule.dart';

/// Definição estática de uma conquista (catálogo no app).
class AchievementDefinition {
  const AchievementDefinition({
    required this.id,
    required this.category,
    required this.title,
    required this.description,
    required this.icon,
    required this.xpReward,
    required this.rule,
    required this.sortOrder,
  });

  final String id;
  final AchievementCategory category;
  final String title;
  final String description;
  final IconData icon;
  final int xpReward;
  final AchievementUnlockRule rule;
  final int sortOrder;
}
