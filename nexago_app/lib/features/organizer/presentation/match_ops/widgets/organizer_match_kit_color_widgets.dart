import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match_kit_color.dart';
import '../mesa_sun/mesa_sun.dart';

/// Contorno de toda amostra/faixa de camisa — é ele que deixa o branco visível no fundo claro e
/// o preto no escuro. Tema escuro: 1,5px escuro por dentro e 1,5px claro por fora. Modo sol: 2px
/// preto.
Widget kitOutlined(
  BuildContext context, {
  required Color fill,
  required BorderRadius radius,
  Widget? child,
  double? width,
  double? height,
}) {
  if (MesaSun.isOn(context)) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: radius,
        border: Border.all(color: MesaSun.ink, width: 2),
      ),
      child: child,
    );
  }
  final r = radius.topLeft.x;
  final inner = r > 1.5 ? BorderRadius.circular(r - 1.5) : BorderRadius.zero;
  return Container(
    width: width,
    height: height,
    padding: const EdgeInsets.all(1.5),
    decoration: BoxDecoration(
      color: const Color(0xFFF4F4F5),
      borderRadius: radius,
    ),
    child: Container(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: inner,
        border: Border.all(color: const Color(0xFF151517), width: 1.5),
      ),
      child: child,
    ),
  );
}

/// Quadradinho da cor, de 0,8em (cantos 4px), que vai antes do nome da dupla.
class KitSquare extends StatelessWidget {
  const KitSquare({super.key, required this.color, this.fontSize = 14});

  final KitColor color;

  /// Tamanho da fonte do nome ao lado — o quadrado é 0,8 dela.
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final size = fontSize * 0.8;
    return Semantics(
      label: 'Camisa ${color.label}',
      child: SizedBox(
        width: size,
        height: size,
        child: kitOutlined(
          context,
          fill: color.hex,
          radius: BorderRadius.circular(4),
        ),
      ),
    );
  }
}

/// Span inline pra usar dentro de `Text.rich`, antes do nome.
InlineSpan kitSquareSpan(KitColor color, double fontSize) => WidgetSpan(
      alignment: PlaceholderAlignment.middle,
      child: Padding(
        padding: EdgeInsets.only(right: fontSize * 0.4),
        child: KitSquare(color: color, fontSize: fontSize),
      ),
    );

/// Faixa de 8px no topo da área de toque da dupla, de ponta a ponta.
class KitStrip extends StatelessWidget {
  const KitStrip({super.key, required this.color});

  final KitColor color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Camisa ${color.label}',
      child: kitOutlined(
        context,
        fill: color.hex,
        radius: BorderRadius.zero,
        height: 8,
      ),
    );
  }
}

/// Uma amostra de cor: 26px de visual e toque de 44px. A selecionada leva anel duplo.
class KitSwatch extends StatelessWidget {
  const KitSwatch({
    super.key,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final KitColor color;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label: 'Camisa ${color.label}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              // Anel duplo: fundo por dentro e cor do texto por fora, visível em qualquer tema.
              decoration: selected
                  ? BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.canvas,
                      border: Border.all(color: colors.onSurface, width: 2),
                    )
                  : null,
              child: kitOutlinedCircle(context, color.hex, 26),
            ),
          ),
        ),
      ),
    );
  }
}

/// Amostra redonda com o mesmo contorno de acessibilidade.
Widget kitOutlinedCircle(BuildContext context, Color fill, double size) {
  if (MesaSun.isOn(context)) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: fill,
        border: Border.all(color: MesaSun.ink, width: 2),
      ),
    );
  }
  return Container(
    width: size,
    height: size,
    padding: const EdgeInsets.all(1.5),
    decoration: const BoxDecoration(
      shape: BoxShape.circle,
      color: Color(0xFFF4F4F5),
    ),
    child: DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: fill,
        border: Border.all(color: const Color(0xFF151517), width: 1.5),
      ),
    ),
  );
}

/// Linha "nome da dupla · nome da cor · 6 amostras" — a tela de antes do set e a folha
/// "Editar cores" usam a mesma.
class KitColorRow extends StatelessWidget {
  const KitColorRow({
    super.key,
    required this.side,
    required this.teamLabel,
    required this.selected,
    required this.onPick,
  });

  /// `'A'`/`'B'` — só identifica as amostras (chaves de teste).
  final String side;
  final String teamLabel;
  final KitColor selected;
  final ValueChanged<KitColor>? onPick;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                teamLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              Text(
                selected.label,
                style: AppTypography.soraRegular(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        for (final color in KitColors.all)
          KitSwatch(
            key: ValueKey('kit-$side-${color.id}'),
            color: color,
            selected: color.id == selected.id,
            onTap: onPick == null ? null : () => onPick!(color),
          ),
      ],
    );
  }
}

/// Folha "Editar cores" (menu ⋯): troca a cor da camisa no meio do jogo. Cada toque já grava e
/// atualiza a tela do jogo na hora; a regra "duas duplas, duas cores" é a mesma do passo 3.
Future<void> showKitColorEditSheet(
  BuildContext context, {
  required ThemeData theme,
  required String labelA,
  required String labelB,
  required KitColor kitA,
  required KitColor kitB,
  required void Function(KitColor a, KitColor b) onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppThemeColors(theme.colorScheme).surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => Theme(
      data: theme,
      child: _KitColorEditSheet(
        labelA: labelA,
        labelB: labelB,
        kitA: kitA,
        kitB: kitB,
        onChanged: onChanged,
      ),
    ),
  );
}

class _KitColorEditSheet extends StatefulWidget {
  const _KitColorEditSheet({
    required this.labelA,
    required this.labelB,
    required this.kitA,
    required this.kitB,
    required this.onChanged,
  });

  final String labelA;
  final String labelB;
  final KitColor kitA;
  final KitColor kitB;
  final void Function(KitColor a, KitColor b) onChanged;

  @override
  State<_KitColorEditSheet> createState() => _KitColorEditSheetState();
}

class _KitColorEditSheetState extends State<_KitColorEditSheet> {
  late KitColor _a = widget.kitA;
  late KitColor _b = widget.kitB;

  void _pick(String side, KitColor color) {
    final next = KitColors.pick(
      side: side,
      chosen: color,
      currentA: _a,
      currentB: _b,
    );
    setState(() {
      _a = next.a;
      _b = next.b;
    });
    widget.onChanged(_a, _b);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 8, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 4, right: 8),
              child: Text(
                'EDITAR CORES DA CAMISA',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurfaceMuted,
                  letterSpacing: 0.6,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 8, right: 8),
              child: Text(
                'Não altera o placar. As duas duplas nunca ficam com a mesma cor.',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ),
            KitColorRow(
              side: 'A',
              teamLabel: widget.labelA,
              selected: _a,
              onPick: (c) => _pick('A', c),
            ),
            KitColorRow(
              side: 'B',
              teamLabel: widget.labelB,
              selected: _b,
              onPick: (c) => _pick('B', c),
            ),
          ],
        ),
      ),
    );
  }
}
