import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/ui/feedback/show_feedback_page.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/payment_service.dart';
import '../domain/arena_booking_pix_amounts.dart';
import '../domain/arena_booking_pix_args.dart';
import '../domain/booking_providers.dart';
import '../domain/payment_providers.dart';
import 'booking_success_page.dart';
import 'widgets/booking_pix/booking_pix_amount_section.dart';
import 'widgets/booking_pix/booking_pix_app_bar.dart';
import 'widgets/booking_pix/booking_pix_copy_button.dart';
import 'widgets/booking_pix/booking_pix_cpf_field.dart';
import 'widgets/booking_pix/booking_pix_expiry_card.dart';
import 'widgets/booking_pix/booking_pix_generate_bar.dart';
import 'widgets/booking_pix/booking_pix_method_card.dart';
import 'widgets/booking_pix/booking_pix_qr_card.dart';
import 'widgets/booking_pix/booking_pix_save_cpf_tile.dart';
import 'widgets/booking_pix/booking_pix_waiting_card.dart';

class ArenaBookingPixPage extends ConsumerStatefulWidget {
  const ArenaBookingPixPage({
    super.key,
    required this.arenaId,
    required this.args,
  });

  final String arenaId;
  final ArenaBookingPixArgs args;

  @override
  ConsumerState<ArenaBookingPixPage> createState() =>
      _ArenaBookingPixPageState();
}

class _ArenaBookingPixPageState extends ConsumerState<ArenaBookingPixPage> {
  final _cpfController = TextEditingController();
  ArenaBookingPixPaymentResult? _pix;
  bool _loadingPix = false;
  String? _pixError;
  bool _navigatedSuccess = false;
  bool _paymentFailed = false;
  bool _cancelling = false;
  bool _saveCpf = true;
  double _paymentFraction = 1.0;
  Timer? _expiryTimer;

  static final _dateFmt = DateFormat('d MMM yyyy', 'pt_BR');

  double get _totalReais => widget.args.confirmArgs.amountReais;

  double get _payNowReais =>
      ArenaBookingPixAmounts.payNowReais(_totalReais, _paymentFraction);

  double get _dueOnsiteReais =>
      ArenaBookingPixAmounts.dueOnsiteReais(_totalReais, _paymentFraction);

  @override
  void initState() {
    super.initState();
    _paymentFraction = widget.args.paymentFraction;
    if (_paymentFraction != 0.5 && _paymentFraction != 1.0) {
      _paymentFraction = 1.0;
    }
    _cpfController.addListener(_onCpfTextChanged);
    final initialExpiry = widget.args.paymentExpiresAt;
    if (initialExpiry != null) {
      _scheduleExpiry(initialExpiry);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _prefillCpf());
  }

  void _onCpfTextChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _expiryTimer?.cancel();
    _cpfController.removeListener(_onCpfTextChanged);
    _cpfController.dispose();
    super.dispose();
  }

  String get _cpfDigits => CpfCnpjValidator.digitsOnly(_cpfController.text);

  bool get _hasValidCpf => CpfCnpjValidator.isValid(_cpfController.text);

  String? get _cpfHint =>
      CpfCnpjValidator.validationMessage(_cpfController.text);

  void _prefillCpf() {
    final saved = ref.read(athleteProfileProvider).valueOrNull?.cpfCnpj;
    if (saved != null && CpfCnpjValidator.isValid(saved)) {
      _cpfController.text = CpfCnpjValidator.formatDisplay(saved);
      if (mounted) setState(() {});
    }
  }

  Future<void> _saveCpfToProfileIfNeeded() async {
    if (!_saveCpf || !_hasValidCpf) return;
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (profile == null) return;
    final digits = _cpfDigits;
    if (profile.cpfCnpj == digits) return;
    try {
      await ref
          .read(athleteProfileRepositoryProvider)
          .saveProfile(profile.copyWith(cpfCnpj: digits));
    } catch (_) {}
  }

  Future<void> _loadPix() async {
    final cpfMsg = _cpfHint;
    if (!_hasValidCpf) {
      setState(() {
        _pixError = cpfMsg ?? 'Informe um CPF válido para gerar o PIX.';
        _loadingPix = false;
      });
      return;
    }
    setState(() {
      _loadingPix = true;
      _pixError = null;
    });
    try {
      await _saveCpfToProfileIfNeeded();
      final pix = await ref
          .read(paymentServiceProvider)
          .createArenaBookingPixPayment(
            bookingId: widget.args.bookingId,
            cpfCnpj: _cpfDigits,
            paymentFraction: _paymentFraction,
          );
      if (!mounted) return;
      setState(() {
        _pix = pix;
        _loadingPix = false;
      });
      _scheduleExpiry(pix.expiresAt);
    } on PaymentException catch (e) {
      if (!mounted) return;
      setState(() => _loadingPix = false);
      await pushErrorFeedback(
        context,
        title: 'Não foi possível gerar a cobrança',
        description: e.message,
        primaryAction: FeedbackAction(
          label: 'Tentar novamente',
          onPressed: () => Navigator.of(context).pop(),
        ),
        secondaryAction: FeedbackAction(
          label: 'Voltar',
          isPrimary: false,
          onPressed: () {
            Navigator.of(context).pop();
            _onBack();
          },
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingPix = false);
      await pushErrorFeedback(
        context,
        title: 'Não foi possível gerar o PIX',
        description: 'Tente novamente em instantes.',
        primaryAction: FeedbackAction(
          label: 'Tentar novamente',
          onPressed: () => Navigator.of(context).pop(),
        ),
        secondaryAction: FeedbackAction(
          label: 'Voltar',
          isPrimary: false,
          onPressed: () {
            Navigator.of(context).pop();
            _onBack();
          },
        ),
      );
    }
  }

  void _scheduleExpiry(DateTime expiresAt) {
    _expiryTimer?.cancel();
    final remaining = expiresAt.difference(DateTime.now());
    if (remaining.inSeconds <= 0) {
      unawaited(_handlePaymentNotCompleted());
      return;
    }
    _expiryTimer = Timer(remaining, () {
      if (mounted) unawaited(_handlePaymentNotCompleted());
    });
  }

  Future<void> _handlePaymentNotCompleted() async {
    if (_navigatedSuccess || _paymentFailed || _cancelling) return;
    setState(() => _paymentFailed = true);
    _expiryTimer?.cancel();
    await _cancelPendingIfNeeded();
  }

  Future<void> _cancelPendingIfNeeded() async {
    if (_cancelling) return;
    _cancelling = true;
    try {
      await ref
          .read(paymentServiceProvider)
          .cancelPendingArenaBookingPayment(bookingId: widget.args.bookingId);
    } catch (_) {
    } finally {
      _cancelling = false;
    }
  }

  void _onBookingUpdate(Map<String, dynamic>? data) {
    if (_navigatedSuccess || _paymentFailed || data == null) return;
    final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim() ?? '';
    final st = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    if (st == 'cancelled' || ps == 'rejected' || ps == 'expired') {
      unawaited(_handlePaymentNotCompleted());
      return;
    }
    if (ps != 'paid' && ps != 'partial') return;
    _navigatedSuccess = true;
    _expiryTimer?.cancel();
    _goSuccess();
  }

  void _goSuccess() {
    final confirm = widget.args.confirmArgs;
    final timeRange = '${confirm.startTime} – ${confirm.endTime}';
    final dateLabel = _dateFmt.format(confirm.date);
    final paid = _pix?.amountToPayNowReais ?? _payNowReais;
    final due = _dueOnsiteReais;
    final amountLabel = due > 0.02
        ? 'PIX: ${formatBRL(paid)} · Restante no local: ${formatBRL(due)}'
        : 'Total pago: ${formatBRL(paid)}';

    final uri = Uri(
      path: AppRoutes.arenaBookingSuccess.replaceAll(
        ':arenaId',
        widget.arenaId,
      ),
      queryParameters: <String, String>{
        'date': confirm.dateKey,
        'startTime': confirm.startTime,
        'endTime': confirm.endTime,
        'amountReais': paid.toString(),
        'payment': 'pix_ok',
        'bookingId': widget.args.bookingId,
        'arenaName': confirm.arenaName,
        'courtName': confirm.courtName,
      },
    );
    context.go(
      uri.toString(),
      extra: BookingSuccessArgs(
        arenaId: widget.arenaId,
        arenaName: confirm.arenaName,
        courtName: confirm.courtName,
        dateKey: confirm.dateKey,
        startTime: confirm.startTime,
        endTime: confirm.endTime,
        dateLabel: dateLabel,
        timeRangeLabel: timeRange,
        bookingIds: <String>[widget.args.bookingId],
        amountReais: paid,
        paymentApproved: true,
        amountLabel: amountLabel,
        paymentLabel: due > 0.02
            ? 'O restante você paga na arena no dia do jogo.'
            : null,
      ),
    );
  }

  void _onBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.discover);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(arenaBookingDocProvider(widget.args.bookingId), (prev, next) {
      next.whenData((snap) {
        if (snap != null && snap.exists) {
          _onBookingUpdate(snap.data());
        }
      });
    });

    final expiresAt = _pix?.expiresAt ?? widget.args.paymentExpiresAt;
    final showQr = _pix != null && !_loadingPix;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingPixAppBar(onBack: _onBack),
      body: _paymentFailed
          ? _buildFailedBody(context)
          : Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (!showQr) ...[
                          BookingPixMethodCard(
                            amountLabel: BookingPixMethodCard.formatAmount(
                              _payNowReais,
                            ),
                          ),
                          SizedBox(height: 20),
                          BookingPixAmountSection(
                            totalReais: _totalReais,
                            selectedFraction: _paymentFraction,
                            enabled: !_loadingPix,
                            onFractionChanged: (f) {
                              if (_pix != null) return;
                              setState(() => _paymentFraction = f);
                            },
                          ),
                          SizedBox(height: 20),
                          BookingPixCpfField(
                            controller: _cpfController,
                            errorText: _cpfHint,
                            onSubmitted: _hasValidCpf ? _loadPix : null,
                          ),
                          SizedBox(height: 12),
                          BookingPixSaveCpfTile(
                            value: _saveCpf,
                            onChanged: (v) => setState(() => _saveCpf = v),
                          ),
                          if (_pixError != null) ...[
                            SizedBox(height: 16),
                            _PixErrorCard(
                              message: _pixError!,
                              onRetry: _loadPix,
                            ),
                          ],
                        ] else ...[
                          if (expiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: expiresAt,
                              amountReais:
                                  _pix?.amountToPayNowReais ?? _payNowReais,
                            ),
                            SizedBox(height: 20),
                          ],
                          BookingPixQrCard(
                            base64: _pix!.qrCodeBase64,
                            payload: _pix!.qrCode,
                          ),
                          SizedBox(height: 16),
                          BookingPixCopyButton(
                            onPressed: () async {
                              await Clipboard.setData(
                                ClipboardData(text: _pix!.qrCode),
                              );
                              if (!context.mounted) return;
                              showAppSnackBar(context, 'Código PIX copiado.');
                            },
                          ),
                          SizedBox(height: 16),
                          const BookingPixWaitingCard(),
                          SizedBox(height: 12),
                          TextButton(
                            onPressed: _cancelling
                                ? null
                                : () async {
                                    await _handlePaymentNotCompleted();
                                    if (!context.mounted) return;
                                    context.pop();
                                  },
                            child: Text('Desistir do pagamento'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (!showQr)
                  BookingPixGenerateBar(
                    enabled: _hasValidCpf,
                    loading: _loadingPix,
                    onPressed: _loadPix,
                  ),
              ],
            ),
    );
  }

  Widget _buildFailedBody(BuildContext context) {
    return FeedbackPage.error(
      title: 'Pagamento não concluído',
      description:
          'A reserva foi cancelada e o horário voltou a ficar disponível.',
      primaryAction: FeedbackAction(
        label: 'Escolher outro horário',
        onPressed: _onBack,
      ),
    );
  }
}

class _PixErrorCard extends StatelessWidget {
  const _PixErrorCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.themeColors.onSurface),
            ),
            SizedBox(height: 12),
            FilledButton(
              onPressed: onRetry,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
              ),
              child: Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}
