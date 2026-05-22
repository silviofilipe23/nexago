import 'package:flutter/material.dart';

/// Categorias da tela Conquistas (protótipo 03).
enum AchievementCategory {
  primeirosPassos,
  constancia,
  social;

  String get label => switch (this) {
        AchievementCategory.primeirosPassos => 'PRIMEIROS PASSOS',
        AchievementCategory.constancia => 'CONSTÂNCIA',
        AchievementCategory.social => 'SOCIAL',
      };

  IconData get headerIcon => switch (this) {
        AchievementCategory.primeirosPassos => Icons.local_fire_department_rounded,
        AchievementCategory.constancia => Icons.fitness_center_rounded,
        AchievementCategory.social => Icons.person_add_alt_1_rounded,
      };

  static const displayOrder = [
    AchievementCategory.primeirosPassos,
    AchievementCategory.constancia,
    AchievementCategory.social,
  ];
}
