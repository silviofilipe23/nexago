import 'package:flutter/material.dart';

import '../theme/app_motion.dart';
import '../theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Bloco de skeleton com pulso suave — o placeholder de loading padrão.
///
/// Use no lugar de `CircularProgressIndicator` sempre que o layout final
/// da seção for conhecido (lista, card, linha de texto).
class NexaSkeleton extends StatefulWidget {
  const NexaSkeleton({
    super.key,
    this.width,
    this.height = 14,
    this.radius = AppRadii.smAll,
    this.margin,
  }) : _circleSize = null;

  const NexaSkeleton.circle({super.key, required double size, this.margin})
      : width = size,
        height = size,
        radius = AppRadii.pillAll,
        _circleSize = size;

  final double? width;
  final double height;
  final BorderRadius radius;
  final EdgeInsetsGeometry? margin;
  // ignore: unused_field — documenta a intenção do construtor nomeado.
  final double? _circleSize;

  @override
  State<NexaSkeleton> createState() => _NexaSkeletonState();
}

class _NexaSkeletonState extends State<NexaSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.slow * 2,
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_controller.value);
        return Container(
          width: widget.width,
          height: widget.height,
          margin: widget.margin,
          decoration: BoxDecoration(
            color: colors.onSurfaceMuted
                .withValues(alpha: 0.08 + 0.08 * t),
            borderRadius: widget.radius,
          ),
        );
      },
    );
  }
}

/// Lista de [NexaSkeleton] no formato do conteúdo que vai chegar — o loading
/// padrão das listas, no lugar da rodinha centralizada (que não diz o que vem
/// nem quanto falta).
///
/// - padrão: linhas com avatar redondo de [avatarSize] (0 = sem avatar) e
///   [lines] linhas de texto — notificações, atletas, ranking, avaliações;
/// - [NexaListSkeleton.cards]: blocos de [cardHeight] — torneios, pedidos.
///
/// É um `ListView` com `shrinkWrap` e sem rolagem: cabe dentro de sliver,
/// coluna ou área de altura fixa, e numa área menor que o conteúdo ele corta
/// em vez de estourar. O leitor de tela ouve "Carregando".
class NexaListSkeleton extends StatelessWidget {
  const NexaListSkeleton({
    super.key,
    this.count = 6,
    this.avatarSize = 40,
    this.lines = 2,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    this.gap = 16,
  }) : cardHeight = null;

  const NexaListSkeleton.cards({
    super.key,
    this.count = 4,
    required double this.cardHeight,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    this.gap = 12,
  })  : avatarSize = 0,
        lines = 0;

  final int count;
  final double avatarSize;
  final int lines;
  final double? cardHeight;
  final EdgeInsetsGeometry padding;
  final double gap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Carregando',
      child: ExcludeSemantics(
        child: ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: padding,
          itemCount: count,
          separatorBuilder: (_, __) => SizedBox(height: gap),
          itemBuilder: (_, i) {
            final cardHeight = this.cardHeight;
            if (cardHeight != null) {
              return NexaSkeleton(height: cardHeight, radius: AppRadii.lgAll);
            }
            // Larguras alternadas: linhas iguais leem como "tabela vazia".
            final wide = i.isEven;
            return Row(
              children: [
                if (avatarSize > 0) ...[
                  NexaSkeleton.circle(size: avatarSize),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var l = 0; l < lines; l++) ...[
                        if (l > 0) const SizedBox(height: 8),
                        FractionallySizedBox(
                          widthFactor: l == 0
                              ? (wide ? 0.7 : 0.55)
                              : (wide ? 0.4 : 0.5),
                          child: NexaSkeleton(height: l == 0 ? 13 : 10),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
