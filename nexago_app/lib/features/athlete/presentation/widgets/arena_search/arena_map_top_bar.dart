import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

/// Faixa preta do topo convidando o dono de arena a se cadastrar.
///
/// Mesma ação do convite que já existia no estado vazio da lista: no mapa ela
/// sobe para o topo porque a cidade com poucos pinos é exatamente onde o dono
/// de arena se reconhece.
class ArenaMapSignupBanner extends StatelessWidget {
  const ArenaMapSignupBanner({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.black,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.16),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.stadium_rounded,
                  size: 22,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'CADASTRE AS QUADRAS DA SUA CIDADE',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        color: AppColors.white,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'E AJUDE NO CRESCIMENTO DO APP',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brand,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.brand,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pastilha de busca que flutua sobre o mapa.
///
/// Junta num só objeto o que na lista eram três linhas separadas: texto,
/// data/hora e filtros. Sobre o mapa, cada linha extra é mapa a menos.
class ArenaMapSearchBar extends StatefulWidget {
  const ArenaMapSearchBar({
    super.key,
    required this.initialQuery,
    required this.slotLabel,
    required this.activeFilterCount,
    required this.onQueryChanged,
    required this.onSlotTap,
    required this.onFiltersTap,
  });

  final String initialQuery;

  /// Resumo do recorte de tempo (`Hoje · 19h`).
  final String slotLabel;

  final int activeFilterCount;
  final ValueChanged<String> onQueryChanged;
  final VoidCallback onSlotTap;
  final VoidCallback onFiltersTap;

  @override
  State<ArenaMapSearchBar> createState() => _ArenaMapSearchBarState();
}

class _ArenaMapSearchBarState extends State<ArenaMapSearchBar> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
  }

  @override
  void didUpdateWidget(covariant ArenaMapSearchBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Só reescreve quando a mudança veio de fora (ex.: "ver todas" limpando a
    // busca). Reescrever a cada tecla mataria o cursor do atleta.
    if (widget.initialQuery != oldWidget.initialQuery &&
        widget.initialQuery != _controller.text) {
      _controller.text = widget.initialQuery;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.surfaceRaised),
        boxShadow: [
          BoxShadow(
            color: AppColors.black.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          const SizedBox(width: 14),
          Icon(Icons.search_rounded, size: 20, color: colors.onSurfaceMuted),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _controller,
              onChanged: widget.onQueryChanged,
              textInputAction: TextInputAction.search,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurface,
                fontWeight: FontWeight.w600,
              ),
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Arena, bairro ou cidade',
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ),
          _SlotChip(label: widget.slotLabel, onTap: widget.onSlotTap),
          const SizedBox(width: 6),
          _FilterButton(
            badgeCount: widget.activeFilterCount,
            onTap: widget.onFiltersTap,
          ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _SlotChip extends StatelessWidget {
  const _SlotChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.event_rounded,
                size: 14,
                color: colors.onSurfaceMuted,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.badgeCount, required this.onTap});

  final int badgeCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final active = badgeCount > 0;

    return Material(
      color: active ? AppColors.brand : colors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.tune_rounded,
                size: 16,
                color: active ? AppColors.black : colors.onSurface,
              ),
              if (active) ...[
                const SizedBox(width: 4),
                Text(
                  '$badgeCount',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: AppColors.black,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
