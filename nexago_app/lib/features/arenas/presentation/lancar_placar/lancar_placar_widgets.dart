import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/lancar_placar.dart';
import '../pelada_live/pelada_live_widgets.dart';

/// Cor de cada time no "Lançar placar": A laranja e B azul (as mesmas do
/// placar ao vivo), depois verde, âmbar, lilás e verde-água. Para texto,
/// usa o tom legível do tema.
Color lancarTeamColor(BuildContext context, int index) {
  final colors = context.themeColors;
  switch (index) {
    case 0:
      return colors.brandText;
    case 1:
      return colors.isDark ? PeladaLiveColors.blue : PeladaLiveColors.blueLight;
    case 2:
      return colors.win;
    case 3:
      return colors.pending;
    case 4:
      return colors.isDark ? const Color(0xFFD7A6FF) : const Color(0xFF7A3DB8);
    default:
      return colors.isDark ? const Color(0xFF5EEAD4) : const Color(0xFF0F766E);
  }
}

/// Cor de fundo e borda do time (sem precisar de contraste de texto).
Color lancarTeamFill(int index) => switch (index) {
      0 => AppColors.brand,
      1 => PeladaLiveColors.blue,
      2 => AppColors.win,
      3 => AppColors.pending,
      4 => const Color(0xFFB57BFF),
      _ => const Color(0xFF2DD4BF),
    };

/// Título de duas linhas da barra: "Quem jogou?" + "1 de 2 · times".
class LancarPlacarTitle extends StatelessWidget {
  const LancarPlacarTitle({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
          ),
        ),
        if (subtitle != null)
          Text(
            subtitle!.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.mono(
              fontSize: 9.5,
              fontWeight: FontWeight.w500,
              letterSpacing: 1.1,
              color: colors.onSurface.withValues(alpha: 0.6),
            ),
          ),
      ],
    );
  }
}

/// As duas barrinhas do progresso (passo 1 ou 2 de 2).
class LancarPlacarSteps extends StatelessWidget {
  const LancarPlacarSteps({super.key, required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      label: 'Passo $step de 2',
      child: Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 6),
        child: Row(
          children: [
            for (var i = 1; i <= 2; i++) ...[
              if (i > 1) const SizedBox(width: 6),
              Expanded(
                child: Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: i <= step
                        ? AppColors.brand
                        : colors.onSurface.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(9),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// "A", "B"… numa bolinha da cor do time.
class LancarTeamBadge extends StatelessWidget {
  const LancarTeamBadge({super.key, required this.index, this.size = 22});

  final int index;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: lancarTeamFill(index < 0 ? 0 : index),
        shape: BoxShape.circle,
      ),
      child: Text(
        lancarTeamLetter(index < 0 ? 0 : index),
        style: AppTypography.soraRegular(
          fontSize: size * 0.5,
          fontWeight: FontWeight.w800,
          color: const Color(0xFF0A0A0A),
        ),
      ),
    );
  }
}

/// Rodapé dos passos: resumo opcional, o botão (que diz o que falta quando
/// ainda não dá) e uma legenda.
class LancarPlacarFooter extends StatelessWidget {
  const LancarPlacarFooter({
    super.key,
    required this.buttonKey,
    required this.label,
    required this.enabled,
    required this.onPressed,
    this.busy = false,
    this.headline,
    this.caption,
    this.secondary,
  });

  final Key buttonKey;
  final String label;
  final bool enabled;
  final bool busy;
  final VoidCallback onPressed;
  final String? headline;
  final String? caption;

  /// Um link abaixo do botão ("ou marcar ao vivo").
  final Widget? secondary;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (headline != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  headline!,
                  key: const Key('lancar-placar-headline'),
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
            SizedBox(
              height: 54,
              child: FilledButton(
                key: buttonKey,
                onPressed: enabled && !busy ? onPressed : null,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: const Color(0xFF0A0A0A),
                  disabledBackgroundColor:
                      colors.onSurface.withValues(alpha: 0.08),
                  disabledForegroundColor:
                      colors.onSurface.withValues(alpha: 0.62),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  textStyle: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                child: busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: Color(0xFF0A0A0A),
                        ),
                      )
                    : Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
              ),
            ),
            if (secondary != null) secondary!,
            if (caption != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  caption!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
