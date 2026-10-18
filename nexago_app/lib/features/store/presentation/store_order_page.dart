import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/store_checkout_providers.dart';
import '../application/store_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_order_rules.dart';
import 'store_checkout_copy.dart';
import 'store_order_actions.dart';
import 'widgets/store_checkout_parts.dart';
import 'widgets/store_order_parts.dart';
import 'widgets/store_style.dart';

/// Loja · Pedido (app 06 Pix · 07 Pronto pra retirar,
/// `/loja/pedidos/:orderId`).
///
/// Logo depois do checkout mostra o Pix que veio pelo `extra` ([created]):
/// o espelho `storeOrderViews/{id}` nasce ~1 s depois, por gatilho. A tela
/// escuta o espelho ao vivo — o webhook confirma o pagamento e ela vira
/// sozinha ("Pagamento aprovado!").
class StoreOrderPage extends ConsumerStatefulWidget {
  const StoreOrderPage({
    super.key,
    required this.orderId,
    this.created,
    this.clock,
    this.notFoundAfter = const Duration(seconds: 8),
  });

  final String orderId;

  /// O que o `createStoreOrder` devolveu (só quando veio do checkout).
  final StoreCreatedOrder? created;

  /// Relógio injetável (contagem do Pix e datas); padrão: agora.
  final DateTime Function()? clock;

  /// Sem espelho e sem o Pix na mão depois disso: não é um pedido do atleta.
  final Duration notFoundAfter;

  @override
  ConsumerState<StoreOrderPage> createState() => _StoreOrderPageState();
}

class _StoreOrderPageState extends ConsumerState<StoreOrderPage> {
  late DateTime _now = _clock();
  Timer? _tick;
  Timer? _notFoundTimer;
  Timer? _copiedTimer;
  bool _notFound = false;
  bool _seenOrder = false;

  /// O pagamento caiu com a tela aberta.
  bool _justPaid = false;
  bool _copied = false;
  bool _rebuying = false;

  DateTime _clock() => widget.clock?.call() ?? DateTime.now();

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  /// O Pix do checkout, se é deste pedido.
  StoreCreatedOrder? get _handoff {
    final c = widget.created;
    return c != null && c.orderId == widget.orderId ? c : null;
  }

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = _clock());
    });
    _notFoundTimer = Timer(widget.notFoundAfter, () {
      final order = ref.read(storeOrderProvider(widget.orderId)).valueOrNull;
      if (mounted && order == null && _handoff == null) {
        setState(() => _notFound = true);
      }
    });
    ref.listenManual<AsyncValue<StoreOrderView?>>(
      storeOrderProvider(widget.orderId),
      _onOrder,
      fireImmediately: true,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _analytics.logStoreOrderView(orderId: widget.orderId);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _notFoundTimer?.cancel();
    _copiedTimer?.cancel();
    super.dispose();
  }

  void _onOrder(
    AsyncValue<StoreOrderView?>? previous,
    AsyncValue<StoreOrderView?> next,
  ) {
    if (next.hasError && !next.hasValue) {
      // Sem permissão (não é do atleta) e sem o Pix na mão: "não achamos".
      if (_handoff == null) setState(() => _notFound = true);
      return;
    }
    final o = next.valueOrNull;
    if (o == null) return;
    final paid =
        o.status != StoreOrderStatus.pag && o.status != StoreOrderStatus.can;
    final before = previous?.valueOrNull;
    // Caiu com a tela aberta: estava aguardando, ou o espelho já chegou pago
    // logo depois do checkout.
    final justPaid = paid &&
        (before?.status == StoreOrderStatus.pag ||
            (!_seenOrder && _handoff != null));
    _seenOrder = true;
    setState(() {
      _notFound = false;
      if (justPaid) _justPaid = true;
    });
  }

  // ── Ações ─────────────────────────────────────────────────────────────

  Future<void> _copy(String code) async {
    try {
      await Clipboard.setData(ClipboardData(text: code));
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, StoreCheckoutCopy.copyError, isError: true);
      }
      return;
    }
    _analytics.logStorePixCopy(orderId: widget.orderId);
    _copiedTimer?.cancel();
    if (!mounted) return;
    setState(() => _copied = true);
    _copiedTimer = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Future<void> _rebuy(StoreOrderView order) async {
    if (_rebuying) return;
    setState(() => _rebuying = true);
    await rebuyStoreOrder(context, ref, order);
    if (mounted) setState(() => _rebuying = false);
  }

  void _back() => popOrGo(context, AppRoutes.store);

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // O catálogo fica vivo para o "Comprar de novo".
    ref.watch(storeCatalogProvider);
    final order = ref.watch(storeOrderProvider(widget.orderId)).valueOrNull;
    final handoff = _handoff;

    final StoreOrderPix? pix;
    if (order != null) {
      pix = order.status == StoreOrderStatus.pag ? order.pix : null;
    } else {
      pix = handoff?.pix;
    }
    final number = order?.number ?? handoff?.number ?? '';
    final units = order == null
        ? 0
        : (order.units > 0
            ? order.units
            : order.items.fold<int>(0, (n, i) => n + i.qty));

    final Widget body;
    if (order == null && pix == null) {
      body = _notFound
          ? _notFoundView(colors)
          : const Center(child: CircularProgressIndicator());
    } else {
      body = ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          6,
          AppSpacing.screenH,
          AppSpacing.xxxl + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          if (pix != null)
            ..._pixSection(colors, pix, order, handoff)
          else if (order != null)
            ..._trackingSection(colors, order),
          if (order != null) ...[
            const SizedBox(height: 22),
            ..._summary(colors, order),
          ] else ...[
            const SizedBox(height: 18),
            Text(
              StoreCheckoutCopy.detailsSoon,
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                color: StoreStyle.tertiary(colors),
              ),
            ),
          ],
          const SizedBox(height: 18),
          Center(
            child: TextButton(
              onPressed: () => context.pushNamed(AppRouteNames.storeOrders),
              style: TextButton.styleFrom(foregroundColor: AppColors.brand),
              child: const Text(StoreCheckoutCopy.allOrders),
            ),
          ),
        ],
      );
    }

    final pending = pix != null;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.md,
        ),
        header: StoreTitleHeader(
          title: pending
              ? StoreCheckoutCopy.pixTitle
              : StoreCheckoutCopy.orderTitle,
          subtitle: number.isEmpty
              ? null
              : pending || units == 0
                  ? StoreCheckoutCopy.orderSubtitle(number)
                  : StoreCheckoutCopy.orderSubtitleWithUnits(number, units),
          onBack: _back,
        ),
        child: body,
      ),
    );
  }

  Widget _notFoundView(AppThemeColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.receipt_long_outlined,
              size: 40,
              color: StoreStyle.tertiary(colors),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              StoreCheckoutCopy.notFoundTitle,
              textAlign: TextAlign.center,
              style: AppTypography.titleM.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              StoreCheckoutCopy.notFoundBody,
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                color: StoreStyle.secondary(colors),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            StoreSoftButton(
              label: StoreCheckoutCopy.myOrders,
              onPressed: () => context.pushNamed(AppRouteNames.storeOrders),
            ),
          ],
        ),
      ),
    );
  }

  // ── 06 Pix ────────────────────────────────────────────────────────────

  List<Widget> _pixSection(
    AppThemeColors colors,
    StoreOrderPix pix,
    StoreOrderView? order,
    StoreCreatedOrder? handoff,
  ) {
    final countdown = storePixCountdown(pix.expiresAt, _now);
    final total = order?.totalCents ?? handoff?.totalCents ?? 0;
    if (countdown == null) {
      return [
        Container(
          key: const ValueKey('store-pix-expired'),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: StoreCheckoutStyle.card(colors),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: StoreCheckoutStyle.line(colors)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const StoreSectionLabel(StoreCheckoutCopy.pixExpiredKicker),
              const SizedBox(height: 8),
              Text(
                StoreCheckoutCopy.pixExpiredTitle,
                style: AppTypography.titleM.copyWith(color: colors.onSurface),
              ),
              const SizedBox(height: 6),
              Text(
                StoreCheckoutCopy.pixExpiredBody,
                style: AppTypography.bodyS.copyWith(
                  color: StoreStyle.secondary(colors),
                ),
              ),
              const SizedBox(height: 16),
              StoreSoftButton(
                label: StoreCheckoutCopy.rebuildCart,
                onPressed:
                    order == null || _rebuying ? null : () => _rebuy(order),
              ),
            ],
          ),
        ),
      ];
    }
    final progress = order != null ? storeOrderProgress(order) : null;
    return [
      Center(
        child: Text(
          StoreCheckoutCopy.payWithPix,
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w400,
            color: StoreStyle.secondary(colors),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Center(
        child: Text(
          StoreCheckoutCopy.price(total),
          key: const ValueKey('store-pix-amount'),
          style: AppTypography.soraRegular(
            fontSize: 40,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.6,
            color: colors.onSurface,
          ),
        ),
      ),
      const SizedBox(height: 6),
      Center(
        child: Container(
          height: 28,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: StoreCheckoutStyle.tint,
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text(
            StoreCheckoutCopy.expiresIn(countdown),
            key: const ValueKey('store-pix-countdown'),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
            ),
          ),
        ),
      ),
      const SizedBox(height: 22),
      Center(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF4F4F5),
            borderRadius: BorderRadius.circular(24),
          ),
          child: SizedBox.square(
            dimension: 200,
            child: QrImageView(
              key: const ValueKey('store-pix-qr'),
              data: pix.copyPaste,
              padding: EdgeInsets.zero,
              backgroundColor: const Color(0xFFF4F4F5),
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color: Colors.black,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color: Colors.black,
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 8),
      const Center(child: StoreSectionLabel(StoreCheckoutCopy.qrLabel)),
      const SizedBox(height: 20),
      StorePrimaryButton(
        key: const ValueKey('store-pix-copy'),
        height: 56,
        label: _copied ? StoreCheckoutCopy.copied : StoreCheckoutCopy.copyPix,
        icon: _copied ? Icons.check_rounded : Icons.copy_rounded,
        onPressed: () => _copy(pix.copyPaste),
      ),
      const SizedBox(height: 12),
      Text(
        StoreCheckoutCopy.pixWillNotify,
        textAlign: TextAlign.center,
        style: AppTypography.soraRegular(
          fontSize: 12.5,
          fontWeight: FontWeight.w400,
          color: StoreStyle.tertiary(colors),
        ),
      ),
      const SizedBox(height: 22),
      Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: StoreCheckoutStyle.card(colors),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: StoreCheckoutStyle.line(colors)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const StoreSectionLabel(StoreCheckoutCopy.bankStepsTitle),
            const SizedBox(height: 12),
            for (var i = 0; i < StoreCheckoutCopy.bankSteps.length; i++) ...[
              if (i > 0) const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: StoreCheckoutStyle.tint,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${i + 1}',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      StoreCheckoutCopy.bankSteps[i],
                      style: AppTypography.bodyS.copyWith(
                        color: StoreStyle.secondary(colors),
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                const _PulsingDot(),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    StoreCheckoutCopy.waitingPayment,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      if (progress != null && order != null) ...[
        const SizedBox(height: 14),
        _timelineCard(colors, order, progress),
      ],
    ];
  }

  // ── 07 / acompanhamento ───────────────────────────────────────────────

  List<Widget> _trackingSection(AppThemeColors colors, StoreOrderView o) {
    final d = o.delivery;
    final progress = storeOrderProgress(o);
    final info = storeOrderInfo(o);
    final reason = o.cancelReason;
    final closed = o.status == StoreOrderStatus.ent ||
        o.status == StoreOrderStatus.rtd ||
        o.status == StoreOrderStatus.can;
    return [
      if (_justPaid) ...[
        _PaidBanner(atArena: o.atArena),
        const SizedBox(height: 16),
      ],
      if (o.status == StoreOrderStatus.ret && d is StoreOrderArenaDelivery) ...[
        StorePickupReadyCard(
          key: const ValueKey('store-pickup-ready'),
          delivery: d,
          onDirections: d.address == null
              ? null
              : () =>
                  openStoreOrderLink(context, ref, storeMapsUri(d.address!)),
        ),
        const SizedBox(height: 18),
      ],
      Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: StoreCheckoutStyle.card(colors),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: StoreCheckoutStyle.line(colors)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(
                  child: StoreSectionLabel(StoreCheckoutCopy.statusTitle),
                ),
                if (storeOrderPersonalized(o)) ...[
                  const StorePersonalizedTag(),
                  const SizedBox(width: 6),
                ],
                StoreOrderPill(
                  key: const ValueKey('store-order-status'),
                  status: o.status,
                ),
              ],
            ),
            if (progress != null) ...[
              const SizedBox(height: 16),
              StoreOrderTimeline(
                progress: progress,
                dates: _timelineDates(o),
              ),
            ],
            if (info.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                info,
                key: const ValueKey('store-order-info'),
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: o.status == StoreOrderStatus.ret
                      ? AppColors.brandHover
                      : colors.onSurface,
                ),
              ),
            ],
            if (o.status == StoreOrderStatus.can && reason != null) ...[
              const SizedBox(height: 6),
              Text(
                StoreCheckoutCopy.cancelReason(reason),
                style: AppTypography.bodyS.copyWith(
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ],
            if (o.status == StoreOrderStatus.tra &&
                d is StoreOrderHomeDelivery &&
                d.trackingUrl != null) ...[
              const SizedBox(height: 14),
              StoreSoftButton(
                label: StoreCheckoutCopy.track(d.carrier),
                icon: Icons.local_shipping_outlined,
                onPressed: () {
                  final uri = Uri.tryParse(d.trackingUrl!);
                  if (uri != null) openStoreOrderLink(context, ref, uri);
                },
              ),
            ],
            if (closed) ...[
              const SizedBox(height: 14),
              StoreSoftButton(
                key: const ValueKey('store-order-rebuy'),
                label: StoreCheckoutCopy.rebuy,
                icon: Icons.refresh_rounded,
                onPressed: _rebuying ? null : () => _rebuy(o),
              ),
            ],
          ],
        ),
      ),
    ];
  }

  List<String?> _timelineDates(StoreOrderView o) => [
        o.paidAt,
        o.separatedAt,
        o.atArena ? o.arrivedAt : o.shippedAt,
        o.completedAt,
      ].map((d) => d == null ? null : formatStoreOrderDate(d, _now)).toList();

  Widget _timelineCard(
    AppThemeColors colors,
    StoreOrderView o,
    StoreOrderProgress progress,
  ) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: StoreCheckoutStyle.card(colors),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: StoreCheckoutStyle.line(colors)),
      ),
      child: StoreOrderTimeline(progress: progress, dates: _timelineDates(o)),
    );
  }

  // ── Resumo ────────────────────────────────────────────────────────────

  List<Widget> _summary(AppThemeColors colors, StoreOrderView o) {
    final d = o.delivery;
    final created = formatStoreOrderDate(o.createdAt, _now);
    final shipping = o.shippingCents == 0
        ? StoreCheckoutCopy.free
        : StoreCheckoutCopy.price(o.shippingCents);
    final String shippingLabel = switch (d) {
      StoreOrderArenaDelivery() => StoreCheckoutCopy.pickupRow,
      StoreOrderHomeDelivery(modeName: final mode?) =>
        StoreCheckoutCopy.shippingRow(mode),
      StoreOrderHomeDelivery() => 'Frete',
    };
    final String? whereDetail = switch (d) {
      StoreOrderArenaDelivery(address: final a) => a,
      StoreOrderHomeDelivery(city: final city?, uf: final uf) =>
        uf != null ? '$city, $uf' : city,
      StoreOrderHomeDelivery() => null,
    };
    return [
      StoreSectionLabel(
        StoreCheckoutCopy.itemsTitle,
        trailing: created.isEmpty
            ? null
            : Text(
                created,
                style: AppTypography.bodyS.copyWith(
                  color: StoreStyle.tertiary(colors),
                ),
              ),
      ),
      const SizedBox(height: 10),
      for (final i in o.items) ...[
        Row(
          children: [
            StoreThumb(url: i.imageUrl, size: 52, radius: 12),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    i.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      i.variantLabel,
                      i.customizationLabel ?? '',
                      '${i.qty}×',
                    ].where((s) => s.isNotEmpty).join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      color: StoreStyle.tertiary(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text(
              StoreCheckoutCopy.price(i.totalCents),
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
      ],
      const SizedBox(height: 6),
      StoreSummaryRow(
        label: 'Subtotal',
        value: StoreCheckoutCopy.price(o.subtotalCents),
      ),
      if (o.couponDiscountCents > 0) ...[
        const SizedBox(height: 10),
        StoreSummaryRow(
          label: StoreCheckoutCopy.couponRow(o.couponCode ?? ''),
          value: StoreCheckoutCopy.discount(o.couponDiscountCents),
          win: true,
        ),
      ],
      if (o.pixDiscountCents > 0) ...[
        const SizedBox(height: 10),
        StoreSummaryRow(
          label: StoreCheckoutCopy.pixDiscount,
          value: StoreCheckoutCopy.discount(o.pixDiscountCents),
          win: true,
        ),
      ],
      const SizedBox(height: 10),
      StoreSummaryRow(
        label: shippingLabel,
        value: shipping,
        win: o.shippingCents == 0,
      ),
      const SizedBox(height: 12),
      Divider(height: 1, color: StoreCheckoutStyle.line(colors)),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: Text(
              StoreCheckoutCopy.total,
              style: AppTypography.titleS.copyWith(color: colors.onSurface),
            ),
          ),
          Text(
            StoreCheckoutCopy.price(o.totalCents),
            key: const ValueKey('store-order-total'),
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
      const SizedBox(height: 18),
      StoreSectionLabel(
        o.atArena ? StoreCheckoutCopy.pickupWhere : StoreCheckoutCopy.homeWhere,
      ),
      const SizedBox(height: 6),
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            o.atArena ? Icons.place_outlined : Icons.local_shipping_outlined,
            size: 16,
            color: o.atArena ? AppColors.brand : StoreStyle.secondary(colors),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  storeOrderWhere(o),
                  style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                ),
                if (whereDetail != null)
                  Text(
                    whereDetail,
                    style: AppTypography.bodyS.copyWith(
                      color: StoreStyle.tertiary(colors),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      if (o.refundedCents > 0) ...[
        const SizedBox(height: 12),
        Text(
          StoreCheckoutCopy.refunded(o.refundedCents),
          style: AppTypography.bodyS.copyWith(
            color: StoreStyle.secondary(colors),
          ),
        ),
      ],
    ];
  }
}

class _PaidBanner extends StatelessWidget {
  const _PaidBanner({required this.atArena});

  final bool atArena;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      key: const ValueKey('store-order-paid'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              color: StoreStyle.onBrand,
              size: 22,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  StoreCheckoutCopy.paidTitle,
                  style: AppTypography.titleM.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: 2),
                Text(
                  atArena
                      ? StoreCheckoutCopy.paidArena
                      : StoreCheckoutCopy.paidHome,
                  style: AppTypography.bodyS.copyWith(
                    color: StoreStyle.secondary(colors),
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

/// O ponto laranja do "Aguardando o pagamento…" (some com as animações
/// desligadas).
class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _pulse.stop();
      _pulse.value = 1;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.3, end: 1).animate(_pulse),
      child: Container(
        width: 10,
        height: 10,
        decoration: const BoxDecoration(
          color: AppColors.brand,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
