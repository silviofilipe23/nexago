import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/formatting/app_currency_format.dart';

import '../../../core/auth/auth_providers.dart';
import '../../athlete/domain/daily_mission_sync_provider.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../data/booking_service.dart';
import '../data/payment_service.dart';
import '../domain/arena_booking_cancellation_policy.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_booking_pix_args.dart';
import '../domain/arena_booking_quote.dart';
import '../domain/arenas_providers.dart';
import '../domain/booking_providers.dart';
import 'booking_success_page.dart';
import 'widgets/booking_confirm/booking_confirm_app_bar.dart';
import 'widgets/booking_confirm/booking_confirm_cancellation_card.dart';
import 'widgets/booking_confirm/booking_confirm_hero_card.dart';
import 'widgets/booking_confirm/booking_confirm_observations_field.dart';
import 'widgets/booking_confirm/booking_confirm_price_summary.dart';
import 'widgets/booking_confirm/booking_confirm_sticky_bar.dart';

/// Confirmação da reserva (paridade com `ArenaBookConfirmComponent` no web).
class ArenaBookingConfirmPage extends ConsumerStatefulWidget {
  const ArenaBookingConfirmPage({super.key, required this.arenaId, this.args});

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
  ArenaBookingQuote? _quote;
  bool _quoting = false;
  String? _lastQuoteKey;
  late final TextEditingController _observationsController;


  static final _dateFmt = DateFormat('d MMM yyyy', 'pt_BR');

  @override
  void initState() {
    super.initState();
    _observationsController = TextEditingController();
  }

  @override
  void dispose() {
    _observationsController.dispose();
    super.dispose();
  }

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
      final quote = await ref
          .read(bookingServiceProvider)
          .quoteBooking(args: args);
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
      final bookingService = ref.read(bookingServiceProvider);
      final resumed = await bookingService.findResumablePixBooking(
        athleteId: user.uid,
        args: args,
      );
      final created = resumed ??
          await bookingService.createBookingAtomically(
            args: args,
            athleteId: user.uid,
            paymentMode: 'pix',
            paymentFraction: 1.0,
          );
      if (!mounted) return;

      final expiresAt = created.paymentExpiresAt != null
          ? DateTime.tryParse(created.paymentExpiresAt!)
          : null;

      if (resumed == null) {
        await tryAwardReserveTodayMission(ref, dateKey: args.dateKey);
      }

      if (!mounted) return;
      if (resumed != null) {
        showAppSnackBar(
          context,
          'Retomando pagamento PIX da sua reserva.',
        );
      }
      context.pushNamed(
        AppRouteNames.arenaBookingPix,
        pathParameters: <String, String>{'arenaId': widget.arenaId},
        extra: ArenaBookingPixArgs(
          bookingId: created.bookingId,
          confirmArgs: args,
          amountToPayNowReais: created.amountToPayNowReais,
          amountDueOnsiteReais: created.amountDueOnsiteReais,
          paymentFraction: created.paymentFraction,
          paymentExpiresAt: expiresAt,
        ),
      );
    } on BookingException catch (e) {
      if (!mounted) return;
      if (e.isBlockedAthlete) {
        final uri = Uri(
          path: AppRoutes.arenaBookingBlocked.replaceAll(
            ':arenaId',
            widget.arenaId,
          ),
          queryParameters: <String, String>{'message': e.message},
        );
        context.go(uri.toString());
        return;
      }
      showAppSnackBar(context, e.message, isError: e.isSlotConflict);
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
      showAppSnackBar(
        context,
        'Faça login para confirmar a reserva.',
        isError: true,
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final created = await ref
          .read(bookingServiceProvider)
          .createBookingAtomically(args: args, athleteId: user.uid);
      if (!mounted) return;
      await tryAwardReserveTodayMission(ref, dateKey: args.dateKey);
      if (!mounted) return;

      final amount = created.amountReais;

      final timeRange = '${args.startTime} – ${args.endTime}';
      final dateLabel = _dateFmt.format(args.date);
      final uri = Uri(
        path: AppRoutes.arenaBookingSuccess.replaceAll(
          ':arenaId',
          widget.arenaId,
        ),
        queryParameters: <String, String>{
          'date': args.dateKey,
          'startTime': args.startTime,
          'endTime': args.endTime,
          'amountReais': amount.toString(),
          'payment': 'paid',
          'bookingId': created.bookingId,
          'arenaName': args.arenaName,
          'courtName': args.courtName,
        },
      );
      context.go(
        uri.toString(),
        extra: BookingSuccessArgs(
          arenaId: widget.arenaId,
          arenaName: args.arenaName,
          courtName: args.courtName,
          dateKey: args.dateKey,
          startTime: args.startTime,
          endTime: args.endTime,
          dateLabel: dateLabel,
          timeRangeLabel: timeRange,
          bookingIds: <String>[created.bookingId],
          amountReais: amount,
          paymentApproved: false,
          amountLabel: 'Total: ${formatBRL(amount)}',
          paymentLabel: 'Pagamento no local na arena.',
        ),
      );
    } on BookingException catch (e) {
      if (!mounted) return;
      if (e.isBlockedAthlete) {
        final uri = Uri(
          path: AppRoutes.arenaBookingBlocked.replaceAll(
            ':arenaId',
            widget.arenaId,
          ),
          queryParameters: <String, String>{'message': e.message},
        );
        context.go(uri.toString());
        return;
      }
      showAppSnackBar(context, e.message, isError: e.isSlotConflict);
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

  void _onBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.arenaSlots.replaceAll(':arenaId', widget.arenaId));
    }
  }

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
    final fromExtra =
        widget.args ??
        (state.extra is ArenaBookingConfirmArgs
            ? state.extra! as ArenaBookingConfirmArgs
            : null);
    final fromQuery = ArenaBookingConfirmArgs.tryParseQuery(state.uri);
    final args = fromExtra ?? fromQuery;

    if (args != null && args.isValid) {
      _maybeLoadQuote(args);
    }

    if (args == null || !args.isValid || args.arenaId != widget.arenaId) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        appBar: BookingConfirmAppBar(onBack: _onBack),
        body: AppEmptyView(
          icon: Icons.event_busy_rounded,
          title: 'Dados incompletos',
          subtitle:
              'Volte à seleção de horários e escolha arena, data e quadra novamente.',
          actionLabel: 'Voltar aos horários',
          onAction: _onBack,
        ),
      );
    }

    final timeRange = '${args.startTime} - ${args.endTime}';
    final choice = _effectivePaymentChoice(
      onsiteEnabled: onsiteEnabled,
      onlineEnabled: onlineEnabled,
    );
    final displayTotal = _displayAmount(args);
    final durationCompact = formatCourtDurationLabel(args);
    final courtLineLabel = durationCompact.isEmpty
        ? 'Quadra'
        : 'Quadra ($durationCompact)';
    final stickyAmount = displayTotal;
    final stickyMeta = choice == _PaymentChoice.pix
        ? 'valor da reserva · PIX na próxima etapa'
        : 'total na arena';
    final stickyCta = choice == _PaymentChoice.pix
        ? 'Confirmar e pagar'
        : 'Confirmar reserva';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingConfirmAppBar(onBack: _onBack),
      body: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth > 560
                ? 520.0
                : constraints.maxWidth;
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
                                child: BookingConfirmHeroCard(
                                  dateKey: args.dateKey,
                                  timeRange: timeRange,
                                  arenaName: args.arenaName,
                                  courtName: args.courtName,
                                  courtSubtitle: args.courtSubtitle,
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 18),
                                child: BookingConfirmPriceSummary(
                                  courtLineLabel: courtLineLabel,
                                  courtAmountLabel: _quoting
                                      ? 'Calculando…'
                                      : formatBRL(displayTotal),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 14),
                                child: BookingConfirmCancellationCard(
                                  title:
                                      ArenaBookingCancellationPolicy.freeCancellationTitle(),
                                  subtitle:
                                      ArenaBookingCancellationPolicy.freeCancellationSubtitle(
                                        args.arenaName,
                                      ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 18),
                                child: BookingConfirmObservationsField(
                                  controller: _observationsController,
                                  enabled: !_submitting,
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 22),
                                child: Text(
                                  'FORMA DE PAGAMENTO',
                                  style: AppTypography.mono(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                    letterSpacing: 0.8,
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
                                              icon: Icons.storefront_outlined,
                                              selected:
                                                  choice ==
                                                  _PaymentChoice.atVenue,
                                              disabled: _submitting,
                                              onTap: () {
                                                HapticFeedback.selectionClick();
                                                setState(
                                                  () => _paymentChoice =
                                                      _PaymentChoice.atVenue,
                                                );
                                              },
                                            ),
                                          if (onsiteEnabled && onlineEnabled)
                                            const SizedBox(height: 10),
                                          if (onlineEnabled)
                                            _PaymentOptionCard(
                                              title: 'Pagar com PIX',
                                              subtitle:
                                                  'QR Code no app — confirmação automática.',
                                              icon: Icons.pix_rounded,
                                              selected:
                                                  choice == _PaymentChoice.pix,
                                              disabled: _submitting,
                                              onTap: () {
                                                HapticFeedback.selectionClick();
                                                setState(
                                                  () => _paymentChoice =
                                                      _PaymentChoice.pix,
                                                );
                                              },
                                            ),
                                        ],
                                      ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 16),
                                child: Center(
                                  child: TextButton(
                                    onPressed: _submitting
                                        ? null
                                        : _onBack,
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
                      child: BookingConfirmStickyBar(
                        metaLabel: stickyMeta,
                        totalLabel: _quoting
                            ? 'Calculando…'
                            : formatBRL(stickyAmount),
                        ctaLabel: stickyCta,
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
                Icon(
                  icon,
                  color: selected
                      ? AppColors.brand
                      : theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(
                            alpha: 0.64,
                          ),
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
                    selected
                        ? Icons.check_circle_rounded
                        : Icons.radio_button_unchecked_rounded,
                    color: selected
                        ? AppColors.brand
                        : theme.colorScheme.onSurfaceVariant,
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
        color: theme.colorScheme.surfaceContainerHighest.withValues(
          alpha: 0.45,
        ),
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
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.2),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.error_outline_rounded, color: theme.colorScheme.error),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
