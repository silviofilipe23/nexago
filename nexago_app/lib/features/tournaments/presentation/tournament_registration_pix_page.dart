import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../arenas/data/payment_service.dart';
import '../../arenas/domain/payment_providers.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_app_bar.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_cpf_field.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_expiry_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_generate_bar.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_method_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_save_cpf_tile.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_waiting_card.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../data/tournament_registration_service.dart';
import '../domain/tournament_registration_pix_args.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_registration_success_args.dart';
import '../../../core/router/routes.dart';

class TournamentRegistrationPixPage extends ConsumerStatefulWidget {
  const TournamentRegistrationPixPage({
    super.key,
    required this.args,
  });

  final TournamentRegistrationPixArgs args;

  @override
  ConsumerState<TournamentRegistrationPixPage> createState() =>
      _TournamentRegistrationPixPageState();
}

class _TournamentRegistrationPixPageState
    extends ConsumerState<TournamentRegistrationPixPage> {
  final _cpfController = TextEditingController();
  ArenaBookingPixPaymentResult? _pix;
  bool _loadingPix = false;
  String? _pixError;
  bool _navigatedBack = false;
  bool _paymentFailed = false;
  bool _cancelling = false;
  bool _saveCpf = true;
  Timer? _expiryTimer;

  double get _shareReais => widget.args.shareAmountReais;

  @override
  void initState() {
    super.initState();
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
          .createTournamentRegistrationPixPayment(
            registrationId: widget.args.registrationId,
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
    if (_navigatedBack || _paymentFailed || _cancelling) return;
    setState(() => _paymentFailed = true);
    _expiryTimer?.cancel();
    await _cancelPendingIfNeeded();
  }

  Future<void> _cancelPendingIfNeeded() async {
    if (_cancelling) return;
    _cancelling = true;
    try {
      await ref.read(paymentServiceProvider).cancelPendingTournamentRegistrationPix(
            registrationId: widget.args.registrationId,
          );
    } catch (_) {
    } finally {
      _cancelling = false;
    }
  }

  void _onRegistrationUpdate(TournamentRegistrationSnapshot? snap) {
    if (_navigatedBack || _paymentFailed || snap == null) return;
    final uid = ref.read(authServiceProvider).currentUser?.uid;
    if (uid == null || uid.isEmpty) return;
    if (!snap.athleteSharePaid(uid)) return;
    _navigatedBack = true;
    _expiryTimer?.cancel();
    if (!mounted) return;
    showAppSnackBar(
      context,
      snap.isPaid
          ? 'Inscrição confirmada!'
          : 'Parcela paga. Aguarde seu parceiro pagar a dele.',
    );
    if (snap.isPaid) {
      context.goNamed(
        AppRouteNames.tournamentRegistrationSuccess,
        pathParameters: {'tournamentId': widget.args.tournamentId},
        extra: TournamentRegistrationSuccessArgs(
          tournamentId: widget.args.tournamentId,
          registrationId: widget.args.registrationId,
          tournamentName: widget.args.tournamentName,
          categoryName: widget.args.categoryName,
        ),
        queryParameters: {
          'registrationId': widget.args.registrationId,
          'tournamentName': widget.args.tournamentName,
          'categoryName': widget.args.categoryName,
        },
      );
      return;
    }
    context.pop();
  }

  void _onBack() {
    if (context.canPop()) {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final access = ref.watch(tournamentAccessStateProvider);

    ref.listen(
      tournamentRegistrationSnapshotProvider(widget.args.registrationId),
      (prev, next) {
        next.whenData(_onRegistrationUpdate);
      },
    );

    if (!access.canAccess) {
      return Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: BookingPixAppBar(onBack: _onBack),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            TournamentAccessBanner(
              onboardingCompleted: access.onboardingCompleted,
              blockMessage: access.blockMessage,
            ),
          ],
        ),
      );
    }

    final expiresAt = _pix?.expiresAt ?? widget.args.paymentExpiresAt;
    final showQr = _pix != null && !_loadingPix;

    return Scaffold(
      backgroundColor: AppColors.canvas,
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
                              _shareReais,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            '${widget.args.tournamentName} · ${widget.args.categoryName}',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: AppColors.onSurfaceMuted,
                                  fontWeight: FontWeight.w500,
                                ),
                          ),
                          const SizedBox(height: 20),
                          BookingPixCpfField(
                            controller: _cpfController,
                            errorText: _cpfHint,
                            onSubmitted: _hasValidCpf ? _loadPix : null,
                          ),
                          const SizedBox(height: 12),
                          BookingPixSaveCpfTile(
                            value: _saveCpf,
                            onChanged: (v) => setState(() => _saveCpf = v),
                          ),
                          if (_pixError != null) ...[
                            const SizedBox(height: 16),
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
                                  _pix?.amountToPayNowReais ?? _shareReais,
                            ),
                            const SizedBox(height: 20),
                          ],
                          BookingPixQrCard(
                            base64: _pix!.qrCodeBase64,
                            payload: _pix!.qrCode,
                          ),
                          const SizedBox(height: 16),
                          BookingPixCopyButton(
                            onPressed: () async {
                              await Clipboard.setData(
                                ClipboardData(text: _pix!.qrCode),
                              );
                              if (!context.mounted) return;
                              showAppSnackBar(context, 'Código PIX copiado.');
                            },
                          ),
                          const SizedBox(height: 16),
                          const BookingPixWaitingCard(),
                          const SizedBox(height: 12),
                          TextButton(
                            onPressed: _cancelling
                                ? null
                                : () async {
                                    await _handlePaymentNotCompleted();
                                    if (!context.mounted) return;
                                    context.pop();
                                  },
                            child: const Text('Voltar sem pagar'),
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
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.timer_off_outlined,
              size: 56,
              color: AppColors.live.withValues(alpha: 0.9),
            ),
            const SizedBox(height: 16),
            Text(
              'PIX expirado',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Gere um novo código na tela de inscrição.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _onBack,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Voltar à inscrição'),
            ),
          ],
        ),
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
