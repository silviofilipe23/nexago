import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/pelada_live/pelada_live_match.dart';

/// Cor de cada lado do placar ao vivo: laranja em cima, azul embaixo (cores
/// que se distinguem também pela luminosidade, não só pelo matiz).
abstract final class PeladaLiveColors {
  static const Color blue = Color(0xFF6E86FF);
  static const Color blueLight = Color(0xFF3047C4);

  /// Fundo, borda e botão cheio.
  static Color of(LiveSide side) => side == LiveSide.a ? AppColors.brand : blue;

  /// Texto e número grande sobre o fundo do tema.
  static Color text(BuildContext context, LiveSide side) {
    final colors = context.themeColors;
    if (side == LiveSide.a) return colors.brandText;
    return colors.isDark ? blue : blueLight;
  }
}

/// Rótulo de seção ("FORMATO", "SET ATÉ") — o mesmo mono das telas novas.
class PeladaLiveLabel extends StatelessWidget {
  const PeladaLiveLabel(this.text, {super.key, this.trailing});

  final String text;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final style = AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.6,
      color: context.themeColors.onSurface.withValues(alpha: 0.60),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 14, 2, 8),
      child: Row(
        children: [
          Expanded(child: Text(text.toUpperCase(), style: style)),
          if (trailing != null) Text(trailing!.toUpperCase(), style: style),
        ],
      ),
    );
  }
}

/// Escolha única em pílulas lado a lado (segmentado).
class PeladaLiveSegmented<T> extends StatelessWidget {
  const PeladaLiveSegmented({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.keyPrefix,
  });

  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;
  final String? keyPrefix;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          for (final (i, (v, label)) in options.indexed) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(
              child: Semantics(
                selected: v == value,
                button: true,
                child: InkWell(
                  key: keyPrefix == null ? null : Key('$keyPrefix-$i'),
                  onTap: () => onChanged(v),
                  borderRadius: BorderRadius.circular(10),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    height: 40,
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: v == value ? AppColors.brand : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: AppTypography.soraRegular(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: v == value
                            ? const Color(0xFF0A0A0A)
                            : colors.onSurface.withValues(alpha: 0.75),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Cartão com linhas de liga/desliga.
class PeladaLiveToggles extends StatelessWidget {
  const PeladaLiveToggles({super.key, required this.items});

  final List<
      ({
        String title,
        String subtitle,
        bool value,
        ValueChanged<bool> onChanged,
        Key? key
      })> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Material(
        color: colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          child: Column(
            children: [
              for (final (i, item) in items.indexed) ...[
                if (i > 0)
                  Divider(
                      height: 1,
                      color: colors.onSurface.withValues(alpha: 0.06)),
                SwitchListTile.adaptive(
                  key: item.key,
                  contentPadding: EdgeInsets.zero,
                  value: item.value,
                  onChanged: item.onChanged,
                  activeTrackColor: AppColors.brand,
                  title: Text(
                    item.title,
                    style: AppTypography.soraRegular(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  subtitle: Text(
                    item.subtitle,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: colors.onSurface.withValues(alpha: 0.62),
                    ),
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

/// Aviso cinza com ícone de informação.
class PeladaLiveNote extends StatelessWidget {
  const PeladaLiveNote(this.text,
      {super.key, this.icon = Icons.info_outline_rounded});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: colors.onSurface.withValues(alpha: 0.55)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                height: 1.45,
                color: colors.onSurface.withValues(alpha: 0.72),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Pílula de estado ("SET POINT", "PONTO DE OURO").
class PeladaLivePill extends StatelessWidget {
  const PeladaLivePill(this.text, {super.key, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        text.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 9.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.1,
          color: color,
        ),
      ),
    );
  }
}

/// `07:42` a partir de milissegundos.
String peladaLiveClock(int ms) {
  final total = (ms / 1000).ceil();
  final m = total ~/ 60;
  final s = total % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}
