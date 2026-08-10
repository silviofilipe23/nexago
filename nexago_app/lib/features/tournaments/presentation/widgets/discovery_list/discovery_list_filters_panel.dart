import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../domain/tournament_discovery_labels.dart';
import '../../../domain/tournament_discovery_models.dart';

/// Painel colapsável "Mais filtros" da lista de descoberta (paridade com o
/// portal web): categoria, formato, data mínima, teto de preço e o toggle
/// "apenas abertos", com "Limpar" no topo. Estado mora na página.
class DiscoveryListFiltersPanel extends StatelessWidget {
  const DiscoveryListFiltersPanel({
    super.key,
    required this.category,
    required this.format,
    required this.dateFrom,
    required this.priceMaxController,
    required this.openOnly,
    required this.onCategoryChanged,
    required this.onFormatChanged,
    required this.onDateFromChanged,
    required this.onPriceMaxChanged,
    required this.onOpenOnlyChanged,
    required this.onReset,
  });

  final TournamentDiscoveryCategoryFilter category;

  /// `null` = todos os formatos.
  final TournamentFormat? format;
  final DateTime? dateFrom;
  final TextEditingController priceMaxController;
  final bool openOnly;
  final ValueChanged<TournamentDiscoveryCategoryFilter> onCategoryChanged;
  final ValueChanged<TournamentFormat?> onFormatChanged;
  final ValueChanged<DateTime?> onDateFromChanged;
  final ValueChanged<String> onPriceMaxChanged;
  final ValueChanged<bool> onOpenOnlyChanged;
  final VoidCallback onReset;

  Future<void> _pickDate(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: dateFrom ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
    );
    if (picked != null) onDateFromChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Filtros',
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
              ),
              TextButton(
                onPressed: onReset,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs,
                  ),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Limpar'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          _FilterLabel('Categoria'),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final f in TournamentDiscoveryCategoryFilter.values)
                _FilterChip(
                  label: tournamentDiscoveryCategoryFilterLabel(f),
                  selected: category == f,
                  onTap: () => onCategoryChanged(f),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _FilterLabel('Formato'),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _FilterChip(
                label: 'Todos',
                selected: format == null,
                onTap: () => onFormatChanged(null),
              ),
              _FilterChip(
                label: 'Dupla',
                selected: format == TournamentFormat.dupla,
                onTap: () => onFormatChanged(TournamentFormat.dupla),
              ),
              _FilterChip(
                label: 'Individual',
                selected: format == TournamentFormat.individual,
                onTap: () => onFormatChanged(TournamentFormat.individual),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FilterLabel('A partir de'),
                    const SizedBox(height: AppSpacing.sm),
                    _DateField(
                      value: dateFrom,
                      onTap: () => _pickDate(context),
                      onClear: dateFrom == null
                          ? null
                          : () => onDateFromChanged(null),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FilterLabel('Até R\$'),
                    const SizedBox(height: AppSpacing.sm),
                    TextField(
                      controller: priceMaxController,
                      onChanged: onPriceMaxChanged,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      style: AppTypography.bodyM
                          .copyWith(color: colors.onSurface),
                      decoration: InputDecoration(
                        hintText: 'máx.',
                        hintStyle: AppTypography.bodyM
                            .copyWith(color: colors.onSurfaceMuted),
                        isDense: true,
                        filled: true,
                        fillColor: colors.surfaceRaised,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.md,
                          vertical: AppSpacing.md,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: AppRadii.mdAll,
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => onOpenOnlyChanged(!openOnly),
              borderRadius: AppRadii.smAll,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Switch(
                      value: openOnly,
                      onChanged: onOpenOnlyChanged,
                      activeTrackColor: AppColors.brand,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        'Apenas torneios abertos',
                        style: AppTypography.bodyM.copyWith(
                          fontWeight: FontWeight.w600,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterLabel extends StatelessWidget {
  const _FilterLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.eyebrow
          .copyWith(color: context.themeColors.onSurfaceMuted),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.pillAll,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md + 2,
            vertical: AppSpacing.sm + 1,
          ),
          decoration: BoxDecoration(
            color: selected ? AppColors.brand : colors.surfaceRaised,
            borderRadius: AppRadii.pillAll,
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.labelL.copyWith(
              color: selected ? AppColors.black : colors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.value, required this.onTap, this.onClear});

  final DateTime? value;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final label = value == null
        ? 'qualquer data'
        : DateFormat('dd/MM/yyyy').format(value!);

    return Material(
      color: colors.surfaceRaised,
      borderRadius: AppRadii.mdAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Icon(
                Icons.calendar_today_outlined,
                size: 15,
                color: colors.onSurfaceMuted,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyM.copyWith(
                    color: value == null
                        ? colors.onSurfaceMuted
                        : colors.onSurface,
                  ),
                ),
              ),
              if (onClear != null)
                GestureDetector(
                  onTap: onClear,
                  child: Icon(
                    Icons.close_rounded,
                    size: 16,
                    color: colors.onSurfaceMuted,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
