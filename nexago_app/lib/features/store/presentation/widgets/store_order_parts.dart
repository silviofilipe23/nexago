import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_checkout_models.dart';
import '../../domain/store_order_rules.dart';
import '../store_checkout_copy.dart';
import 'store_checkout_parts.dart';
import 'store_review_parts.dart';
import 'store_style.dart';

/// Cores da pílula por momento (`LJ_ORD_ST` do desenho).
(Color, Color) storeOrderToneColors(StoreOrderTone tone, AppThemeColors c) =>
    switch (tone) {
      StoreOrderTone.wait => (AppColors.pending, const Color(0x1FF4C543)),
      StoreOrderTone.ready => (AppColors.brandHover, const Color(0x24FF6A1A)),
      StoreOrderTone.progress || StoreOrderTone.transit => (
          c.onSurface,
          c.onSurface.withValues(alpha: 0.08)
        ),
      StoreOrderTone.done => (AppColors.win, const Color(0x1F2BD17E)),
      StoreOrderTone.canceled => (
          const Color(0xFFFF5A4F),
          const Color(0x1FFF3B30)
        ),
    };

/// Selo de status do pedido (ponto + rótulo do portal).
class StoreOrderPill extends StatelessWidget {
  const StoreOrderPill({super.key, required this.status, this.height = 26});

  final StoreOrderStatus status;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (fg, bg) = storeOrderToneColors(storeOrderTone(status), colors);
    final ink = colors.readableTone(fg);
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: ink, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              status.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Selo "PERSONALIZADO" (o `LjTag` do desenho).
class StorePersonalizedTag extends StatelessWidget {
  const StorePersonalizedTag({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 9),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        StoreCheckoutCopy.personalizedTag,
        style: AppTypography.mono(
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: colors.onSurface,
        ),
      ),
    );
  }
}

/// Barra de etapas: feitas em verde, a em curso em laranja.
class StoreOrderProgressBar extends StatelessWidget {
  const StoreOrderProgressBar({
    super.key,
    required this.progress,
    this.labels = true,
  });

  final StoreOrderProgress progress;
  final bool labels;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final steps = progress.steps;
    final step = progress.step;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            for (var i = 0; i < steps.length; i++) ...[
              if (i > 0) const SizedBox(width: 4),
              Expanded(
                child: Container(
                  height: 4,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    color: i < step
                        ? AppColors.win
                        : i == step
                            ? AppColors.brand
                            : StoreCheckoutStyle.line2(colors),
                  ),
                ),
              ),
            ],
          ],
        ),
        if (labels) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              for (var i = 0; i < steps.length; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    steps[i],
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 11,
                      fontWeight: i == step ? FontWeight.w600 : FontWeight.w400,
                      color: i == step
                          ? colors.onSurface
                          : StoreStyle.tertiary(colors),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }
}

/// Linha do tempo vertical (`LjStep`): etapas do portal com a data de cada
/// uma já feita.
class StoreOrderTimeline extends StatelessWidget {
  const StoreOrderTimeline({
    super.key,
    required this.progress,
    this.dates = const [],
  });

  final StoreOrderProgress progress;

  /// Texto de apoio por etapa (a data), na ordem das etapas.
  final List<String?> dates;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final steps = progress.steps;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < steps.length; i++)
          _step(
            colors,
            title: steps[i],
            detail: i < dates.length ? dates[i] : null,
            done: i < progress.step,
            now: i == progress.step,
            last: i == steps.length - 1,
          ),
      ],
    );
  }

  Widget _step(
    AppThemeColors colors, {
    required String title,
    required String? detail,
    required bool done,
    required bool now,
    required bool last,
  }) {
    final ring = done
        ? AppColors.win
        : now
            ? AppColors.brand
            : StoreCheckoutStyle.line2(colors);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? AppColors.win : Colors.transparent,
                  border: Border.all(color: ring, width: 2),
                ),
                child: done
                    ? const Icon(
                        Icons.check_rounded,
                        size: 13,
                        color: StoreStyle.onBrand,
                      )
                    : now
                        ? Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: AppColors.brand,
                              shape: BoxShape.circle,
                            ),
                          )
                        : null,
              ),
              if (!last)
                Expanded(
                  child: Container(
                    width: 2,
                    constraints: const BoxConstraints(minHeight: 20),
                    color:
                        done ? AppColors.win : StoreCheckoutStyle.line(colors),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 16, top: 1),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: done || now
                          ? colors.onSurface
                          : StoreStyle.tertiary(colors),
                    ),
                  ),
                  if (detail != null && detail.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      detail,
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
        ],
      ),
    );
  }
}

/// Fotos do pedido (até [max]) e o "+N" do resto.
class StoreOrderThumbs extends StatelessWidget {
  const StoreOrderThumbs({
    super.key,
    required this.items,
    this.size = 52,
    this.max = 2,
  });

  final List<StoreOrderItem> items;
  final double size;
  final int max;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shown = items.take(max).toList();
    final more = items.length - shown.length;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < shown.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          StoreThumb(url: shown[i].imageUrl, size: size, radius: 12),
        ],
        if (more > 0) ...[
          const SizedBox(width: 8),
          Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: StoreStyle.surface(colors),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '+$more',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: StoreStyle.secondary(colors),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Uma ação do card do pedido.
class StoreOrderAction {
  const StoreOrderAction(
    this.label,
    this.onTap, {
    this.primary = false,
    this.icon,
    this.pill = false,
    this.key,
  });

  final String label;
  final VoidCallback? onTap;
  final bool primary;
  final IconData? icon;

  /// A pílula laranja tingida com a estrela ("Avaliar", `LjAppMeusPedidos`).
  final bool pill;
  final Key? key;

  Widget build() => pill
      ? StoreReviewPillButton(key: key, label: label, onPressed: onTap)
      : StoreSoftButton(
          key: key,
          label: label,
          icon: icon,
          primary: primary,
          onPressed: onTap,
        );
}

/// Card de "Meus pedidos" (`LjAppOrderCard`).
class StoreOrderCard extends StatelessWidget {
  const StoreOrderCard({
    super.key,
    required this.order,
    required this.now,
    required this.onOpen,
    this.actions = const [],
  });

  final StoreOrderView order;
  final DateTime now;
  final VoidCallback onOpen;
  final List<StoreOrderAction> actions;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final o = order;
    final hot = o.status == StoreOrderStatus.ret;
    final progress = storeOrderProgress(o);
    final info = storeOrderInfo(o);
    final where = storeOrderWhere(o);
    final infoBlock = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (info.isNotEmpty)
          Text(
            info,
            style: AppTypography.soraRegular(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: hot ? AppColors.brandHover : colors.onSurface,
            ),
          ),
        if (info.isNotEmpty) const SizedBox(height: 2),
        Row(
          children: [
            Icon(
              o.atArena ? Icons.place_outlined : Icons.local_shipping_outlined,
              size: 12,
              color: StoreStyle.tertiary(colors),
            ),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                where,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w400,
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ),
          ],
        ),
      ],
    );
    List<Widget> buttons() => [
          for (var i = 0; i < actions.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            actions[i].build(),
          ],
        ];
    return Material(
      color: StoreCheckoutStyle.card(colors),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(
          color: hot
              ? AppColors.brand.withValues(alpha: 0.35)
              : StoreCheckoutStyle.line(colors),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Flexible(child: StoreOrderPill(status: o.status)),
                        if (storeOrderPersonalized(o)) ...[
                          const SizedBox(width: 6),
                          const StorePersonalizedTag(),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    formatStoreOrderDate(o.createdAt, now),
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: StoreStyle.tertiary(colors),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  StoreOrderThumbs(items: o.items),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          storeOrderTitle(o),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${StoreCheckoutCopy.orderNumber(o.number)} · '
                          '${StoreCheckoutCopy.price(o.totalCents)}',
                          style: AppTypography.soraRegular(
                            fontSize: 12,
                            fontWeight: FontWeight.w400,
                            color: StoreStyle.tertiary(colors),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: StoreStyle.tertiary(colors),
                  ),
                ],
              ),
              if (progress != null) ...[
                const SizedBox(height: 14),
                StoreOrderProgressBar(progress: progress, labels: false),
              ],
              const SizedBox(height: 14),
              if (actions.length <= 1)
                Row(
                  children: [
                    Expanded(child: infoBlock),
                    if (actions.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      ...buttons(),
                    ],
                  ],
                )
              else ...[
                infoBlock,
                const SizedBox(height: 12),
                Wrap(
                  alignment: WrapAlignment.end,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final a in actions) a.build(),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// "Pronto pra retirar" (app 07): o card laranja com o código grande, a
/// arena, o prazo e o "Como chegar".
class StorePickupReadyCard extends StatelessWidget {
  const StorePickupReadyCard({
    super.key,
    required this.delivery,
    required this.onDirections,
  });

  final StoreOrderArenaDelivery delivery;

  /// `null` sem endereço da arena no espelho.
  final VoidCallback? onDirections;

  static const Color _ink = Color(0xFF0A0A0A);

  @override
  Widget build(BuildContext context) {
    final d = delivery;
    final code = d.pickupCode ?? '—';
    final place = [
      d.placeName ?? 'Arena',
      if (d.counter case final c?) c,
    ].join(' · ');
    final deadline = d.pickupDeadline;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: [0, 0.55, 1],
          colors: [Color(0xFFFF7A2E), Color(0xFFE2540B), Color(0xFF7A2C05)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            place,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: _ink.withValues(alpha: 0.7),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            StoreOrderStatus.ret.label,
            style: AppTypography.soraRegular(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.1,
              height: 1.05,
              color: _ink,
            ),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF4F4F5),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                if (d.pickupCode != null) ...[
                  SizedBox.square(
                    dimension: 96,
                    child: QrImageView(
                      data: code,
                      padding: EdgeInsets.zero,
                      backgroundColor: const Color(0xFFF4F4F5),
                      eyeStyle: const QrEyeStyle(
                        eyeShape: QrEyeShape.square,
                        color: _ink,
                      ),
                      dataModuleStyle: const QrDataModuleStyle(
                        dataModuleShape: QrDataModuleShape.square,
                        color: _ink,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        StoreCheckoutCopy.pickupCode,
                        style: AppTypography.mono(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.3,
                          color: _ink.withValues(alpha: 0.55),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        code,
                        key: const ValueKey('store-pickup-code'),
                        style: AppTypography.soraRegular(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.7,
                          color: _ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        deadline != null
                            ? StoreCheckoutCopy.pickupUntil(
                                formatStoreDeadline(deadline),
                              )
                            : StoreCheckoutCopy.showAt(d.counter),
                        key: const ValueKey('store-pickup-deadline'),
                        style: AppTypography.soraRegular(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                          color: _ink.withValues(alpha: 0.6),
                        ),
                      ),
                      if (deadline != null)
                        Text(
                          StoreCheckoutCopy.showAt(d.counter),
                          style: AppTypography.soraRegular(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w400,
                            color: _ink.withValues(alpha: 0.6),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (onDirections != null) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onDirections,
              style: FilledButton.styleFrom(
                backgroundColor: _ink,
                foregroundColor: AppColors.brandHover,
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
              icon: const Icon(Icons.place_outlined, size: 17),
              label: Text(
                StoreCheckoutCopy.directions,
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
