import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';
import '../../../domain/uniform_auto_saver.dart';

/// Escolha de uniforme (titular ou parceiro no aceite).
class TournamentRegistrationUniformStep extends StatelessWidget {
  const TournamentRegistrationUniformStep({
    super.key,
    required this.tournament,
    required this.category,
    required this.selection,
    required this.onChanged,
    this.leagueBadge,
    this.saveState,
    this.onRetrySave,
  });

  final TournamentDetail tournament;
  final TournamentCategoryOffer category;
  final TournamentUniformSelection selection;
  final ValueChanged<TournamentUniformSelection> onChanged;
  final String? leagueBadge;

  /// Estado da gravação automática. `null` quando ainda não existe inscrição
  /// onde gravar — aí a escolha viaja junto do convite, e um selo de "salvo"
  /// mentiria.
  final UniformSaveState? saveState;
  final VoidCallback? onRetrySave;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final topSizes = uniformSizeOptionsTopForCategory(category);
    final shortsSizes = uniformSizeOptionsShortsForCategory(category);
    final number = selection.jerseyNumber ?? 10;
    final sizeTop = selection.sizeTop ?? topSizes.elementAtOrNull(2) ?? 'M';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (saveState != null) ...[
          _UniformSaveBadge(state: saveState!, onRetry: onRetrySave),
          const SizedBox(height: 12),
        ],
        // _TournamentUniformContextRow(
        //   leagueBadge: leagueBadge ?? 'TORNEIO',
        //   categoryName: category.name,
        //   categoryBadge: categoryBadgeLabel(category),
        // ),
        // SizedBox(height: 20),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                'Vamos te vestir.',
                style: AppTypography.soraRegular(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.05,
                ),
              ),
            ),
            SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.brand.withValues(alpha: 0.35),
                ),
              ),
              child: Text(
                'INCLUSO',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  letterSpacing: 0.6,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 10),
        Text(
          'Camisa oficial do torneio. Você troca tamanho/número até '
          '${kUniformChangeDeadlineDays} dias antes.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
            height: 1.4,
          ),
        ),
        // SizedBox(height: 20),
        // _JerseyPreviewCard(
        //   tournamentName: tournament.name,
        //   jerseyNumber: category.uniformNumberOnShirt ? number : null,
        //   sizeTop: sizeTop,
        // ),
        SizedBox(height: 24),
        Row(
          children: [
            Text(
              'TAMANHO',
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.8,
              ),
            ),
            Spacer(),
            TextButton(
              onPressed: () {
                showAppSnackBar(context, 'Tabela de medidas em breve.');
              },
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'TABELA DE MEDIDAS',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 10),
        _SizeChipRow(
          sizes: topSizes,
          selected: sizeTop,
          onSelected: (v) => onChanged(selection.copyWith(sizeTop: v)),
        ),
        if (categoryRequiresShorts(category)) ...[
          SizedBox(height: 20),
          Text(
            'SHORTS',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.8,
            ),
          ),
          SizedBox(height: 10),
          _SizeChipRow(
            sizes: shortsSizes,
            selected: selection.sizeShorts ?? shortsSizes.first,
            onSelected: (v) => onChanged(selection.copyWith(sizeShorts: v)),
          ),
        ],
        if (category.uniformNumberOnShirt) ...[
          SizedBox(height: 24),
          Row(
            children: [
              Text(
                'NÚMERO DA CAMISA',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.8,
                ),
              ),
              Spacer(),
              Text(
                '1–99',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          SizedBox(height: 10),
          _JerseyNumberStepper(
            value: number,
            onChanged: (v) => onChanged(selection.copyWith(jerseyNumber: v)),
          ),
        ],
        if (category.uniformNameOnShirt) ...[
          SizedBox(height: 20),
          Text(
            'NOME NA CAMISA',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.8,
            ),
          ),
          SizedBox(height: 10),
          TextFormField(
            initialValue: selection.jerseyName,
            onChanged: (v) => onChanged(selection.copyWith(jerseyName: v)),
            decoration: InputDecoration(
              hintText: 'Como aparece na camisa',
              filled: true,
              fillColor: context.themeColors.surfaceCard,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
            ),
            style: TextStyle(color: context.themeColors.onSurface),
          ),
        ],
      ],
    );
  }
}

class _TournamentUniformContextRow extends StatelessWidget {
  const _TournamentUniformContextRow({
    required this.leagueBadge,
    required this.categoryName,
    required this.categoryBadge,
  });

  final String leagueBadge;
  final String categoryName;
  final String categoryBadge;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                leagueBadge.toUpperCase(),
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                  letterSpacing: 0.5,
                ),
              ),
              SizedBox(height: 4),
              Text(
                categoryName,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.brand,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            categoryBadge,
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: AppColors.black,
            ),
          ),
        ),
      ],
    );
  }
}

class _JerseyPreviewCard extends StatelessWidget {
  const _JerseyPreviewCard({
    required this.tournamentName,
    required this.sizeTop,
    this.jerseyNumber,
  });

  final String tournamentName;
  final String sizeTop;
  final int? jerseyNumber;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 200,
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          CustomPaint(
            size: const Size(double.infinity, 200),
            painter: _DiagonalStripePainter(),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '[ CAMISA OFICIAL · ${tournamentName.toUpperCase()} ]',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                    Text(
                      'PREVIEW',
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
                Spacer(),
                if (jerseyNumber != null)
                  Center(
                    child: Text(
                      '$jerseyNumber',
                      style: AppTypography.soraRegular(
                        fontSize: 72,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface.withValues(
                          alpha: 0.95,
                        ),
                        height: 1,
                      ),
                    ),
                  ),
                Spacer(),
                Align(
                  alignment: Alignment.centerRight,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'TAM',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                      SizedBox(width: 6),
                      Container(
                        width: 36,
                        height: 36,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.brand,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          sizeTop,
                          style: AppTypography.mono(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: AppColors.black,
                          ),
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

class _DiagonalStripePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.06)
      ..strokeWidth = 28
      ..style = PaintingStyle.stroke;
    for (var i = -2; i < 8; i++) {
      final offset = i * 48.0;
      canvas.drawLine(
        Offset(offset, size.height),
        Offset(offset + size.width, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _SizeChipRow extends StatelessWidget {
  const _SizeChipRow({
    required this.sizes,
    required this.selected,
    required this.onSelected,
  });

  final List<String> sizes;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final size in sizes)
          Material(
            color: selected == size
                ? AppColors.brand
                : context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => onSelected(size),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected == size
                        ? AppColors.brand
                        : Colors.white.withValues(alpha: 0.08),
                  ),
                ),
                child: Text(
                  size,
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: selected == size
                        ? AppColors.black
                        : context.themeColors.onSurface,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _JerseyNumberStepper extends StatelessWidget {
  const _JerseyNumberStepper({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          _StepperButton(
            icon: Icons.remove_rounded,
            filled: false,
            onPressed: value > 1 ? () => onChanged(value - 1) : null,
          ),
          Expanded(
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 40,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          _StepperButton(
            icon: Icons.add_rounded,
            filled: true,
            onPressed: value < 99 ? () => onChanged(value + 1) : null,
          ),
        ],
      ),
    );
  }
}

class _StepperButton extends StatelessWidget {
  const _StepperButton({
    required this.icon,
    required this.filled,
    required this.onPressed,
  });

  final IconData icon;
  final bool filled;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 48,
          height: 48,
          child: Icon(
            icon,
            color: filled
                ? AppColors.black
                : context.themeColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}

/// Selo da gravação automática — sem botão de salvar, é ele que conta o que
/// está acontecendo com a escolha.
class _UniformSaveBadge extends StatelessWidget {
  const _UniformSaveBadge({required this.state, this.onRetry});

  final UniformSaveState state;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);

    final (label, color, icon) = switch (state) {
      UniformSaveState.idle => ('Escolha para salvar', colors.onSurfaceMuted, Icons.edit_outlined),
      UniformSaveState.saving => ('Salvando...', colors.onSurfaceMuted, Icons.sync_rounded),
      UniformSaveState.saved => ('Salvo', AppColors.win, Icons.check_circle_outline_rounded),
      UniformSaveState.failed => ('Não salvou', AppColors.live, Icons.error_outline_rounded),
    };

    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (state == UniformSaveState.failed && onRetry != null) ...[
          const SizedBox(width: 8),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: const Size(0, 0),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text('Tentar de novo'),
          ),
        ],
      ],
    );
  }
}
