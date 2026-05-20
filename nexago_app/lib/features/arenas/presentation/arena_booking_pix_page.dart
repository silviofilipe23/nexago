import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/athlete_profile_providers.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../data/payment_service.dart';
import '../domain/arena_booking_pix_args.dart';
import '../domain/booking_providers.dart';
import '../domain/payment_providers.dart';
import 'booking_success_page.dart';

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
  Timer? _expiryTimer;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );
  static final _dateFmt = DateFormat('d MMM yyyy', 'pt_BR');

  @override
  void initState() {
    super.initState();
    _cpfController.addListener(_onCpfTextChanged);
    final initialExpiry = widget.args.paymentExpiresAt;
    if (initialExpiry != null) {
      _scheduleExpiry(initialExpiry);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryLoadPixWithSavedCpf());
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

  String? get _cpfHint => CpfCnpjValidator.validationMessage(_cpfController.text);

  Future<void> _tryLoadPixWithSavedCpf() async {
    final saved = ref.read(athleteProfileProvider).valueOrNull?.cpfCnpj;
    if (saved != null && CpfCnpjValidator.isValid(saved)) {
      _cpfController.text = CpfCnpjValidator.formatDisplay(saved);
      await _loadPix();
    }
  }

  Future<void> _loadPix() async {
    final cpfMsg = _cpfHint;
    if (!_hasValidCpf) {
      setState(() {
        _pixError = cpfMsg ?? 'Informe um CPF ou CNPJ válido para gerar o PIX.';
        _loadingPix = false;
      });
      return;
    }
    setState(() {
      _loadingPix = true;
      _pixError = null;
    });
    try {
      final pix = await ref.read(paymentServiceProvider).createArenaBookingPixPayment(
            bookingId: widget.args.bookingId,
            cpfCnpj: _cpfDigits,
          );
      if (!mounted) return;
      setState(() {
        _pix = pix;
        _loadingPix = false;
      });
      _scheduleExpiry(pix.expiresAt);
    } on PaymentException catch (e) {
      if (!mounted) return;
      setState(() {
        _pixError = e.message;
        _loadingPix = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _pixError = 'Não foi possível gerar o PIX: $e';
        _loadingPix = false;
      });
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
      await ref.read(paymentServiceProvider).cancelPendingArenaBookingPayment(
            bookingId: widget.args.bookingId,
          );
    } catch (_) {
      // Servidor pode já ter expirado via job.
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
    final paid = widget.args.amountToPayNowReais;
    final due = widget.args.amountDueOnsiteReais;
    final amountLabel = due > 0.02
        ? 'PIX: ${_currency.format(paid)} · Restante no local: ${_currency.format(due)}'
        : 'Total pago: ${_currency.format(paid)}';

    final uri = Uri(
      path: AppRoutes.arenaBookingSuccess.replaceAll(':arenaId', widget.arenaId),
      queryParameters: <String, String>{
        'date': confirm.dateKey,
        'startTime': confirm.startTime,
        'endTime': confirm.endTime,
        'amountReais': confirm.amountReais.toString(),
        'payment': 'pix_ok',
        'bookingId': widget.args.bookingId,
        'arenaName': confirm.arenaName,
      },
    );
    context.go(
      uri.toString(),
      extra: BookingSuccessArgs(
        arenaName: confirm.arenaName,
        dateLabel: dateLabel,
        timeRangeLabel: timeRange,
        bookingIds: <String>[widget.args.bookingId],
        amountLabel: amountLabel,
        headline: due > 0.02 ? 'Sinal PIX confirmado' : 'Pagamento confirmado',
        paymentLabel: due > 0.02
            ? 'O restante você paga na arena no dia do jogo.'
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    ref.listen(arenaBookingDocProvider(widget.args.bookingId), (prev, next) {
      next.whenData((snap) {
        if (snap != null && snap.exists) {
          _onBookingUpdate(snap.data());
        }
      });
    });

    final expiresAt = _pix?.expiresAt ?? widget.args.paymentExpiresAt;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        title: const Text('Pagar com PIX'),
      ),
      body: _paymentFailed ? _buildFailedBody(theme) : SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _currency.format(widget.args.amountToPayNowReais),
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
              if (widget.args.amountDueOnsiteReais > 0.02) ...[
                const SizedBox(height: 8),
                Text(
                  'Restante na arena: ${_currency.format(widget.args.amountDueOnsiteReais)}',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
              if (expiresAt != null) ...[
                const SizedBox(height: 12),
                _PixExpiryCountdown(expiresAt: expiresAt),
              ],
              const SizedBox(height: 20),
              if (_pix == null && !_loadingPix)
                _CpfField(
                  controller: _cpfController,
                  errorText: _cpfHint,
                  onSubmitted: _hasValidCpf ? _loadPix : null,
                ),
              if (_pix == null && !_loadingPix) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _hasValidCpf ? _loadPix : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Gerar código PIX'),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              if (_loadingPix)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  ),
                )
              else if (_pixError != null)
                _ErrorCard(message: _pixError!, onRetry: _loadPix)
              else if (_pix != null) ...[
                _QrCard(
                  base64: _pix!.qrCodeBase64,
                  payload: _pix!.qrCode,
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: _pix!.qrCode));
                    if (!context.mounted) return;
                    showAppSnackBar(context, 'Código PIX copiado.');
                  },
                  icon: const Icon(Icons.copy_rounded),
                  label: const Text('Copiar código PIX'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.onSurface,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(
                      color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              Text(
                'Aguardando confirmação do pagamento…',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: _cancelling
                    ? null
                    : () async {
                        await _handlePaymentNotCompleted();
                        if (!context.mounted) return;
                        context.pop();
                      },
                child: const Text('Desistir do pagamento'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFailedBody(ThemeData theme) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.event_busy_outlined,
              size: 56,
              color: AppColors.live.withValues(alpha: 0.9),
            ),
            const SizedBox(height: 16),
            Text(
              'Pagamento não concluído',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'A reserva foi cancelada e o horário voltou a ficar disponível.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => context.pop(),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Escolher outro horário'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Atualiza só o texto do prazo — evita rebuild do QR a cada segundo.
class _PixExpiryCountdown extends StatefulWidget {
  const _PixExpiryCountdown({required this.expiresAt});

  final DateTime expiresAt;

  @override
  State<_PixExpiryCountdown> createState() => _PixExpiryCountdownState();
}

class _PixExpiryCountdownState extends State<_PixExpiryCountdown> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final remaining = widget.expiresAt.difference(DateTime.now());
    if (remaining.inSeconds <= 0) return const SizedBox.shrink();

    final label = remaining.inMinutes >= 1
        ? 'Expira em ${remaining.inMinutes.clamp(1, 99)} min'
        : 'Expira em ${remaining.inSeconds.clamp(1, 59)} s';

    return Text(
      label,
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: AppColors.pending,
            fontWeight: FontWeight.w700,
          ),
    );
  }
}

class _QrCard extends StatefulWidget {
  const _QrCard({
    required this.base64,
    required this.payload,
  });

  final String base64;
  final String payload;

  @override
  State<_QrCard> createState() => _QrCardState();
}

class _QrCardState extends State<_QrCard> {
  Widget? _cachedImage;

  @override
  void initState() {
    super.initState();
    _cachedImage = _buildQrWidget(widget.base64, widget.payload);
  }

  @override
  void didUpdateWidget(covariant _QrCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.base64 != widget.base64 || oldWidget.payload != widget.payload) {
      _cachedImage = _buildQrWidget(widget.base64, widget.payload);
    }
  }

  static Widget _buildQrWidget(String base64, String payload) {
    final fromB64 = _decodeQrImage(base64);
    if (fromB64 is! _QrPlaceholder) return fromB64;
    if (payload.trim().length > 20) {
      return QrImageView(
        data: payload.trim(),
        backgroundColor: Colors.white,
        eyeStyle: const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color: Colors.black,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color: Colors.black,
        ),
      );
    }
    return const _QrPlaceholder();
  }

  static Widget _decodeQrImage(String base64) {
    if (base64.isEmpty) return const _QrPlaceholder();
    try {
      final bytes = base64Decode(base64);
      return Image.memory(bytes, fit: BoxFit.contain, gaplessPlayback: true);
    } catch (_) {
      return const _QrPlaceholder();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: AspectRatio(
          aspectRatio: 1,
          child: _cachedImage ?? const _QrPlaceholder(),
        ),
      ),
    );
  }
}

class _QrPlaceholder extends StatelessWidget {
  const _QrPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Icon(
        Icons.qr_code_2_rounded,
        size: 120,
        color: AppColors.black.withValues(alpha: 0.2),
      ),
    );
  }
}

class _CpfField extends StatelessWidget {
  const _CpfField({
    required this.controller,
    this.errorText,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String? errorText;
  final VoidCallback? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      inputFormatters: [CpfCnpjInputFormatter()],
      style: const TextStyle(color: AppColors.onSurface),
      decoration: InputDecoration(
        labelText: 'CPF ou CNPJ do pagador',
        hintText: '000.000.000-00',
        helperText: 'Obrigatório para o PIX (Asaas)',
        errorText: errorText,
        filled: true,
        fillColor: AppColors.surfaceRaised,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onSubmitted: (_) => onSubmitted?.call(),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
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
              style: const TextStyle(color: AppColors.onSurface),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: onRetry,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
              ),
              child: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}
