import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/arena_list_item.dart';
import '../../../../arenas/domain/nearby_arenas_logic.dart';
import 'arena_search_highlight.dart';

/// Card de arena pré-cadastrada na busca.
///
/// Segue o mesmo desenho do card de arena parceira ([ArenaSearchArenaCard]) —
/// hero, bloco de nome, linha de preço e barra de ação nos mesmos lugares —
/// para não destoar da lista. Muda só o que ela realmente não tem: não é
/// tocável (não existe detalhe para abrir), não dá para favoritar e o lugar do
/// preço diz que não há reserva, em vez de exibir R$ 0 e parecer arena grátis.
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
    final sportPill =
        (arena.courtTypes.isNotEmpty ? arena.courtTypes.first : 'Areia')
            .toUpperCase();

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Hero(arenaId: arena.id, sportLabel: sportPill),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
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
                                fontWeight: FontWeight.w900,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            location,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colors.onSurfaceMuted,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: colors.surfaceRaised,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'AINDA NÃO RESERVA PELA NEXAGO',
                              style: AppTypography.mono(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.brand.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.chat_rounded,
                          color: AppColors.brand,
                          size: 20,
                        ),
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Fale direto com a arena',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                            Text(
                              sports.isEmpty ? 'Esportes de areia' : sports,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 8),
                      if (onContact != null)
                        FilledButton(
                          onPressed: onContact,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 10,
                            ),
                          ),
                          child: Text(
                            'Entre em contato',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Mesma altura e gradiente do hero da parceira. Como a arena pré-cadastrada
/// não tem foto, entra só a cor de fundo derivada do id — e a pilha superior
/// mostra o esporte, no lugar onde a parceira mostra a contagem de quadras.
class _Hero extends StatelessWidget {
  const _Hero({required this.arenaId, required this.sportLabel});

  final String arenaId;
  final String sportLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 140,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(color: arenaSearchTintColor(arenaId)),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.05),
                  Colors.black.withValues(alpha: 0.45),
                ],
              ),
            ),
          ),
          Positioned(
            left: 10,
            top: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                sportLabel,
                style: AppTypography.mono(
                  color: AppColors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
