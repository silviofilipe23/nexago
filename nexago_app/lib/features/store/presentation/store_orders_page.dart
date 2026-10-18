import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/store_checkout_providers.dart';
import '../application/store_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_models.dart';
import '../domain/store_order_rules.dart';
import 'store_checkout_copy.dart';
import 'store_order_actions.dart';
import 'widgets/store_checkout_parts.dart';
import 'widgets/store_order_parts.dart';
import 'widgets/store_style.dart';

/// Loja · Meus pedidos (app 08, `/loja/pedidos`).
///
/// A visão dos pedidos do atleta (`storeOrderViews`, só do dono), mais
/// recentes primeiro, com filtro por momento e busca por número ou produto.
class StoreOrdersPage extends ConsumerStatefulWidget {
  const StoreOrdersPage({super.key, this.clock});

  /// Relógio injetável (datas "Hoje"/"Ontem"); padrão: agora.
  final DateTime Function()? clock;

  @override
  ConsumerState<StoreOrdersPage> createState() => _StoreOrdersPageState();
}

class _StoreOrdersPageState extends ConsumerState<StoreOrdersPage> {
  final TextEditingController _search = TextEditingController();
  StoreOrderFilter _filter = StoreOrderFilter.all;
  String? _rebuying;

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(analyticsServiceProvider).logStoreOrdersView();
    });
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _open(StoreOrderView o) => context.pushNamed(
        AppRouteNames.storeOrder,
        pathParameters: {'orderId': o.id},
      );

  Future<void> _rebuy(StoreOrderView o) async {
    if (_rebuying != null) return;
    setState(() => _rebuying = o.id);
    await rebuyStoreOrder(context, ref, o);
    if (mounted) setState(() => _rebuying = null);
  }

  List<StoreOrderAction> _actions(StoreOrderView o) {
    final d = o.delivery;
    switch (o.status) {
      case StoreOrderStatus.pag:
        return [
          StoreOrderAction(StoreCheckoutCopy.payPix, () => _open(o),
              primary: true),
        ];
      case StoreOrderStatus.ret:
        final address = d is StoreOrderArenaDelivery ? d.address : null;
        return [
          StoreOrderAction(StoreCheckoutCopy.seeCode, () => _open(o),
              primary: true),
          if (address != null)
            StoreOrderAction(
              StoreCheckoutCopy.directions,
              () => openStoreOrderLink(context, ref, storeMapsUri(address)),
            ),
        ];
      case StoreOrderStatus.tra:
        final url = d is StoreOrderHomeDelivery ? d.trackingUrl : null;
        final uri = url == null ? null : Uri.tryParse(url);
        return [
          if (uri != null)
            StoreOrderAction(
              StoreCheckoutCopy.trackShort,
              () => openStoreOrderLink(context, ref, uri),
              primary: true,
            ),
        ];
      case StoreOrderStatus.ent:
      case StoreOrderStatus.rtd:
      case StoreOrderStatus.can:
        return [
          StoreOrderAction(
            StoreCheckoutCopy.rebuy,
            _rebuying != null ? null : () => _rebuy(o),
          ),
        ];
      case StoreOrderStatus.sep:
      case StoreOrderStatus.sepd:
        return const [];
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(storeOrdersProvider);
    // O catálogo fica vivo para o "Comprar de novo".
    ref.watch(storeCatalogProvider);
    final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
        StoreShowcaseConfig.empty;
    final orders = async.valueOrNull;

    final Widget body;
    if (orders == null && async.hasError) {
      body = AppErrorView(
        title: StoreCheckoutCopy.ordersLoadError,
        message: 'Confira a conexão e tente de novo.',
        retryLabel: StoreCheckoutCopy.quoteRetry,
        onRetry: () => ref.invalidate(storeOrdersProvider),
      );
    } else if (orders == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (orders.isEmpty) {
      body = AppEmptyView(
        icon: Icons.receipt_long_outlined,
        title: StoreCheckoutCopy.ordersEmptyTitle,
        subtitle: StoreCheckoutCopy.ordersEmptyBody,
        actionLabel: StoreCheckoutCopy.seeStore,
        onAction: () => context.goNamed(AppRouteNames.store),
      );
    } else {
      body = _list(colors, orders, config);
    }

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
          title: StoreCheckoutCopy.ordersTitle,
          onBack: () => popOrGo(context, AppRoutes.store),
        ),
        child: body,
      ),
    );
  }

  Widget _list(
    AppThemeColors colors,
    List<StoreOrderView> orders,
    StoreShowcaseConfig config,
  ) {
    final now = _now;
    final term = _search.text;
    final shown = [
      for (final o in orders)
        if (storeOrderMatchesFilter(o, _filter) &&
            storeOrderMatchesSearch(o, term))
          o,
    ];
    final active = [
      for (final o in shown)
        if (storeOrderActive(o.status)) o,
    ];
    final past = [
      for (final o in shown)
        if (!storeOrderActive(o.status)) o,
    ];

    Widget card(StoreOrderView o) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: StoreOrderCard(
            key: ValueKey('store-order-card-${o.id}'),
            order: o,
            now: now,
            onOpen: () => _open(o),
            actions: _actions(o),
          ),
        );

    return ListView(
      padding: EdgeInsets.fromLTRB(
        0,
        6,
        0,
        AppSpacing.xxxl + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Row(
            children: [
              for (final f in StoreOrderFilter.values) ...[
                if (f != StoreOrderFilter.all) const SizedBox(width: 8),
                _FilterChip(
                  key: ValueKey('store-orders-filter-${f.id}'),
                  label: f.label,
                  count:
                      orders.where((o) => storeOrderMatchesFilter(o, f)).length,
                  selected: _filter == f,
                  onTap: () => setState(() => _filter = f),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: TextField(
            key: const ValueKey('store-orders-search'),
            controller: _search,
            textInputAction: TextInputAction.search,
            onChanged: (_) => setState(() {}),
            style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            decoration: InputDecoration(
              isDense: true,
              hintText: StoreCheckoutCopy.searchHint,
              hintStyle: AppTypography.bodyM.copyWith(
                color: StoreStyle.tertiary(colors),
              ),
              prefixIcon: Icon(
                Icons.search_rounded,
                size: 18,
                color: StoreStyle.tertiary(colors),
              ),
              filled: true,
              fillColor: StoreCheckoutStyle.card(colors),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              border: OutlineInputBorder(
                borderRadius: AppRadii.mdAll,
                borderSide: BorderSide(color: StoreCheckoutStyle.line(colors)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.mdAll,
                borderSide: BorderSide(color: StoreCheckoutStyle.line(colors)),
              ),
              focusedBorder: const OutlineInputBorder(
                borderRadius: AppRadii.mdAll,
                borderSide: BorderSide(color: AppColors.brand, width: 1.5),
              ),
            ),
          ),
        ),
        const SizedBox(height: 18),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (shown.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(
                    StoreCheckoutCopy.noneWithFilter,
                    textAlign: TextAlign.center,
                    style: AppTypography.bodyS.copyWith(
                      color: StoreStyle.secondary(colors),
                    ),
                  ),
                ),
              if (active.isNotEmpty) ...[
                const StoreSectionLabel(StoreCheckoutCopy.sectionActive),
                const SizedBox(height: 10),
                for (final o in active) card(o),
              ],
              if (past.isNotEmpty) ...[
                if (active.isNotEmpty) const SizedBox(height: 10),
                const StoreSectionLabel(StoreCheckoutCopy.sectionPast),
                const SizedBox(height: 10),
                for (final o in past) card(o),
              ],
              const SizedBox(height: 14),
              _HelpCard(exchangeDays: config.benefits.exchangeDays),
            ],
          ),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    super.key,
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected ? colors.canvas : StoreStyle.secondary(colors);
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? colors.onSurface : Colors.transparent,
        shape: StadiumBorder(
          side: BorderSide(
            color:
                selected ? colors.onSurface : StoreCheckoutStyle.line(colors),
          ),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Container(
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: fg,
                  ),
                ),
                const SizedBox(width: 7),
                Text(
                  '$count',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: fg.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Precisa de ajuda?" (troca e reembolso), como no portal.
class _HelpCard extends StatelessWidget {
  const _HelpCard({required this.exchangeDays});

  final int exchangeDays;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget row(IconData icon, String title, String body) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.brand),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      body,
                      style: AppTypography.bodyS.copyWith(
                        color: StoreStyle.tertiary(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 8),
      decoration: BoxDecoration(
        color: StoreCheckoutStyle.card(colors),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: StoreCheckoutStyle.line(colors)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            StoreCheckoutCopy.helpTitle,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          row(
            Icons.sync_rounded,
            StoreCheckoutCopy.helpExchange,
            StoreCheckoutCopy.helpExchangeBody(exchangeDays),
          ),
          Divider(height: 1, color: StoreCheckoutStyle.line(colors)),
          row(
            Icons.account_balance_wallet_outlined,
            StoreCheckoutCopy.helpRefunds,
            StoreCheckoutCopy.helpRefundsBody,
          ),
        ],
      ),
    );
  }
}
