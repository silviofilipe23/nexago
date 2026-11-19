import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../organizer_public_profile/domain/organizer_event.dart';
import '../../../../organizer_public_profile/domain/organizer_public_profile_logic.dart';
import '../../../../organizer_public_profile/presentation/widgets/organizer_event_tiles.dart';
import '../../../domain/arena_events_providers.dart';
import 'arena_detail_info_sections.dart';

/// Próximos eventos listados da arena, do mais cedo ao mais tarde. Vazio
/// enquanto carrega, com erro ou sem evento.
List<OrganizerEvent> arenaDetailUpcomingEvents(
  WidgetRef ref,
  String arenaId,
  DateTime now,
) {
  final events = ref.watch(arenaEventsProvider(arenaId)).valueOrNull;
  if (events == null) return const [];
  return organizerUpcomingEvents(events, now);
}

/// "Torneios e ligas aqui": os próximos eventos que acontecem na arena, com o
/// mesmo cartão do perfil do organizador. Some sem evento próximo.
class ArenaDetailEventsSection extends ConsumerWidget {
  const ArenaDetailEventsSection({
    super.key,
    required this.arenaId,
    required this.now,
    required this.onOpen,
  });

  final String arenaId;
  final DateTime now;
  final ValueChanged<OrganizerEvent> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final upcoming = arenaDetailUpcomingEvents(ref, arenaId, now);
    if (upcoming.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    final shown = upcoming.take(kArenaEventsPreviewCount).toList();
    final more = upcoming.length - shown.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 28),
        const ArenaDetailSectionTitle('Torneios e ligas aqui'),
        const SizedBox(height: 4),
        Text(
          'Eventos de organizadores que acontecem nesta arena.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
        ),
        const SizedBox(height: 12),
        for (final (i, event) in shown.indexed) ...[
          if (i > 0) const SizedBox(height: 12),
          OrganizerUpcomingEventCard(
            event: event,
            now: now,
            onOpen: () => onOpen(event),
          ),
        ],
        if (more > 0) ...[
          const SizedBox(height: 10),
          Text(
            more == 1 ? 'E mais 1 evento.' : 'E mais $more eventos.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
        ],
      ],
    );
  }
}
