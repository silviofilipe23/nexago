import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../data/booking_service.dart';
import '../data/payment_service.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_booking_quote.dart';
import '../domain/arenas_providers.dart';
import '../domain/arena_booking_pix_args.dart';
import '../domain/booking_providers.dart';
import 'booking_success_page.dart';

/// Confirmação da reserva (paridade com `ArenaBookConfirmComponent` no web).
class ArenaBookingConfirmPage extends ConsumerStatefulWidget {
  const ArenaBookingConfirmPage({
    super.key,
    required this.arenaId,
    this.args,
  });

  final String arenaId;
  final ArenaBookingConfirmArgs? args;

  @override
  ConsumerState<ArenaBookingConfirmPage> createState() =>
      _ArenaBookingConfirmPageState();
}

enum _PaymentChoice {
  /// Pagamento combinado na arena.
  atVenue,

  /// PIX in-app (50% ou 100%).
  pix,
}

class _ArenaBookingConfirmPageState
    extends ConsumerState<ArenaBookingConfirmPage> {
  bool _submitting = false;
  _PaymentChoice _paymentChoice = _PaymentChoice.atVenue;
  double _pixFraction = 1.0;
  ArenaBookingQuote? _quote;
  bool _quoting = false;
  String? _lastQuoteKey;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  static final _dateFmt = DateFormat('d MMM yyyy', 'pt_BR');
  static final _dateTimeFmt = DateFormat("yyyy-MM-dd HH:mm");

  double _displayAmount(ArenaBookingConfirmArgs args) =>
      _quote?.amountReais ?? args.amountReais;

  void _maybeLoadQuote(ArenaBookingConfirmArgs args) {
    final slotsKey = args.selectedSlotStartTimes.join(',');
    final key =
        '${args.courtId}_${args.dateKey}_${args.startTime}_${args.endTime}_$slotsKey';
    if (_lastQuoteKey == key || _quoting) return;
    _lastQuoteKey = key;
    _loadQuote(args);
  }

  Future<void> _loadQuote(ArenaBookingConfirmArgs args) async {
    setState(() => _quoting = true);
    try {
      final quote =
          await ref.read(bookingServiceProvider).quoteBooking(args: args);
      if (mounted) setState(() => _quote = quote);
    } catch (_) {
      // Mantém total calculado no cliente se a cota falhar.
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<void> _confirmWithPix(ArenaBookingConfirmArgs args) async {
    final user = ref.read(authServiceProvider).currentUser;
    if (user == null) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para pagar.', isError: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final created =
          await ref.read(bookingServiceProvider).createBookingAtomically(
                args: args,
                athleteId: user.uid,
                paymentMode: 'pix',
                paymentFraction: _pixFraction,
              );
      if (!mounted) return;

      final expiresAt = created.paymentExpiresAt != null
          ? DateTime.tryParse(created.paymentExpiresAt!)
          : null;

      context.pushNamed(
        AppRouteNames.arenaBookingPix,
        pathParameters: <String, String>{'arenaId': widget.arenaId},
        extra: ArenaBookingPixArgs(
          bookingId: created.bookingId,
          confirmArgs: args,
          amountToPayNowReais: created.amountToPayNowReais,
          amountDueOnsiteReais: created.amountDueOnsiteReais,
          paymentFraction: _pixFraction,
          paymentExpiresAt: expiresAt,
        ),
      );
    } on BookingException catch (e) {
      if (!mounted) return;
      if (e.isBlockedAthlete) {
        final uri = Uri(
          path: AppRoutes.arenaBookingBlocked
              .replaceAll(':arenaId', widget.arenaId),
          queryParameters: <String, String>{'message': e.message},
        );
        context.go(uri.toString());
        return;
      }
      showAppSnackBar(
        context,
        e.message,
        isError: e.isSlotConflict,
      );
    } on PaymentException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao iniciar pagamento: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Reserva criada; pagamento combinado na arena (sem Mercado Pago).
  Future<void> _finalizeBookingPayAtArena(ArenaBookingConfirmArgs args) async {
    final user = ref.read(authServiceProvider).currentUser;
    if (user == null) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para confirmar a reserva.',
          isError: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final created =
          await ref.read(bookingServiceProvider).createBookingAtomically(
                args: args,
                athleteId: user.uid,
              );
      if (!mounted) return;
      final amount = created.amountReais;

      final timeRange = '${args.startTime} – ${args.endTime}';
      final dateLabel = _dateFmt.format(args.date);
      final uri = Uri(
        path: AppRoutes.arenaBookingSuccess
            .replaceAll(':arenaId', widget.arenaId),
        queryParameters: <String, String>{
          'date': args.dateKey,
          'startTime': args.startTime,
          'endTime': args.endTime,
          'amountReais': amount.toString(),
          'payment': 'paid',
          'bookingId': created.bookingId,
          'arenaName': args.arenaName,
        },
      );
      context.go(
        uri.toString(),
        extra: BookingSuccessArgs(
          arenaName: args.arenaName,
          dateLabel: dateLabel,
          timeRangeLabel: timeRange,
          bookingIds: <String>[created.bookingId],
          amountLabel: 'Total: ${_currency.format(amount)}',
          headline: 'Reserva registrada',
          paymentLabel: 'Pagamento no local na arena.',
        ),
      );
    } on BookingException catch (e) {
      if (!mounted) return;
      if (e.isBlockedAthlete) {
        final uri = Uri(
          path: AppRoutes.arenaBookingBlocked
              .replaceAll(':arenaId', widget.arenaId),
          queryParameters: <String, String>{'message': e.message},
        );
        context.go(uri.toString());
        return;
      }
      showAppSnackBar(
        context,
        e.message,
        isError: e.isSlotConflict,
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao reservar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Alinhado a [ArenaListItem] (`onsitePaymentEnabled` / `onlinePaymentEnabled` no Firestore).
  _PaymentChoice _effectivePaymentChoice({
    required bool onsiteEnabled,
    required bool onlineEnabled,
  }) {
    if (onsiteEnabled && !onlineEnabled) return _PaymentChoice.atVenue;
    if (!onsiteEnabled && onlineEnabled) return _PaymentChoice.pix;
    return _paymentChoice;
  }

  double _pixPayAmount(double total) =>
      ((total * _pixFraction) * 100).roundToDouble() / 100;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaAsync = ref.watch(arenaByIdProvider(widget.arenaId));
    final arena = arenaAsync.asData?.value;
    final onsiteEnabled = arena?.onsitePaymentEnabled ?? true;
    final onlineEnabled = arena?.onlinePaymentEnabled ?? true;
    final canPayHere = onsiteEnabled || onlineEnabled;
    final isPaymentConfigLoading = arena == null && arenaAsync.isLoading;

    final state = GoRouterState.of(context);
    final fromExtra = widget.args ??
        (state.extra is ArenaBookingConfirmArgs
            ? state.extra! as ArenaBookingConfirmArgs
            : null);
    final fromQuery = ArenaBookingConfirmArgs.tryParseQuery(state.uri);
    final args = fromExtra ?? fromQuery;

    if (args != null && args.isValid) {
      _maybeLoadQuote(args);
    }

    if (args == null || !args.isValid || args.arenaId != widget.arenaId) {
      return AppScaffold(
        title: 'Confirmar',
        body: AppEmptyView(
          icon: Icons.event_busy_rounded,
          title: 'Dados incompletos',
          subtitle:
              'Volte à seleção de horários e escolha arena, data e quadra novamente.',
          actionLabel: 'Voltar aos horários',
          onAction: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(
                  AppRoutes.arenaSlots.replaceAll(':arenaId', widget.arenaId));
            }
          },
        ),
      );
    }

    final timeRange = '${args.startTime} – ${args.endTime}';
    final dateLabel = _dateFmt.format(args.date);
    final startAt = _parseStartDateTime(args.dateKey, args.startTime);
    final minutesUntilStart = startAt?.difference(DateTime.now()).inMinutes;
    final showLeaveNowHint =
        (minutesUntilStart ?? -1) >= 0 && (minutesUntilStart ?? -1) <= 30;
    final choice = _effectivePaymentChoice(
      onsiteEnabled: onsiteEnabled,
      onlineEnabled: onlineEnabled,
    );
    final displayTotal = _displayAmount(args);
    final ctaLabel = choice == _PaymentChoice.pix
        ? 'Continuar para PIX'
        : 'Confirmar reserva';

    return AppScaffold(
      title: 'Falta só confirmar',
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW =
                constraints.maxWidth > 560 ? 520.0 : constraints.maxWidth;
            return Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxW),
                child: Stack(
                  children: [
                    CustomScrollView(
                      physics: const BouncingScrollPhysics(),
                      slivers: [
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(20, 14, 20, 180),
                          sliver: SliverList(
                            delegate: SliverChildListDelegate.fixed([
                              FadeSlideIn(
                                child: _BookingHeroCard(
                                  arenaName: args.arenaName,
                                  courtName: args.courtName,
                                  dateLabel: dateLabel,
                                  timeRange: timeRange,
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 14),
                                child: _BookingSummaryCard(
                                  dateLabel: dateLabel,
                                  timeRange: timeRange,
                                  durationLabel: args.durationLabel,
                                  pricingDetail: _quoting
                                      ? null
                                      : _quote?.pricingSummary,
                                  totalLabel: _quoting
                                      ? 'Calculando…'
                                      : _currency.format(displayTotal),
                                ),
                              ),
                              if (showLeaveNowHint)
                                Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: _UrgencyCard(
                                    label:
                                        'Partida em breve: ideal sair agora para chegar com calma.',
                                  ),
                                ),
                              Padding(
                                padding: const EdgeInsets.only(top: 18),
                                child: Text(
                                  'Forma de pagamento',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  onsiteEnabled && onlineEnabled
                                      ? 'Escolha como deseja concluir sua reserva.'
                                      : onsiteEnabled && !onlineEnabled
                                          ? 'Esta arena aceita pagamento na arena.'
                                          : !onsiteEnabled && onlineEnabled
                                              ? 'Esta arena aceita pagamento via PIX no app.'
                                              : 'Esta arena ainda não configurou meios de pagamento no app.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurface
                                        .withValues(alpha: 0.6),
                                    height: 1.35,
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 14),
                                child: isPaymentConfigLoading
                                    ? const _PaymentSkeleton()
                                    : !canPayHere
                                        ? _PaymentErrorCard(
                                            message:
                                                'Não é possível concluir por aqui. Entre em contato com a arena.',
                                          )
                                        : Column(
                                            children: [
                                              if (onsiteEnabled)
                                                _PaymentOptionCard(
                                                  title: 'Pagar na arena',
                                                  subtitle:
                                                      'Confirme agora e pague presencialmente ao chegar.',
                                                  icon:
                                                      Icons.storefront_outlined,
                                                  selected: choice ==
                                                      _PaymentChoice.atVenue,
                                                  disabled: _submitting,
                                                  onTap: () {
                                                    HapticFeedback
                                                        .selectionClick();
                                                    setState(() =>
                                                        _paymentChoice =
                                                            _PaymentChoice
                                                                .atVenue);
                                                  },
                                                ),
                                              if (onsiteEnabled &&
                                                  onlineEnabled)
                                                const SizedBox(height: 10),
                                              if (onlineEnabled)
                                                _PaymentOptionCard(
                                                  title: 'Pagar com PIX',
                                                  subtitle:
                                                      'QR Code no app — confirmação automática.',
                                                  icon: Icons.pix_rounded,
                                                  selected: choice ==
                                                      _PaymentChoice.pix,
                                                  disabled: _submitting,
                                                  onTap: () {
                                                    HapticFeedback
                                                        .selectionClick();
                                                    setState(() =>
                                                        _paymentChoice =
                                                            _PaymentChoice.pix);
                                                  },
                                                ),
                                            ],
                                          ),
                              ),
                              if (onlineEnabled &&
                                  choice == _PaymentChoice.pix) ...[
                                const SizedBox(height: 16),
                                Text(
                                  'Quanto deseja pagar agora?',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                      child: _PixFractionChip(
                                        label: '50% (sinal)',
                                        amount: _pixPayAmount(displayTotal),
                                        selected: _pixFraction == 0.5,
                                        onTap: _submitting
                                            ? null
                                            : () => setState(
                                                  () => _pixFraction = 0.5,
                                                ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: _PixFractionChip(
                                        label: '100%',
                                        amount: displayTotal,
                                        selected: _pixFraction == 1.0,
                                        onTap: _submitting
                                            ? null
                                            : () => setState(
                                                  () => _pixFraction = 1.0,
                                                ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (_pixFraction == 0.5) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    'O restante você paga na arena no dia do jogo.',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: AppColors.onSurfaceMuted,
                                      height: 1.35,
                                    ),
                                  ),
                                ],
                              ],
                              Padding(
                                padding: const EdgeInsets.only(top: 16),
                                child: Center(
                                  child: TextButton(
                                    onPressed: _submitting
                                        ? null
                                        : () {
                                            if (context.canPop()) {
                                              context.pop();
                                            } else {
                                              context.go(
                                                AppRoutes.arenaSlots.replaceAll(
                                                    ':arenaId', widget.arenaId),
                                              );
                                            }
                                          },
                                    child: const Text('Alterar horário'),
                                  ),
                                ),
                              ),
                            ]),
                          ),
                        ),
                      ],
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _StickyConfirmBar(
                        totalLabel: _quoting
                            ? 'Calculando…'
                            : _currency.format(displayTotal),
                        ctaLabel: ctaLabel,
                        submitting: _submitting,
                        enabled: canPayHere && !_submitting,
                        onConfirm: () {
                          HapticFeedback.mediumImpact();
                          if (choice == _PaymentChoice.pix) {
                            _confirmWithPix(args);
                          } else {
                            _finalizeBookingPayAtArena(args);
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  DateTime? _parseStartDateTime(String dateKey, String startTime) {
    if (dateKey.trim().isEmpty || startTime.trim().isEmpty) return null;
    return _dateTimeFmt.tryParse('${dateKey.trim()} ${startTime.trim()}');
  }
}

class _BookingHeroCard extends StatelessWidget {
  const _BookingHeroCard({
    required this.arenaName,
    required this.courtName,
    required this.dateLabel,
    required this.timeRange,
  });

  final String arenaName;
  final String courtName;
  final String dateLabel;
  final String timeRange;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF321200), Color(0xFF0F0F10)],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.22),
            blurRadius: 32,
            offset: const Offset(0, 16),
            spreadRadius: -14,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
            ),
            child: const Text(
              'Quase concluído',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            arenaName,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            courtName,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: Colors.white.withValues(alpha: 0.82),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _HeroMetaChip(icon: Icons.calendar_today_rounded, label: dateLabel),
              const SizedBox(width: 8),
              _HeroMetaChip(icon: Icons.schedule_rounded, label: timeRange),
            ],
          )
        ],
      ),
    );
  }
}

class _HeroMetaChip extends StatelessWidget {
  const _HeroMetaChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingSummaryCard extends StatelessWidget {
  const _BookingSummaryCard({
    required this.dateLabel,
    required this.timeRange,
    required this.durationLabel,
    required this.totalLabel,
    this.pricingDetail,
  });
  final String dateLabel;
  final String timeRange;
  final String durationLabel;
  final String totalLabel;
  final String? pricingDetail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: theme.colorScheme.surfaceContainerHigh.withValues(alpha: 0.5),
        border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          _SummaryLine(icon: Icons.calendar_today_rounded, label: 'Data', value: dateLabel),
          const SizedBox(height: 10),
          _SummaryLine(
            icon: Icons.schedule_rounded,
            label: 'Horário',
            value: durationLabel.isEmpty
                ? timeRange
                : '$timeRange · $durationLabel',
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(height: 1),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.payments_outlined, color: AppColors.brand),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total',
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (pricingDetail != null && pricingDetail!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          pricingDetail!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.55),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Text(
                totalLabel,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.brand,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryLine extends StatelessWidget {
  const _SummaryLine({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.brand.withValues(alpha: 0.95)),
        const SizedBox(width: 10),
        Text(label, style: theme.textTheme.bodyMedium),
        const Spacer(),
        Text(value, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _UrgencyCard extends StatelessWidget {
  const _UrgencyCard({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: AppColors.brand.withValues(alpha: 0.1),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.24)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            const Icon(Icons.directions_run_rounded, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
          ],
        ),
      ),
    );
  }
}

class _PaymentOptionCard extends StatelessWidget {
  const _PaymentOptionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selected,
    required this.disabled,
    required this.onTap,
  });
  final String title;
  final String subtitle;
  final IconData icon;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedScale(
      duration: const Duration(milliseconds: 220),
      scale: selected ? 1.01 : 1,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: selected
              ? AppColors.brand.withValues(alpha: 0.11)
              : theme.colorScheme.surfaceContainerHigh.withValues(alpha: 0.5),
          border: Border.all(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.9)
                : theme.colorScheme.outline.withValues(alpha: 0.2),
            width: selected ? 1.6 : 1,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: AppColors.brand.withValues(alpha: 0.2),
                    blurRadius: 24,
                    spreadRadius: -12,
                    offset: const Offset(0, 8),
                  ),
                ]
              : null,
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: disabled ? null : onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(icon, color: selected ? AppColors.brand : theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.64),
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                AnimatedOpacity(
                  opacity: selected ? 1 : 0.35,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(
                    selected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                    color: selected ? AppColors.brand : theme.colorScheme.onSurfaceVariant,
                  ),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PaymentSkeleton extends StatelessWidget {
  const _PaymentSkeleton();
  @override
  Widget build(BuildContext context) {
    return Column(
      children: const [
        _SkeletonLine(height: 84),
        SizedBox(height: 10),
        _SkeletonLine(height: 84),
      ],
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  const _SkeletonLine({required this.height});
  final double height;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(16),
      ),
    );
  }
}

class _PaymentErrorCard extends StatelessWidget {
  const _PaymentErrorCard({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: theme.colorScheme.errorContainer.withValues(alpha: 0.35),
        border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.2)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.error_outline_rounded, color: theme.colorScheme.error),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: const TextStyle(fontWeight: FontWeight.w600))),
          ],
        ),
      ),
    );
  }
}

class _PixFractionChip extends StatelessWidget {
  const _PixFractionChip({
    required this.label,
    required this.amount,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final double amount;
  final bool selected;
  final VoidCallback? onTap;

  static final _fmt = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.15)
          : AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : AppColors.onSurfaceMuted.withValues(alpha: 0.25),
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(
                label,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: selected ? AppColors.brand : AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _fmt.format(amount),
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StickyConfirmBar extends StatelessWidget {
  const _StickyConfirmBar({
    required this.totalLabel,
    required this.ctaLabel,
    required this.submitting,
    required this.enabled,
    required this.onConfirm,
  });
  final String totalLabel;
  final String ctaLabel;
  final bool submitting;
  final bool enabled;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.98),
        border: Border(top: BorderSide(color: theme.colorScheme.outline.withValues(alpha: 0.2))),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Total', style: theme.textTheme.labelSmall),
                    Text(
                      totalLabel,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: enabled ? onConfirm : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                  ),
                  child: submitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        )
                      : Text(
                          ctaLabel,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
