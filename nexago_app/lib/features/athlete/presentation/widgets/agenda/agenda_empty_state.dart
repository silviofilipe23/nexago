import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaEmptyState extends StatelessWidget {
  const AgendaEmptyState({
    super.key,
    required this.filter,
    required this.pastTab,
    required this.onPrimaryAction,
    this.searchQuery = '',
  });

  final AthleteAgendaFilter filter;
  final bool pastTab;
  final VoidCallback onPrimaryAction;
  final String searchQuery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final copy = _copyForFilter(
      filter: filter,
      pastTab: pastTab,
      searchQuery: searchQuery.trim(),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
      child: Column(
        children: [
          Icon(
            copy.icon,
            size: 48,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 16),
          Text(
            copy.title,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            copy.hint,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          if (copy.showAction) ...[
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onPrimaryAction,
              icon: Icon(copy.actionIcon, size: 18),
              label: Text(copy.actionLabel),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AgendaEmptyCopy {
  const _AgendaEmptyCopy({
    required this.icon,
    required this.title,
    required this.hint,
    required this.showAction,
    required this.actionLabel,
    required this.actionIcon,
  });

  final IconData icon;
  final String title;
  final String hint;
  final bool showAction;
  final String actionLabel;
  final IconData actionIcon;
}

_AgendaEmptyCopy _copyForFilter({
  required AthleteAgendaFilter filter,
  required bool pastTab,
  required String searchQuery,
}) {
  if (searchQuery.isNotEmpty) {
    return _AgendaEmptyCopy(
      icon: Icons.search_off_rounded,
      title: 'Nada encontrado para "$searchQuery"',
      hint: 'Tente outro termo ou altere o filtro.',
      showAction: !pastTab,
      actionLabel: 'Explorar',
      actionIcon: Icons.explore_outlined,
    );
  }

  if (pastTab) {
    final what = switch (filter) {
      AthleteAgendaFilter.rentals => 'Nenhuma reserva no histórico',
      AthleteAgendaFilter.trainings => 'Nenhum treino no histórico',
      AthleteAgendaFilter.tournaments => 'Nenhum torneio no histórico',
      AthleteAgendaFilter.challenges => 'Nenhum desafio no histórico',
      AthleteAgendaFilter.all => 'Nenhum jogo no histórico',
    };
    return _AgendaEmptyCopy(
      icon: Icons.history_rounded,
      title: what,
      hint: filter == AthleteAgendaFilter.all
          ? 'Seus jogos, aulas e torneios aparecem aqui depois que acontecem.'
          : 'Altere o filtro para ver outros jogos.',
      showAction: false,
      actionLabel: '',
      actionIcon: Icons.history_rounded,
    );
  }

  return switch (filter) {
    AthleteAgendaFilter.rentals => const _AgendaEmptyCopy(
        icon: Icons.sports_tennis_rounded,
        title: 'Nenhuma reserva marcada',
        hint: 'Reserve uma quadra e ela aparecerá na sua agenda.',
        showAction: true,
        actionLabel: 'Reservar quadra',
        actionIcon: Icons.calendar_month_outlined,
      ),
    AthleteAgendaFilter.trainings => const _AgendaEmptyCopy(
        icon: Icons.fitness_center_rounded,
        title: 'Nenhum treino marcado',
        hint: 'Suas aulas com professor aparecem aqui.',
        showAction: true,
        actionLabel: 'Ver treinos',
        actionIcon: Icons.fitness_center_rounded,
      ),
    AthleteAgendaFilter.tournaments => const _AgendaEmptyCopy(
        icon: Icons.emoji_events_outlined,
        title: 'Nenhum torneio marcado',
        hint: 'Inscreva-se em um torneio para acompanhar aqui.',
        showAction: true,
        actionLabel: 'Ver torneios',
        actionIcon: Icons.emoji_events_outlined,
      ),
    AthleteAgendaFilter.challenges => const _AgendaEmptyCopy(
        icon: Icons.bolt_rounded,
        title: 'Nenhum jogo do Bora Jogar marcado',
        hint: 'Seus jogos combinados no Bora Jogar aparecem aqui.',
        showAction: false,
        actionLabel: '',
        actionIcon: Icons.bolt_rounded,
      ),
    AthleteAgendaFilter.all => const _AgendaEmptyCopy(
        icon: Icons.event_busy_rounded,
        title: 'Nada marcado com esse filtro',
        hint: 'Reserve uma quadra ou inscreva-se em um torneio.',
        showAction: true,
        actionLabel: 'Explorar',
        actionIcon: Icons.explore_outlined,
      ),
  };
}
