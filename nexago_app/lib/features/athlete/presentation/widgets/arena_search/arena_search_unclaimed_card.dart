import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../arenas/domain/arena_list_item.dart';
import '../../../../arenas/domain/nearby_arenas_logic.dart';
import 'arena_search_highlight.dart';

/// Card de arena pré-cadastrada na busca.
///
/// Deliberadamente mais enxuto que o card de arena parceira: sem preço, sem
/// nota, sem favoritar e sem "Reservar". Tudo isso são promessas da arena
/// parceira, e a pré-cadastrada não faz nenhuma — mostrar campo zerado só
/// pareceria arena ruim. O que sobra é o que sabemos de verdade (nome, cidade,
/// esportes) e o único caminho possível: falar com ela.
class ArenaSearchUnclaimedCard extends StatelessWidget {
  const ArenaSearchUnclaimedCard({
    super.key,
    required this.arena,
    required this.searchQuery,
    required this.onContact,
  });

  final ArenaListItem arena;
  final String searchQuery;

  /// `null` quando a arena não tem WhatsApp utilizável — o botão some.
  final VoidCallback? onContact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final place = arenaPlaceFields(arena);
    final location =
        '${place.city}${place.state.isNotEmpty ? ', ${place.state}' : ''}';
    final sports = arena.courtTypes.take(3).join(' · ');

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.onSurfaceMuted.withValues(alpha: 0.2)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: arenaSearchTintColor(arena.id),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.place_outlined,
                  size: 20,
                  color: AppColors.white,
                ),
              ),
              SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      buildArenaSearchHighlightedName(
                        context,
                        arena.name,
                        searchQuery,
                        baseStyle: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      location,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'AINDA NÃO RESERVA PELA NEXAGO',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ),
          ),
          if (sports.isNotEmpty) ...[
            SizedBox(height: 8),
            Text(
              sports,
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
          if (onContact != null) ...[
            SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: onContact,
              icon: Icon(Icons.chat_rounded, size: 18),
              label: Text(
                'Entre em contato',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.brand,
                side: BorderSide(color: AppColors.brand),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
