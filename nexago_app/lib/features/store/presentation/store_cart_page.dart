import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/store_checkout_providers.dart';
import '../application/store_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_checkout_rules.dart';
import '../domain/store_models.dart';
import '../domain/store_product_rules.dart';
import '../domain/store_rules.dart';
import 'store_checkout_copy.dart';
import 'widgets/store_checkout_parts.dart';
import 'widgets/store_pickup_sheet.dart';
import 'widgets/store_style.dart';

/// Retirada na arena ou entrega em casa (o `kind` da escolha).
const String _arenaKind = 'arena';
const String _homeKind = 'casa';

/// Vermelho dos avisos de linha e de pagamento (o "Cancelado" do desenho).
const Color _problemRed = Color(0xFFFF5A4F);

/// Loja · Carrinho (app 03) com a entrega (app 04) como seção.
///
/// O cliente monta o pedido (linhas, entrega, cupom) e o servidor cota tudo
/// de novo (`quoteStoreCheckout`) a cada mudança, com espera de
/// [quoteDebounce] e descartando resposta velha. O "Pagar com Pix" manda o
/// total que a tela mostrou e o servidor recusa se mudou. Regras em
/// `docs/business-rules/loja-checkout.md`.
class StoreCartPage extends ConsumerStatefulWidget {
  const StoreCartPage({
    super.key,
    this.clock,
    this.quoteDebounce = const Duration(milliseconds: 250),
  });

  /// Relógio injetável (prazo da retirada); padrão: agora.
  final DateTime Function()? clock;

  /// Espera entre a última mudança e a nova cotação.
  final Duration quoteDebounce;

  @override
  ConsumerState<StoreCartPage> createState() => _StoreCartPageState();
}

/// Linha do carrinho como a tela mostra (catálogo + cotação).
class _CartLine {
  const _CartLine({
    required this.key,
    required this.name,
    required this.detail,
    required this.imageUrl,
    required this.qty,
    required this.maxQty,
    required this.totalCents,
    required this.problem,
  });

  final String key;
  final String name;
  final String detail;
  final String? imageUrl;
  final int qty;
  final int maxQty;
  final int totalCents;
  final StoreQuoteLineProblem? problem;
}

class _StoreCartPageState extends ConsumerState<StoreCartPage> {
  final TextEditingController _couponInput = TextEditingController();
  final TextEditingController _cpfInput = TextEditingController();

  // Escolhas do atleta.
  String? _kindChoice;
  String? _arenaChoice;
  String? _addressChoice;
  String? _modeChoice;
  String? _couponCode;

  // Cotação e pagamento.
  StoreCheckoutQuote? _quote;

  /// Para qual pedido (escolhas + carrinho) a cotação atual vale.
  String? _quotedKey;

  /// O último pedido mandado para cotar (evita agendar de novo no rebuild).
  String? _scheduledKey;
  String? _quoteError;
  Timer? _quoteTimer;
  int _quoteSeq = 0;
  bool _paying = false;
  String? _payError;
  bool _needCpf = false;
  String? _cpfError;
  bool _viewLogged = false;

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  @override
  void dispose() {
    _quoteTimer?.cancel();
    _couponInput.dispose();
    _cpfInput.dispose();
    super.dispose();
  }

  // ── Cotação ───────────────────────────────────────────────────────────

  void _scheduleQuote(StoreCheckoutRequest request, String key) {
    _quoteTimer?.cancel();
    _quoteTimer = Timer(widget.quoteDebounce, () => _runQuote(request, key));
  }

  Future<void> _runQuote(StoreCheckoutRequest request, String key) async {
    final seq = ++_quoteSeq;
    try {
      final quote = await ref.read(storeCheckoutServiceProvider).quote(request);
      if (!mounted || seq != _quoteSeq) return;
      setState(() {
        _quote = quote;
        _quotedKey = key;
        _quoteError = null;
      });
    } on StoreCheckoutException catch (e) {
      if (!mounted || seq != _quoteSeq) return;
      setState(() => _quoteError = storeQuoteErrorMessage(e));
    } catch (_) {
      if (!mounted || seq != _quoteSeq) return;
      setState(
        () => _quoteError = storeQuoteErrorMessage(
          storeCheckoutErrorOf(code: 'unknown'),
        ),
      );
    }
  }

  void _retryQuote() {
    setState(() {
      _quoteError = null;
      _scheduledKey = null;
    });
  }

  // ── Carrinho ──────────────────────────────────────────────────────────

  Future<void> _setQty(_CartLine line, int qty) async {
    final next = qty.clamp(0, line.maxQty);
    if (next == line.qty) return;
    if (next == 0) {
      _analytics.logStoreCartRemove(line: line.key);
    } else {
      _analytics.logStoreCartQty(line: line.key, qty: next);
    }
    try {
      await ref.read(storeCheckoutActionsProvider).setLineQty(line.key, next);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, StoreCheckoutCopy.cartUpdateError,
            isError: true);
      }
    }
  }

  // ── Entrega ───────────────────────────────────────────────────────────

  void _chooseKind(String kind) {
    if (kind == _kindChoice) return;
    setState(() => _kindChoice = kind);
    _analytics.logStoreDeliverySelect(type: kind, screen: 'checkout');
  }

  Future<void> _changeArena(StoreShowcaseConfig config, String? current) async {
    final position = ref.read(storeUserPositionProvider);
    final arenaId = await showStorePickupSheet(
      context: context,
      arenas: config.pickupArenas,
      currentArenaId: current,
      readyHours: config.benefits.pickupReadyHours,
      userLatitude: position?.latitude,
      userLongitude: position?.longitude,
    );
    if (arenaId == null || !mounted) return;
    _analytics.logStorePickupArenaChange(arenaId: arenaId);
    setState(() {
      _arenaChoice = arenaId;
      _kindChoice = _arenaKind;
    });
    try {
      await ref.read(storeActionsProvider).choosePickupArena(arenaId);
    } catch (_) {
      // A escolha vale nesta compra mesmo sem gravar a preferência.
    }
  }

  Future<void> _openAddress(StoreAddress? address) async {
    final id = await context.pushNamed<String>(
      AppRouteNames.storeAddress,
      queryParameters: {if (address != null) 'id': address.id},
    );
    if (id != null && mounted) {
      setState(() {
        _addressChoice = id;
        _kindChoice = _homeKind;
      });
    }
  }

  // ── Cupom ─────────────────────────────────────────────────────────────

  void _applyCoupon() {
    final code = _couponInput.text.trim().toUpperCase();
    if (code.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() => _couponCode = code);
    _analytics.logStoreCouponApply(code: code);
  }

  void _removeCoupon() {
    setState(() {
      _couponCode = null;
      _couponInput.clear();
    });
  }

  // ── Pagamento ─────────────────────────────────────────────────────────

  Future<void> _pay(
    StoreCheckoutQuote quote,
    StoreCheckoutRequest request,
    String requestKey,
  ) async {
    if (_paying) return;
    final cpf = _cpfInput.text.replaceAll(RegExp(r'\D'), '');
    if (_needCpf && cpf.length != 11) {
      setState(() => _cpfError = StoreCheckoutCopy.cpfInvalid);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _paying = true;
      _payError = null;
    });
    _analytics.logStoreCheckoutPay(
      totalCents: quote.totalCents,
      delivery: switch (request.delivery) {
        StoreArenaDelivery() => _arenaKind,
        StoreHomeDelivery() => _homeKind,
        null => null,
      },
      coupon: request.couponCode,
    );
    try {
      final order = await ref.read(storeCheckoutServiceProvider).createOrder(
            request,
            expectedTotalCents: quote.totalCents,
            cpf: _needCpf ? cpf : null,
          );
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.storeOrder,
        pathParameters: {'orderId': order.orderId},
        extra: order,
      );
    } on StoreCheckoutException catch (e) {
      if (!mounted) return;
      setState(() {
        _paying = false;
        if (e.quote case final fresh?) {
          _quote = fresh;
          _quotedKey = requestKey;
        }
        switch (e.kind) {
          case StoreCheckoutErrorKind.cpf:
            _needCpf = true;
            _payError = e.message;
          case StoreCheckoutErrorKind.changed:
            _payError = null;
          default:
            _payError = e.message;
        }
      });
      if (e.kind == StoreCheckoutErrorKind.changed) {
        showAppSnackBar(context, StoreCheckoutCopy.totalChanged);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _paying = false;
        _payError = storeCheckoutErrorOf(code: 'unknown').message;
      });
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────

  void _back() => popOrGo(context, AppRoutes.store);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cartAsync = ref.watch(storeCartProvider);
    final catalogAsync = ref.watch(storeCatalogProvider);
    final cart = cartAsync.valueOrNull;
    final units = storeCartUnits(cart ?? const []);

    if (cart != null && !_viewLogged) {
      _viewLogged = true;
      _analytics.logStoreCartView(units: units);
    }

    final Widget body;
    Widget? bar;
    if (cart == null && cartAsync.hasError) {
      body = AppErrorView(
        title: StoreCheckoutCopy.cartLoadError,
        message: 'Confira a conexão e tente de novo.',
        retryLabel: StoreCheckoutCopy.quoteRetry,
        onRetry: () => ref.invalidate(storeCartProvider),
      );
    } else if (cart == null ||
        (!catalogAsync.hasValue && !catalogAsync.hasError)) {
      body = const Center(child: CircularProgressIndicator());
    } else if (cart.isEmpty) {
      body = _empty(colors);
    } else {
      final view = _buildCheckout(
        colors,
        cart,
        catalogAsync.valueOrNull?.products ?? const [],
      );
      body = view.$1;
      bar = view.$2;
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
          title: StoreCheckoutCopy.cartTitle,
          subtitle: units > 0 ? StoreCheckoutCopy.units(units) : null,
          onBack: _back,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: body),
            if (bar != null) bar,
          ],
        ),
      ),
    );
  }

  Widget _empty(AppThemeColors colors) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.shopping_bag_outlined,
                color: AppColors.brand,
                size: 28,
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            Text(
              StoreCheckoutCopy.cartEmptyTitle,
              textAlign: TextAlign.center,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              StoreCheckoutCopy.cartEmptyBody,
              textAlign: TextAlign.center,
              style: AppTypography.bodyM.copyWith(
                color: StoreStyle.secondary(colors),
              ),
            ),
            const SizedBox(height: AppSpacing.xxl),
            SizedBox(
              width: double.infinity,
              child: StorePrimaryButton(
                label: StoreCheckoutCopy.seeStore,
                height: 52,
                onPressed: _back,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            SizedBox(
              width: double.infinity,
              child: StoreSoftButton(
                label: StoreCheckoutCopy.myOrders,
                height: 52,
                icon: Icons.receipt_long_outlined,
                onPressed: () => context.pushNamed(AppRouteNames.storeOrders),
              ),
            ),
          ],
        ),
      ),
    );
  }

  (Widget, Widget) _buildCheckout(
    AppThemeColors colors,
    List<StoreCartItem> cart,
    List<StoreProduct> products,
  ) {
    final configAsync = ref.watch(storeShowcaseConfigProvider);
    final addressesAsync = ref.watch(storeAddressesProvider);
    final pickup = ref.watch(storePickupChoiceProvider);
    final uid = ref.watch(storeUidProvider);
    final channel = ref.watch(storeCheckoutChannelProvider);

    final config = configAsync.valueOrNull ?? StoreShowcaseConfig.empty;
    final arenas = config.pickupArenas;
    final modes = [
      for (final m in config.delivery.modes)
        if (m.priceCents != null) m,
    ];
    final addresses = addressesAsync.valueOrNull ?? const <StoreAddress>[];

    // ── Escolhas resolvidas ──
    final String? kind;
    if (_kindChoice == _arenaKind && arenas.isNotEmpty) {
      kind = _arenaKind;
    } else if (_kindChoice == _homeKind && modes.isNotEmpty) {
      kind = _homeKind;
    } else if (arenas.isNotEmpty) {
      kind = _arenaKind;
    } else {
      kind = modes.isNotEmpty ? _homeKind : null;
    }
    final arenaId = _arenaChoice ?? pickup?.arena?.arenaId;
    final arena = arenas.where((a) => a.arenaId == arenaId).firstOrNull ??
        arenas.firstOrNull;
    final address =
        addresses.where((a) => a.id == _addressChoice).firstOrNull ??
            addresses
                .where((a) => a.id == defaultStoreAddressId(addresses))
                .firstOrNull;
    final mode = modes.where((m) => m.id == _modeChoice).firstOrNull ??
        modes.firstOrNull;

    final StoreCheckoutDelivery? delivery = switch (kind) {
      _arenaKind when arena != null => StoreArenaDelivery(arena.arenaId),
      // Sem endereço ainda: cota sem entrega (o resumo segue com o preço do
      // modo até escolher).
      _homeKind when address != null && mode != null =>
        StoreHomeDelivery(addressId: address.id, modeId: mode.id),
      _ => null,
    };
    final request = StoreCheckoutRequest(
      channel: channel,
      delivery: delivery,
      couponCode: _couponCode,
    );
    final cartKey =
        cart.map((i) => '${storeCartLineKey(i)}:${i.qty}').join('|');
    final requestKey = '${request.key}#$cartKey';

    // Cota de novo a cada mudança — só com o atleta logado e as fontes da
    // entrega carregadas (senão a primeira cotação já nasce velha).
    final ready = uid.isNotEmpty &&
        (configAsync.hasValue || configAsync.hasError) &&
        (addressesAsync.hasValue || addressesAsync.hasError) &&
        (arenas.isEmpty || pickup != null);
    if (ready && requestKey != _scheduledKey) {
      // O pedido mudou: o erro do último "Pagar" era de outro pedido.
      if (_scheduledKey != null) _payError = null;
      _scheduledKey = requestKey;
      _scheduleQuote(request, requestKey);
    }

    final quote = _quote;
    final fresh = quote != null && _quotedKey == requestKey;
    final lines = _lines(cart, products, quote, fresh: fresh);
    final localSubtotal = lines.fold<int>(0, (n, l) => n + l.totalCents);
    final subtotal = quote?.subtotalCents ?? localSubtotal;
    final units = storeCartUnits(cart);
    final freeAbove = config.delivery.freeAboveCents;

    final applied = _couponCode != null ? storeAppliedCoupon(quote) : null;
    // Só com a cotação em dia (a velha pode ser de outro código). Código que
    // o servidor nem devolveu também trava: o "Remover" destrava.
    final couponProblem = fresh && _couponCode != null && applied == null
        ? (quote.coupon?.message ?? StoreCheckoutCopy.couponInvalid)
        : null;

    String? blocker;
    if (quote != null) {
      if (kind == _homeKind && addresses.isEmpty) {
        blocker = StoreCheckoutCopy.needAddress;
      } else if (couponProblem != null) {
        blocker = StoreCheckoutCopy.couponBlocker;
      } else {
        blocker = storeQuoteBlocker(quote);
      }
    }
    final canPay = fresh && blocker == null && !_paying && quote.totalCents > 0;

    int? freeGap;
    if (kind == _homeKind &&
        freeAbove != null &&
        quote != null &&
        !quote.freeShipping) {
      final gap = freeAbove - quote.subtotalCents;
      if (gap > 0) freeGap = gap;
    }

    String modePrice(StoreDeliveryMode m) {
      final cents = storeDeliveryPriceCents(m, subtotal, freeAbove) ?? 0;
      return cents == 0
          ? StoreCheckoutCopy.free
          : StoreCheckoutCopy.price(cents);
    }

    final pixPct =
        quote?.pixDiscountPct ?? (config.benefits.pixDiscountPct?.round() ?? 0);

    // ── Conteúdo ──
    final content = ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        6,
        AppSpacing.screenH,
        AppSpacing.xxl,
      ),
      children: [
        for (final line in lines) ...[
          _LineTile(
            key: ValueKey('store-line-${line.key}'),
            line: line,
            onQty: (qty) => _setQty(line, qty),
          ),
          const SizedBox(height: 12),
        ],
        const SizedBox(height: 12),
        const StoreSectionLabel(StoreCheckoutCopy.receiveTitle),
        const SizedBox(height: 10),
        ..._receive(
          colors,
          config: config,
          kind: kind,
          arena: arena,
          modes: modes,
          addresses: addresses,
          address: address,
          mode: mode,
          modePrice: modePrice,
          freeGap: freeGap,
        ),
        const SizedBox(height: 24),
        const StoreSectionLabel(StoreCheckoutCopy.paymentTitle),
        const SizedBox(height: 10),
        StoreChoiceTile(
          key: const ValueKey('store-cart-pix'),
          selected: true,
          leading: const Icon(Icons.pix, size: 19, color: AppColors.brand),
          title: StoreCheckoutCopy.pix,
          titleTrailing: pixPct > 0
              ? Text(
                  StoreCheckoutCopy.pixOff(pixPct).trim(),
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.brand,
                  ),
                )
              : null,
          subtitle: StoreCheckoutCopy.pixInstant,
          trailing: const StoreRadioDot(on: true),
        ),
        const SizedBox(height: 24),
        _coupon(colors, applied: applied, problem: couponProblem, fresh: fresh),
        const SizedBox(height: 22),
        if (_quoteError case final err?) ...[
          _QuoteError(message: err, onRetry: _retryQuote),
          const SizedBox(height: 14),
        ],
        StoreSummaryRow(
          label: StoreCheckoutCopy.subtotal(units),
          value: StoreCheckoutCopy.price(subtotal),
        ),
        if (applied != null) ...[
          const SizedBox(height: 10),
          StoreSummaryRow(
            label: StoreCheckoutCopy.couponRow(applied.code),
            value: StoreCheckoutCopy.discount(applied.discountCents),
            win: true,
          ),
        ],
        if ((quote?.pixDiscountCents ?? 0) > 0) ...[
          const SizedBox(height: 10),
          StoreSummaryRow(
            label: StoreCheckoutCopy.pixDiscount,
            value: StoreCheckoutCopy.discount(quote!.pixDiscountCents),
            win: true,
          ),
        ],
        if (kind == _arenaKind) ...[
          const SizedBox(height: 10),
          const StoreSummaryRow(
            label: StoreCheckoutCopy.pickupRow,
            value: StoreCheckoutCopy.free,
            win: true,
          ),
        ] else if (kind == _homeKind && mode != null) ...[
          const SizedBox(height: 10),
          StoreSummaryRow(
            label: StoreCheckoutCopy.shippingRow(mode.name),
            value: quote != null && address != null
                ? (quote.shippingCents == 0
                    ? StoreCheckoutCopy.free
                    : StoreCheckoutCopy.price(quote.shippingCents))
                : modePrice(mode),
            win: quote != null && address != null
                ? quote.shippingCents == 0
                : modePrice(mode) == StoreCheckoutCopy.free,
          ),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: 14,
              color: StoreStyle.tertiary(colors),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                StoreCheckoutCopy.safe(config.benefits.exchangeDays),
                style: AppTypography.bodyS.copyWith(
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ),
          ],
        ),
      ],
    );

    final hint = _payError ??
        blocker ??
        (quote == null && _quoteError == null
            ? StoreCheckoutCopy.quoting
            : null);
    final bar = StoreCheckoutBar(
      label: kind == _homeKind
          ? StoreCheckoutCopy.totalWithShipping
          : StoreCheckoutCopy.total,
      value: quote == null
          ? const SizedBox(
              height: 28,
              child: Align(
                alignment: Alignment.centerLeft,
                child: SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          : Text(
              StoreCheckoutCopy.price(quote.totalCents),
              key: const ValueKey('store-cart-total'),
            ),
      valueStale: !fresh,
      top: _needCpf || hint != null
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_needCpf) _cpfField(colors),
                if (_needCpf && hint != null) const SizedBox(height: 8),
                if (hint != null)
                  Text(
                    hint,
                    key: ValueKey(
                      _payError != null
                          ? 'store-cart-pay-error'
                          : 'store-cart-hint',
                    ),
                    style: AppTypography.bodyS.copyWith(
                      color: _payError != null
                          ? _problemRed
                          : StoreStyle.secondary(colors),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            )
          : null,
      button: StorePrimaryButton(
        key: const ValueKey('store-cart-pay'),
        label: _paying ? StoreCheckoutCopy.paying : StoreCheckoutCopy.pay,
        icon: Icons.pix,
        busy: _paying,
        onPressed: canPay ? () => _pay(quote, request, requestKey) : null,
      ),
    );
    return (content, bar);
  }

  List<_CartLine> _lines(
    List<StoreCartItem> cart,
    List<StoreProduct> products,
    StoreCheckoutQuote? quote, {
    required bool fresh,
  }) {
    final byId = {for (final p in products) p.id: p};
    final quoted = {
      for (final l in quote?.lines ?? const <StoreQuoteLine>[]) l.key: l
    };
    return [
      for (final item in cart)
        _line(item, byId[item.productId], quoted, fresh: fresh),
    ];
  }

  _CartLine _line(
    StoreCartItem item,
    StoreProduct? product,
    Map<String, StoreQuoteLine> quoted, {
    required bool fresh,
  }) {
    final key = storeCartLineKey(item);
    final variant =
        product?.variants.where((v) => v.id == item.skuId).firstOrNull;
    final q = quoted[key];
    final variantLabel = product != null && variant != null
        ? storeVariantLabel(product, variant)
        : (q?.variantLabel ?? '');
    final detail = [
      variantLabel,
      if (item.isCustom) StoreCheckoutCopy.personalized,
    ].where((s) => s.isNotEmpty).join(' · ');
    final extra = _extraCents(item);
    final local =
        variant != null ? (variant.priceCents + extra) * item.qty : null;
    return _CartLine(
      key: key,
      name: product?.name ?? q?.name ?? StoreCheckoutCopy.unknownProduct,
      detail: detail,
      imageUrl: product?.coverUrl ?? q?.imageUrl,
      qty: item.qty,
      maxQty: (variant?.maxQty ?? item.qty).clamp(1, kStoreMaxQtyPerItem),
      // Cotação em dia manda (preço e adicional atuais); antes dela, a
      // conta local da vitrine.
      totalCents: q != null && fresh && q.qty == item.qty
          ? q.totalCents
          : (local ?? q?.totalCents ?? 0),
      // Produto fora da vitrine: o servidor confirma, mas a tela já marca.
      problem: q?.problem ??
          (product != null && variant != null
              ? null
              : StoreQuoteLineProblem.unavailable),
    );
  }

  /// Adicional da linha personalizada (`customization.extraPriceCents`).
  static int _extraCents(StoreCartItem item) {
    final raw = item.customization?['extraPriceCents'];
    return raw is num && raw.isFinite && raw > 0 ? raw.round() : 0;
  }

  List<Widget> _receive(
    AppThemeColors colors, {
    required StoreShowcaseConfig config,
    required String? kind,
    required StorePickupArena? arena,
    required List<StoreDeliveryMode> modes,
    required List<StoreAddress> addresses,
    required StoreAddress? address,
    required StoreDeliveryMode? mode,
    required String Function(StoreDeliveryMode) modePrice,
    required int? freeGap,
  }) {
    final arenas = config.pickupArenas;
    if (arenas.isEmpty && modes.isEmpty) {
      return [
        Text(
          StoreCheckoutCopy.receiveNone,
          style:
              AppTypography.bodyS.copyWith(color: StoreStyle.secondary(colors)),
        ),
      ];
    }
    return [
      if (arenas.isNotEmpty && modes.isNotEmpty) ...[
        StoreSegmented(
          options: const [
            (_arenaKind, StoreCheckoutCopy.receivePickup),
            (_homeKind, StoreCheckoutCopy.receiveDelivery),
          ],
          selectedId: kind,
          onChanged: _chooseKind,
        ),
        const SizedBox(height: 10),
      ],
      if (kind == _arenaKind && arena != null)
        StoreChoiceTile(
          key: const ValueKey('store-cart-arena'),
          leading: const Icon(
            Icons.place_outlined,
            size: 19,
            color: AppColors.brand,
          ),
          title: arena.name,
          subtitle: storePickupReadyLabel(arena.readyHours, _now),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const StoreChoicePrice(StoreCheckoutCopy.free, free: true),
              if (arenas.length > 1) ...[
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: StoreStyle.tertiary(colors),
                ),
              ],
            ],
          ),
          onTap: arenas.length > 1
              ? () => _changeArena(config, arena.arenaId)
              : null,
        ),
      if (kind == _homeKind) ...[
        if (arenas.isEmpty) const SizedBox(height: 2),
        const StoreSectionLabel(StoreCheckoutCopy.addressesTitle),
        const SizedBox(height: 10),
        if (addresses.isEmpty)
          StoreDashedButton(
            key: const ValueKey('store-cart-first-address'),
            label: StoreCheckoutCopy.firstAddressTitle,
            subtitle: StoreCheckoutCopy.firstAddressHint,
            onTap: () => _openAddress(null),
          )
        else ...[
          for (final a in addresses) ...[
            StoreChoiceTile(
              key: ValueKey('store-address-${a.id}'),
              radio: true,
              selected: a.id == address?.id,
              title: a.label,
              titleTrailing: a.main
                  ? Text(
                      StoreCheckoutCopy.addressMain,
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.9,
                        color: AppColors.brand,
                      ),
                    )
                  : null,
              subtitle: storeAddressLine(a),
              detail: '${storeAddressArea(a)} · ${formatStoreCep(a.zip)}',
              trailing: IconButton(
                tooltip: StoreCheckoutCopy.editAddress(a.label),
                visualDensity: VisualDensity.compact,
                onPressed: () => _openAddress(a),
                icon: Icon(
                  Icons.edit_outlined,
                  size: 18,
                  color: StoreStyle.tertiary(colors),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(16, 10, 6, 10),
              onTap: () => setState(() => _addressChoice = a.id),
            ),
            const SizedBox(height: 10),
          ],
          if (addresses.length < kStoreMaxAddresses)
            StoreDashedButton(
              key: const ValueKey('store-cart-add-address'),
              label: StoreCheckoutCopy.addAddress,
              onTap: () => _openAddress(null),
            ),
        ],
        const SizedBox(height: 22),
        const StoreSectionLabel(StoreCheckoutCopy.deadlineTitle),
        const SizedBox(height: 10),
        for (var i = 0; i < modes.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          StoreChoiceTile(
            key: ValueKey('store-mode-${modes[i].id}'),
            radio: true,
            selected: modes[i].id == mode?.id,
            leading: Icon(
              i == 0 ? Icons.local_shipping_outlined : Icons.bolt_rounded,
              size: 18,
              color: modes[i].id == mode?.id
                  ? AppColors.brand
                  : StoreStyle.secondary(colors),
            ),
            title: modes[i].name,
            subtitle: modes[i].description,
            trailing: StoreChoicePrice(
              modePrice(modes[i]),
              free: modePrice(modes[i]) == StoreCheckoutCopy.free,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            onTap: () => setState(() => _modeChoice = modes[i].id),
          ),
        ],
        if (freeGap != null) ...[
          const SizedBox(height: 10),
          Text(
            StoreCheckoutCopy.freeShippingGap(freeGap),
            style: AppTypography.bodyS
                .copyWith(color: StoreStyle.secondary(colors)),
          ),
        ],
      ],
    ];
  }

  Widget _coupon(
    AppThemeColors colors, {
    required StoreQuoteCoupon? applied,
    required String? problem,
    required bool fresh,
  }) {
    final code = _couponCode;
    // Qualquer código aplicado tem "Remover" (mesmo o que o servidor nem
    // reconheceu) — senão o atleta fica preso.
    if (code != null) {
      final bad = problem != null;
      final ok = applied != null && fresh;
      final tone = bad
          ? _problemRed
          : ok
              ? AppColors.win
              : StoreStyle.tertiary(colors);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 50,
            padding: const EdgeInsets.only(left: 14, right: 4),
            decoration: BoxDecoration(
              borderRadius: AppRadii.mdAll,
              color: tone.withValues(alpha: 0.08),
              border: Border.all(color: tone.withValues(alpha: 0.45)),
            ),
            child: Row(
              children: [
                if (!fresh)
                  const SizedBox.square(
                    dimension: 17,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(Icons.sell_outlined, size: 17, color: tone),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    code,
                    style: AppTypography.mono(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
                TextButton(
                  key: const ValueKey('store-cart-coupon-remove'),
                  onPressed: _removeCoupon,
                  style:
                      TextButton.styleFrom(foregroundColor: colors.onSurface),
                  child: const Text(StoreCheckoutCopy.couponRemove),
                ),
              ],
            ),
          ),
          if (problem != null) ...[
            const SizedBox(height: 6),
            Text(
              problem,
              key: const ValueKey('store-cart-coupon-error'),
              style: AppTypography.bodyS.copyWith(
                color: _problemRed,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      );
    }
    return Row(
      children: [
        Expanded(
          child: TextField(
            key: const ValueKey('store-cart-coupon-field'),
            controller: _couponInput,
            textCapitalization: TextCapitalization.characters,
            textInputAction: TextInputAction.done,
            maxLength: 20,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
            ],
            onSubmitted: (_) => _applyCoupon(),
            onChanged: (_) => setState(() {}),
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
            decoration: InputDecoration(
              counterText: '',
              isDense: true,
              hintText: StoreCheckoutCopy.couponHint,
              hintStyle: AppTypography.bodyM.copyWith(
                color: StoreStyle.tertiary(colors),
              ),
              prefixIcon: Icon(
                Icons.sell_outlined,
                size: 17,
                color: StoreStyle.tertiary(colors),
              ),
              filled: true,
              fillColor: StoreCheckoutStyle.card(colors),
              contentPadding: const EdgeInsets.symmetric(vertical: 15),
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
        const SizedBox(width: 10),
        StoreSoftButton(
          key: const ValueKey('store-cart-coupon-apply'),
          label: StoreCheckoutCopy.couponApply,
          height: 50,
          onPressed: _couponInput.text.trim().isEmpty ? null : _applyCoupon,
        ),
      ],
    );
  }

  Widget _cpfField(AppThemeColors colors) {
    final error = _cpfError;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const StoreSectionLabel(StoreCheckoutCopy.cpfLabel),
        const SizedBox(height: 6),
        TextField(
          key: const ValueKey('store-cart-cpf'),
          controller: _cpfInput,
          keyboardType: TextInputType.number,
          autofocus: true,
          inputFormatters: [_CpfFormatter()],
          onChanged: (_) {
            if (_cpfError != null) setState(() => _cpfError = null);
          },
          style: AppTypography.mono(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: colors.onSurface,
          ),
          decoration: InputDecoration(
            isDense: true,
            hintText: StoreCheckoutCopy.cpfHint,
            errorText: error,
            helperText: error == null ? StoreCheckoutCopy.cpfHelp : null,
            filled: true,
            fillColor: StoreCheckoutStyle.card(colors),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
      ],
    );
  }
}

/// Máscara do CPF enquanto digita ("123.456.789-09"), até 11 dígitos.
class _CpfFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = formatStoreCpf(newValue.text);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class _LineTile extends StatelessWidget {
  const _LineTile({super.key, required this.line, required this.onQty});

  final _CartLine line;
  final ValueChanged<int> onQty;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final problem = line.problem;
    final row = Row(
      children: [
        Opacity(
          opacity: problem != null ? 0.55 : 1,
          child: StoreThumb(url: line.imageUrl),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                line.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              if (line.detail.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  line.detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: StoreStyle.tertiary(colors),
                  ),
                ),
              ],
              if (problem != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        size: 13, color: _problemRed),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        problem.label,
                        style: AppTypography.soraRegular(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: _problemRed,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      StoreCheckoutCopy.price(line.totalCents),
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  StoreLineStepper(
                    qty: line.qty,
                    max: line.maxQty,
                    removeTooltip: StoreCheckoutCopy.remove(line.name),
                    onChanged: onQty,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
    if (problem == null) return row;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: AppRadii.lgAll,
        color: _problemRed.withValues(alpha: 0.05),
        border: Border.all(color: _problemRed.withValues(alpha: 0.35)),
      ),
      child: row,
    );
  }
}

class _QuoteError extends StatelessWidget {
  const _QuoteError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      decoration: BoxDecoration(
        borderRadius: AppRadii.mdAll,
        color: _problemRed.withValues(alpha: 0.08),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(foregroundColor: AppColors.brand),
            child: const Text(StoreCheckoutCopy.quoteRetry),
          ),
        ],
      ),
    );
  }
}
