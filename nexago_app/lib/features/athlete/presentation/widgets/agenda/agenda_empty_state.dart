import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaEmptyState extends StatelessWidget {
  const AgendaEmptyState({
    super.key,
    required this.filter,
    required this.monthMode,
    required this.pastTab,
    required this.onPrimaryAction,
    this.searchQuery = '',
  });

  final AthleteAgendaFilter filter;
  final bool monthMode;
  final bool pastTab;
  final VoidCallback onPrimaryAction;
  final String searchQuery;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final copy = _copyForFilter(
      filter: filter,
      monthMode: monthMode,
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
  required bool monthMode,
  required bool pastTab,
  required String searchQuery,
}) {
  final scope = monthMode ? 'neste mês' : 'neste dia';

  if (searchQuery.isNotEmpty) {
    return _AgendaEmptyCopy(
      icon: Icons.search_off_rounded,
      title: 'Nada encontrado para "$searchQuery"',
      hint: pastTab
          ? 'Tente outro termo ou altere o filtro.'
          : 'Limpe a busca ou explore outras datas.',
      showAction: !pastTab,
      actionLabel: 'Explorar',
      actionIcon: Icons.explore_outlined,
    );
  }

  if (pastTab) {
    return switch (filter) {
      AthleteAgendaFilter.rentals => _AgendaEmptyCopy(
          icon: Icons.history_rounded,
          title: 'Nenhum aluguel passado $scope',
          hint: 'Altere o dia, o mês ou o filtro para ver outras reservas.',
          showAction: false,
          actionLabel: '',
          actionIcon: Icons.history_rounded,
        ),
      AthleteAgendaFilter.tournaments => _AgendaEmptyCopy(
          icon: Icons.history_rounded,
          title: 'Nenhum torneio passado $scope',
          hint: 'Altere o dia, o mês ou o filtro para ver outros torneios.',
          showAction: false,
          actionLabel: '',
          actionIcon: Icons.history_rounded,
        ),
      AthleteAgendaFilter.challenges => _AgendaEmptyCopy(
          icon: Icons.history_rounded,
          title: 'Nenhum desafio passado $scope',
          hint: 'Altere o dia, o mês ou o filtro para ver outros desafios.',
          showAction: false,
          actionLabel: '',
          actionIcon: Icons.history_rounded,
        ),
      AthleteAgendaFilter.all => _AgendaEmptyCopy(
          icon: Icons.history_rounded,
          title: monthMode
              ? 'Nenhum jogo passado neste mês'
              : 'Nenhum jogo passado neste dia',
          hint: 'Altere o dia ou o filtro para ver outros jogos.',
          showAction: false,
          actionLabel: '',
          actionIcon: Icons.history_rounded,
        ),
    };
  }

  return switch (filter) {
    AthleteAgendaFilter.rentals => _AgendaEmptyCopy(
        icon: Icons.sports_tennis_rounded,
        title: 'Nenhum aluguel $scope',
        hint: 'Reserve uma quadra e ela aparecerá na sua agenda.',
        showAction: true,
        actionLabel: 'Agendar quadra',
        actionIcon: Icons.calendar_month_outlined,
      ),
    AthleteAgendaFilter.tournaments => _AgendaEmptyCopy(
        icon: Icons.emoji_events_outlined,
        title: 'Nenhum torneio $scope',
        hint: 'Inscreva-se em um torneio para acompanhar aqui.',
        showAction: true,
        actionLabel: 'Ver torneios',
        actionIcon: Icons.emoji_events_outlined,
      ),
    AthleteAgendaFilter.challenges => _AgendaEmptyCopy(
        icon: Icons.bolt_rounded,
        title: 'Nenhum desafio $scope',
        hint: 'Quando houver desafios de ranking, eles aparecerão aqui.',
        showAction: true,
        actionLabel: 'Explorar',
        actionIcon: Icons.explore_outlined,
      ),
    AthleteAgendaFilter.all => _AgendaEmptyCopy(
        icon: Icons.event_busy_rounded,
        title: monthMode ? 'Nada no mês com esse filtro' : 'Nenhum jogo neste dia',
        hint: 'Reserve uma quadra ou inscreva-se em um torneio.',
        showAction: true,
        actionLabel: 'Explorar',
        actionIcon: Icons.explore_outlined,
      ),
  };
}
