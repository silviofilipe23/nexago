import 'package:flutter/material.dart';

/// Metadado de esporte no onboarding.
class OnboardingSportOption {
  const OnboardingSportOption({
    required this.id,
    required this.label,
    required this.icon,
    this.dimmed = false,
  });

  final String id;
  final String label;
  final IconData icon;
  final bool dimmed;
}

/// Metadado de objetivo no onboarding.
class OnboardingGoalOption {
  const OnboardingGoalOption({
    required this.id,
    required this.label,
    required this.description,
    required this.icon,
  });

  final String id;
  final String label;
  final String description;
  final IconData icon;
}

/// Metadado de nível no onboarding.
class OnboardingLevelOption {
  const OnboardingLevelOption({required this.label, required this.description});

  final String label;
  final String description;
}

abstract final class AthleteOnboardingOptions {
  AthleteOnboardingOptions._();

  static const int totalSteps = 5;

  static const List<OnboardingSportOption> sports = [
    OnboardingSportOption(
      id: 'beach_volleyball',
      label: 'Vôlei de praia',
      icon: Icons.sports_volleyball_outlined,
    ),
    OnboardingSportOption(
      id: 'indoor_volleyball',
      label: 'Vôlei de quadra',
      icon: Icons.sports_volleyball,
    ),
    OnboardingSportOption(
      id: 'football',
      label: 'Futebol',
      icon: Icons.sports_soccer_outlined,
    ),
    OnboardingSportOption(
      id: 'basketball',
      label: 'Basquete',
      icon: Icons.sports_basketball_outlined,
    ),
    OnboardingSportOption(
      id: 'tennis',
      label: 'Tênis',
      icon: Icons.sports_tennis_outlined,
    ),
    OnboardingSportOption(
      id: 'beach_tennis',
      label: 'Beach tennis',
      icon: Icons.sports_tennis,
    ),
    OnboardingSportOption(
      id: 'running',
      label: 'Corrida',
      icon: Icons.directions_run_rounded,
    ),
    OnboardingSportOption(
      id: 'other',
      label: 'Outros',
      icon: Icons.more_horiz_rounded,
      dimmed: true,
    ),
  ];

  static const List<OnboardingLevelOption> levels = [
    OnboardingLevelOption(
      label: 'Iniciante',
      description: 'Estou começando ou jogo pouco tempo.',
    ),
    OnboardingLevelOption(
      label: 'Básico',
      description: 'Já jogo com regularidade, mas não tenho muita técnica.',
    ),
    OnboardingLevelOption(
      label: 'Intermediário',
      description: 'Jogo com regularidade e tenho muita experiência.',
    ),
    OnboardingLevelOption(
      label: 'Avançado',
      description: 'Boa técnica e bastante experiência de quadra.',
    ),
    OnboardingLevelOption(
      label: 'Open',
      description: 'Participo de torneios e busco performance.',
    ),
  ];

  static const List<OnboardingGoalOption> goals = [
    OnboardingGoalOption(
      id: 'book_arena',
      label: 'Reservar arena',
      description: 'Encontrar uma arena pra jogar.',
      icon: Icons.location_city_outlined,
    ),
    OnboardingGoalOption(
      id: 'play_fun',
      label: 'Jogar por diversão',
      description: 'Curtir com amigos, sem pressão.',
      icon: Icons.sports_outlined,
    ),
    OnboardingGoalOption(
      id: 'compete',
      label: 'Competir',
      description: 'Torneios, ligas e ranking.',
      icon: Icons.emoji_events_outlined,
    ),
    OnboardingGoalOption(
      id: 'improve',
      label: 'Melhorar desempenho',
      description: 'Treinos e evolução constante.',
      icon: Icons.trending_up_rounded,
    ),
    OnboardingGoalOption(
      id: 'meet_people',
      label: 'Conhecer pessoas',
      description: 'Comunidade e novas conexões.',
      icon: Icons.groups_outlined,
    ),
    OnboardingGoalOption(
      id: 'train_regularly',
      label: 'Treinar regularmente',
      description: 'Criar uma rotina esportiva.',
      icon: Icons.event_available_outlined,
    ),
  ];

  static String? sportLabelById(String? id) {
    if (id == null || id.isEmpty) return null;
    for (final s in sports) {
      if (s.id == id) return s.label;
    }
    return null;
  }

  static OnboardingSportOption? sportById(String? id) {
    if (id == null || id.isEmpty) return null;
    for (final s in sports) {
      if (s.id == id) return s;
    }
    return null;
  }
}
