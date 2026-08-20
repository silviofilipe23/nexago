import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/ranking_list_models.dart';

/// Folha única de filtros do ranking: temporada, gênero, nível e — só no modo
/// de equipes — formato. Substitui as quatro folhas/chips soltos que dividiam
/// o mesmo estado (`RankingPageFilter`) em quatro toques diferentes.
///
/// O segmento Equipes/Atletas fica de fora de propósito: ele troca a lista
/// inteira em vez de recortá-la, e segue visível na tela.
///
/// Devolve o filtro montado ou `null` se a folha for fechada sem aplicar —
/// arrastar pra baixo não muda nada.
///
/// Teto de 90% + lista rolável: as quatro seções passam da altura útil com
/// fonte ampliada em tela curta, e `showModalBottomSheet` sem
/// `isScrollControlled` trava em 9/16 da tela sem rolagem.
Future<RankingPageFilter?> showRankingFiltersSheet({
  required BuildContext context,
  required RankingPageFilter initial,
  required List<int> yearOptions,
}) {
  return showModalBottomSheet<RankingPageFilter>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => _RankingFiltersSheet(
      initial: initial,
      yearOptions: yearOptions,
    ),
  );
}

class _RankingFiltersSheet extends StatefulWidget {
  const _RankingFiltersSheet({
    required this.initial,
    required this.yearOptions,
  });

  final RankingPageFilter initial;
  final List<int> yearOptions;

  @override
  State<_RankingFiltersSheet> createState() => _RankingFiltersSheetState();
}

class _RankingFiltersSheetState extends State<_RankingFiltersSheet> {
  late int? _year;
  late RankingGenderFilter _gender;
  late RankingLevelFilter _level;
  late RankingFormatFilter _format;

  /// Linha individual não tem dupla/trio/quarteto/quinteto.
  bool get _showFormat => widget.initial.mode == RankingListMode.teams;

  @override
  void initState() {
    super.initState();
    _year = widget.initial.year;
    _gender = widget.initial.gender;
    _level = widget.initial.level;
    _format = widget.initial.format;
  }

  RankingPageFilter get _draft => RankingPageFilter(
        mode: widget.initial.mode,
        year: _year,
        gender: _gender,
        level: _level,
        format: _showFormat ? _format : RankingFormatFilter.all,
      );

  /// Diferente de `hasActiveFilters`: aqui a temporada conta, porque "Limpar"
  /// devolve o ranking pro Geral junto com o resto.
  bool get _canClear => _year != null || _draft.hasActiveFilters;

  void _clear() {
    setState(() {
      _year = null;
      _gender = RankingGenderFilter.all;
      _level = RankingLevelFilter.all;
      _format = RankingFormatFilter.all;
    });
  }

  void _apply() => Navigator.pop(context, _draft);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final draft = _draft;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: colors.onSurfaceMuted.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Filtros',
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ),
              TextButton(
                onPressed: _canClear ? _clear : null,
                child: Text(
                  'Limpar',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: _canClear ? AppColors.brand : colors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
        Flexible(
          // `ListView` com `children` monta preguiçosamente: a seção abaixo da
          // dobra nem chega a existir. São quatro seções — vale a coluna
          // inteira montada de uma vez.
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const _SectionLabel('TEMPORADA'),
                _FilterChipWrap<int?>(
                  options: [null, ...widget.yearOptions],
                  labelOf: (year) => year == null ? 'Geral' : '$year',
                  selected: _year,
                  onSelected: (year) => setState(() => _year = year),
                ),
                const SizedBox(height: 8),
                Text(
                  draft.pointsModeLabel,
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurfaceMuted,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 20),
                const _SectionLabel('GÊNERO'),
                _FilterChipWrap<RankingGenderFilter>(
                  options: RankingGenderFilter.values,
                  labelOf: (gender) => gender.label,
                  selected: _gender,
                  onSelected: (gender) => setState(() => _gender = gender),
                ),
                const SizedBox(height: 20),
                const _SectionLabel('NÍVEL'),
                _FilterChipWrap<RankingLevelFilter>(
                  options: RankingLevelFilter.values,
                  labelOf: (level) => level.label,
                  selected: _level,
                  onSelected: (level) => setState(() => _level = level),
                ),
                if (_showFormat) ...[
                  const SizedBox(height: 20),
                  const _SectionLabel('FORMATO'),
                  _FilterChipWrap<RankingFormatFilter>(
                    options: RankingFormatFilter.values,
                    labelOf: (format) => format.label,
                    selected: _format,
                    onSelected: (format) => setState(() => _format = format),
                  ),
                ],
              ],
            ),
          ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            20,
            12,
            20,
            16 + MediaQuery.paddingOf(context).bottom,
          ),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.surfaceRaised)),
          ),
          child: FilledButton(
            onPressed: _apply,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(28),
              ),
            ),
            child: const Text(
              'Aplicar filtros',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: context.themeColors.onSurfaceMuted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

/// Seleção única em linha quebrável — mesma linguagem visual da folha de
/// filtros do Descobrir.
class _FilterChipWrap<T> extends StatelessWidget {
  const _FilterChipWrap({
    required this.options,
    required this.labelOf,
    required this.selected,
    required this.onSelected,
  });

  final List<T> options;
  final String Function(T value) labelOf;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final option in options)
          _FilterChip(
            label: labelOf(option),
            selected: option == selected,
            onTap: () => onSelected(option),
          ),
      ],
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
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.14)
                : context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? AppColors.brand : Colors.transparent,
              width: 1.5,
            ),
          ),
          // `Text` com estilo herda a família do tema; um `DefaultTextStyle`
          // montado do zero (o que `AnimatedDefaultTextStyle` faz) derrubaria
          // a Sora pra fonte padrão da plataforma.
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: selected ? AppColors.brand : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}
