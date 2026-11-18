import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_club_admin_providers.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_recurring_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class_providers.dart';

/// Linha única de atalhos da aba Reservas: Aulas, Horários fixos e
/// Clubinho. Substitui as três faixas laranja (≈136 px) por uma linha só.
///
/// Mesmas permissões de antes: Aulas aparece para quem lê a agenda (a tela
/// tem visão só leitura); Horários fixos e Clubinho só para quem escreve
/// nela, porque a única ação dessas telas é criar. Para quem só lê, a linha
/// mostra só Aulas, na largura toda. Contador zerado não aparece.
class ArenaBookingsShortcuts extends ConsumerWidget {
  const ArenaBookingsShortcuts({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final todayKey = arenaDateKey(arenaTodayDateOnly());
    final classes =
        ref.watch(arenaClassDayViewProvider(todayKey)).valueOrNull?.classCount;

    final tiles = <Widget>[
      _ShortcutTile(
        key: const Key('arena-bookings-shortcut-aulas'),
        icon: Icons.school_rounded,
        label: 'Aulas',
        detail: _countLabel(classes, 'hoje', 'hoje'),
        onTap: () => context.pushNamed(AppRouteNames.arenaClasses),
      ),
      if (canWrite) ...[
        _RecurringTile(),
        _ClubsTile(),
      ],
    ];

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < tiles.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: tiles[i]),
          ],
        ],
      ),
    );
  }
}

/// "2 hoje", "12 ativos", "1 ativo"; `null` quando não há nada a contar.
String? _countLabel(int? count, String singular, String plural) {
  if (count == null || count <= 0) return null;
  return '$count ${count == 1 ? singular : plural}';
}

class _RecurringTile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count =
        ref.watch(arenaActiveRecurringSeriesProvider).valueOrNull?.length;
    return _ShortcutTile(
      key: const Key('arena-bookings-shortcut-fixos'),
      icon: Icons.event_repeat_rounded,
      label: 'Horários fixos',
      detail: _countLabel(count, 'ativo', 'ativos'),
      onTap: () => context.pushNamed(AppRouteNames.arenaRecurring),
    );
  }
}

class _ClubsTile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clubs = ref.watch(managedArenaClubsProvider).valueOrNull;
    final count = clubs?.where((c) => c.isActive).length;
    return _ShortcutTile(
      key: const Key('arena-bookings-shortcut-clubinho'),
      icon: Icons.groups_rounded,
      label: 'Clubinho',
      detail: _countLabel(count, 'ativo', 'ativos'),
      onTap: () => context.pushNamed(AppRouteNames.arenaClubs),
    );
  }
}

class _ShortcutTile extends StatelessWidget {
  const _ShortcutTile({
    super.key,
    required this.icon,
    required this.label,
    required this.detail,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String? detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final note = detail;
    return Semantics(
      button: true,
      label: note == null ? label : '$label, $note',
      excludeSemantics: true,
      child: Material(
        // Fundo neutro: o laranja fica reservado às ações.
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(icon, size: 15, color: colors.brandText),
                      const SizedBox(width: 5),
                      // Encolhe um pouco em vez de cortar "Horários fixos"
                      // em telas estreitas.
                      Flexible(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            label,
                            maxLines: 1,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (note != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      note,
                      maxLines: 1,
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
