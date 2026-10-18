import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../store_checkout_copy.dart';
import '../store_copy.dart';
import 'store_header.dart';
import 'store_style.dart';

/// Peças do carrinho, do checkout e dos pedidos (app 03–08), no traço do
/// desenho (`loja-app.jsx` / `loja-endereco.jsx`): bordas de 1,5 px, laranja
/// com 6% de fundo no escolhido, rótulos mono em caixa alta.
abstract final class StoreCheckoutStyle {
  StoreCheckoutStyle._();

  /// `LJ.line` (8%) e `LJ.line2` (16%).
  static Color line(AppThemeColors c) => c.onSurface.withValues(alpha: 0.08);
  static Color line2(AppThemeColors c) => c.onSurface.withValues(alpha: 0.16);

  /// Fundo laranja do item escolhido (`rgba(255,106,26,0.06)`).
  static const Color selectedTint = Color(0x0FFF6A1A);

  /// Pílula laranja (`LJ.tint`).
  static const Color tint = Color(0x1FFF6A1A);

  /// Cartão da etapa/lista (`LJ.s0`).
  static Color card(AppThemeColors c) => c.surfaceCard;
}

/// Header das telas do checkout: voltar · título (e linha de apoio) · ação.
/// Fixo FORA da lista (ver `NexaPageHeader`).
class StoreTitleHeader extends StatelessWidget {
  const StoreTitleHeader({
    super.key,
    required this.title,
    this.subtitle,
    required this.onBack,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final VoidCallback onBack;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sub = subtitle;
    return Row(
      children: [
        StoreRoundButton(
          icon: Icons.chevron_left_rounded,
          iconSize: 26,
          tooltip: StoreCopy.back,
          onTap: onBack,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.72,
                  height: 1.1,
                  color: colors.onSurface,
                ),
              ),
              if (sub != null && sub.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w400,
                    color: StoreStyle.tertiary(colors),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing case final t?) ...[const SizedBox(width: 8), t],
      ],
    );
  }
}

/// Rótulo de seção ("COMO RECEBER", "PRAZO") — mono, caixa alta, apagado.
class StoreSectionLabel extends StatelessWidget {
  const StoreSectionLabel(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final label = Text(
      text,
      style: AppTypography.mono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.4,
        color: StoreStyle.tertiary(context.themeColors),
      ),
    );
    final t = trailing;
    if (t == null) return label;
    return Row(children: [Expanded(child: label), t]);
  }
}

/// Rádio do desenho (20 px, aro laranja e miolo de 10 px quando ligado).
class StoreRadioDot extends StatelessWidget {
  const StoreRadioDot({super.key, required this.on});

  final bool on;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: on
              ? AppColors.brand
              : StoreCheckoutStyle.line2(context.themeColors),
          width: 2,
        ),
      ),
      child: on
          ? Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: AppColors.brand,
                shape: BoxShape.circle,
              ),
            )
          : null,
    );
  }
}

/// Seletor segmentado ("Retirar na arena" · "Entregar"): o escolhido em
/// fundo claro e texto escuro.
class StoreSegmented extends StatelessWidget {
  const StoreSegmented({
    super.key,
    required this.options,
    required this.selectedId,
    required this.onChanged,
  });

  /// `(id, rótulo)`.
  final List<(String, String)> options;
  final String? selectedId;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.lgAll,
      ),
      child: Row(
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(child: _segment(colors, options[i])),
          ],
        ],
      ),
    );
  }

  Widget _segment(AppThemeColors colors, (String, String) option) {
    final (id, label) = option;
    final on = id == selectedId;
    return Semantics(
      selected: on,
      button: true,
      child: Material(
        color: on ? colors.onSurface : Colors.transparent,
        borderRadius: AppRadii.mdAll,
        child: InkWell(
          key: ValueKey('store-segment-$id'),
          borderRadius: AppRadii.mdAll,
          onTap: on ? null : () => onChanged(id),
          child: SizedBox(
            height: 44,
            child: Center(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13.5,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w600,
                  color: on ? colors.canvas : StoreStyle.secondary(colors),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cartão de escolha (arena, endereço, prazo, Pix): borda de 1,5 px, laranja
/// com fundo tingido quando escolhido.
class StoreChoiceTile extends StatelessWidget {
  const StoreChoiceTile({
    super.key,
    required this.title,
    this.titleTrailing,
    this.subtitle,
    this.detail,
    this.leading,
    this.trailing,
    this.selected = false,
    this.radio = false,
    this.onTap,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  });

  final String title;

  /// Ao lado do título (o "PRINCIPAL" do endereço).
  final Widget? titleTrailing;
  final String? subtitle;

  /// Segunda linha de apoio (a cidade e o CEP do endereço).
  final String? detail;
  final Widget? leading;
  final Widget? trailing;
  final bool selected;

  /// Mostra o rádio à esquerda.
  final bool radio;
  final VoidCallback? onTap;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sub = subtitle;
    final det = detail;
    return Material(
      color: selected ? StoreCheckoutStyle.selectedTint : Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.lgAll,
        side: BorderSide(
          color: selected ? AppColors.brand : StoreCheckoutStyle.line(colors),
          width: 1.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding,
          child: Row(
            children: [
              if (radio) ...[
                StoreRadioDot(on: selected),
                const SizedBox(width: 12),
              ],
              if (leading case final l?) ...[l, const SizedBox(width: 12)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        if (titleTrailing case final t?) ...[
                          const SizedBox(width: 8),
                          t,
                        ],
                      ],
                    ),
                    if (sub != null && sub.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        sub,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w400,
                          color: StoreStyle.secondary(colors),
                        ),
                      ),
                    ],
                    if (det != null && det.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        det,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: StoreStyle.tertiary(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing case final t?) ...[const SizedBox(width: 10), t],
            ],
          ),
        ),
      ),
    );
  }
}

/// Preço à direita de um cartão de escolha ("Grátis" em verde).
class StoreChoicePrice extends StatelessWidget {
  const StoreChoicePrice(this.label, {super.key, this.free = false});

  final String label;
  final bool free;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppTypography.soraRegular(
        fontSize: 13.5,
        fontWeight: FontWeight.w700,
        color: free ? AppColors.win : context.themeColors.onSurface,
      ),
    );
  }
}

/// Quantidade da linha (− n +). No 1, o "−" vira lixeira e remove a linha.
class StoreLineStepper extends StatelessWidget {
  const StoreLineStepper({
    super.key,
    required this.qty,
    required this.max,
    required this.onChanged,
    required this.removeTooltip,
    this.enabled = true,
  });

  final int qty;
  final int max;
  final ValueChanged<int> onChanged;
  final String removeTooltip;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final remove = qty <= 1;
    return Container(
      height: 34,
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.mdAll,
        border: Border.all(color: StoreCheckoutStyle.line(colors)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _button(
            colors,
            icon: remove ? Icons.delete_outline_rounded : Icons.remove_rounded,
            tooltip: remove ? removeTooltip : StoreCheckoutCopy.qtyLess,
            onTap: enabled ? () => onChanged(remove ? 0 : qty - 1) : null,
          ),
          SizedBox(
            width: 24,
            child: Text(
              '$qty',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ),
          _button(
            colors,
            icon: Icons.add_rounded,
            tooltip: StoreCheckoutCopy.qtyMore,
            onTap: enabled && qty < max ? () => onChanged(qty + 1) : null,
          ),
        ],
      ),
    );
  }

  Widget _button(
    AppThemeColors colors, {
    required IconData icon,
    required String tooltip,
    required VoidCallback? onTap,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: 20,
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(
            icon,
            size: 16,
            color:
                onTap == null ? StoreStyle.tertiary(colors) : colors.onSurface,
          ),
        ),
      ),
    );
  }
}

/// Linha do resumo ("Subtotal · R$ 559,60"); [win] pinta o valor de verde.
class StoreSummaryRow extends StatelessWidget {
  const StoreSummaryRow({
    super.key,
    required this.label,
    required this.value,
    this.win = false,
  });

  final String label;
  final String value;
  final bool win;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13.5,
              fontWeight: FontWeight.w400,
              color: StoreStyle.secondary(colors),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Text(
          value,
          style: AppTypography.soraRegular(
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
            color: win ? AppColors.win : colors.onSurface,
          ),
        ),
      ],
    );
  }
}

/// Foto quadrada da linha/pedido; sem foto, o listrado do desenho.
class StoreThumb extends StatelessWidget {
  const StoreThumb({
    super.key,
    required this.url,
    this.size = 76,
    this.radius = 16,
  });

  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final url = this.url;
    const striped = StoreStripedBox();
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox.square(
        dimension: size,
        child: url == null
            ? striped
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                memCacheHeight: (size * dpr).round(),
                placeholder: (_, _) => striped,
                errorWidget: (_, _, _) => striped,
              ),
      ),
    );
  }
}

/// Botão tracejado ("Adicionar endereço").
class StoreDashedButton extends StatelessWidget {
  const StoreDashedButton({
    super.key,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.icon = Icons.add_rounded,
  });

  final String label;
  final String? subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sub = subtitle;
    return CustomPaint(
      painter: _DashedBorderPainter(StoreCheckoutStyle.line2(colors)),
      child: Material(
        color: Colors.transparent,
        borderRadius: AppRadii.lgAll,
        child: InkWell(
          borderRadius: AppRadii.lgAll,
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 54),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(icon, size: 18, color: AppColors.brand),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          label,
                          style: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.brand,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (sub != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      sub,
                      textAlign: TextAlign.center,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: StoreStyle.tertiary(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final rrect = RRect.fromRectAndRadius(
      (Offset.zero & size).deflate(0.75),
      const Radius.circular(AppRadii.lg),
    );
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + 6), paint);
        distance += 11;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Barra fixa no rodapé (`LjAppBar`): total à esquerda e o botão principal.
/// [top] entra acima da linha (o CPF, o motivo do "Pagar" travado).
///
/// Fica no `body`, não no `bottomNavigationBar`: com o teclado aberto (CPF)
/// ela sobe junto em vez de ficar escondida.
class StoreCheckoutBar extends StatelessWidget {
  const StoreCheckoutBar({
    super.key,
    this.label,
    this.value,
    this.valueStale = false,
    required this.button,
    this.top,
  });

  /// "Total" / "Total com frete"; `null` = só o botão, na largura toda.
  final String? label;

  /// O total (ou um carregando).
  final Widget? value;
  final bool valueStale;
  final Widget button;
  final Widget? top;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    final label = this.label;
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: BorderSide(color: StoreCheckoutStyle.line(colors))),
      ),
      padding: EdgeInsets.fromLTRB(20, 14, 20, 12 + (keyboard ? 0 : bottom)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (top case final t?) ...[t, const SizedBox(height: 12)],
          Row(
            children: [
              if (label != null) ...[
                Expanded(
                  flex: 10,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: StoreStyle.tertiary(colors),
                        ),
                      ),
                      AnimatedOpacity(
                        opacity: valueStale ? 0.45 : 1,
                        duration: const Duration(milliseconds: 160),
                        child: DefaultTextStyle(
                          style: AppTypography.soraRegular(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.44,
                            color: colors.onSurface,
                          ),
                          child: value ?? const Text('—'),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(flex: 13, child: button),
              ] else
                Expanded(child: button),
            ],
          ),
        ],
      ),
    );
  }
}

/// Botão principal laranja do desenho (58 px, cantos de 18).
class StorePrimaryButton extends StatelessWidget {
  const StorePrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 58,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final double height;

  @override
  Widget build(BuildContext context) {
    final style = AppTypography.soraRegular(
      fontSize: 16,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.16,
    );
    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: StoreStyle.onBrand,
        disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.32),
        disabledForegroundColor: StoreStyle.onBrand.withValues(alpha: 0.7),
        minimumSize: Size.fromHeight(height),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(height > 50 ? 18 : 14),
        ),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon case final i?) ...[
              Icon(i, size: 18),
              const SizedBox(width: 8)
            ],
            Text(label, style: style),
          ],
        ),
      ),
    );
  }
}

/// Botão secundário (`LjBtn kind="soft"`): fundo de superfície e borda fina.
class StoreSoftButton extends StatelessWidget {
  const StoreSoftButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.height = 44,
    this.primary = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final double height;

  /// Laranja (`kind="primary"`) em vez de superfície.
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(height > 50 ? 18 : 14),
      side: primary
          ? BorderSide.none
          : BorderSide(color: StoreCheckoutStyle.line(colors)),
    );
    final text = Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style:
          AppTypography.soraRegular(fontSize: 13, fontWeight: FontWeight.w700),
    );
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: primary ? AppColors.brand : StoreStyle.surface(colors),
        foregroundColor: primary ? StoreStyle.onBrand : colors.onSurface,
        disabledBackgroundColor: StoreStyle.surface(colors),
        minimumSize: Size(0, height),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        shape: shape,
      ),
      child: icon == null
          ? text
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16),
                const SizedBox(width: 6),
                Flexible(child: text),
              ],
            ),
    );
  }
}
