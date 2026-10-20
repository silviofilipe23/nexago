import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/ui/feedback/show_feedback_page.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../arenas/data/payment_service.dart';
import '../../arenas/domain/payment_providers.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_app_bar.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_cpf_field.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_expiry_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_generate_bar.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_save_cpf_tile.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_waiting_card.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../../cashback/application/cashback_providers.dart';
import '../../cashback/domain/cashback_rules.dart';
import '../../cashback/presentation/widgets/checkout_cashback_toggle.dart';
import '../../squad/domain/squad_models.dart';
import '../../squad/domain/squad_rules.dart';
import '../data/tournament_registration_service.dart';
import '../domain/registration_payment_method.dart';
import '../domain/registration_shell_logic.dart';
import '../domain/tournament_registration_navigation.dart';
import '../domain/tournament_registration_pix_args.dart';
import '../domain/tournament_registration_providers.dart';
import 'widgets/registration_wizard/registration_wizard_notice.dart';
import 'widgets/tournament_registration/registration_card_checkout_panel.dart';
import 'widgets/tournament_registration/registration_payment_method_picker.dart';
import 'widgets/squad_code_field.dart';
import '../../squad/presentation/widgets/squad_checkout_summary.dart';

/// Cobrança online da inscrição: PIX (QR in-app) ou cartão de crédito à vista
/// (checkout hospedado do Asaas). O nome e a rota `/inscricao/pix` ficam por
/// retrocompatibilidade com links e restauração de estado.
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
  final _squadCodeController = TextEditingController();
  ArenaBookingPixPaymentResult? _pix;
  CardCheckoutPaymentResult? _card;
  RegistrationPaymentMethod _method = RegistrationPaymentMethod.pix;
  bool _loadingCharge = false;
  String? _chargeError;
  bool _navigatedBack = false;
  bool _paymentFailed = false;
  bool _cancelling = false;
  bool _saveCpf = true;

  /// "Usar meu cashback" — começa desligado: o atleta escolhe gastar.
  bool _useCashback = false;
  Timer? _expiryTimer;

  /// Indicação do NexaSquad vigente (código aplicado ou link/QR).
  SquadCodeCheck _squad = SquadCodeCheck.none;

  double get _shareReais => widget.args.shareAmountReais;

  /// Meio da cobrança viva — uma por vez, como no portal; `null` sem cobrança.
  RegistrationPaymentMethod? get _liveMethod => _pix != null
      ? RegistrationPaymentMethod.pix
      : (_card != null ? RegistrationPaymentMethod.card : null);

  String? get _livePaymentId => _pix?.paymentId ?? _card?.paymentId;

  /// Indicação que vale para a prévia. Código digitado e não aplicado é
  /// conferido só na cobrança — e ele vence o link —, então até lá não há
  /// desconto a prever.
  SquadCodeCheck get _squadPreview =>
      _squad.origin != 'code' && _squadCodeController.text.trim().isNotEmpty
          ? SquadCodeCheck.none
          : _squad;

  /// Prévia do desconto do código (o servidor confere e devolve o aplicado).
  int get _squadDiscountCents => squadDiscountPreviewCents(
        reaisToCents(_shareReais),
        _squadPreview.discountPct,
        _squadPreview.feePercent,
      );

  /// Código que vai na cobrança: o aplicado ou, sem ele, o que foi digitado
  /// (a cobrança confere). Vazio = a indicação por link, se houver, vale sozinha.
  String get _squadCodeForCharge => _squad.origin == 'code'
      ? (_squad.code ?? '')
      : _squadCodeController.text;

  /// Prévia do cashback sobre o valor desta cobrança (parcela ou integral,
  /// o mesmo `chargeAmount` que a callable cobra), depois do desconto do
  /// código — o servidor aplica o saldo sobre o que sobra.
  CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext? checkout) =>
      quoteCheckoutCashback(
        priceCents: reaisToCents(_shareReais) - _squadDiscountCents,
        checkout: checkout,
        useCashback: _useCashback,
      );

  @override
  void initState() {
    super.initState();
    _cpfController.addListener(_onCpfTextChanged);
    _squadCodeController.addListener(_onSquadCodeChanged);
    _rescheduleExpiries();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prefillCpf());
  }

  void _onCpfTextChanged() {
    if (mounted) setState(() {});
  }

  /// Digitar (ou apagar) um código muda a prévia do desconto.
  void _onSquadCodeChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _expiryTimer?.cancel();
    _cpfController.removeListener(_onCpfTextChanged);
    _squadCodeController.removeListener(_onSquadCodeChanged);
    _cpfController.dispose();
    _squadCodeController.dispose();
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

  DateTime? _resolveHoldExpiresAt(TournamentRegistrationSnapshot? snap) {
    return snap?.holdExpiresAt ?? widget.args.holdExpiresAt;
  }

  DateTime? _resolveChargeExpiresAt() {
    return _pix?.expiresAt ?? _card?.expiresAt ?? widget.args.paymentExpiresAt;
  }

  DateTime? _effectiveDeadline(TournamentRegistrationSnapshot? snap) {
    return registrationEffectivePaymentDeadline(
      holdExpiresAt: _resolveHoldExpiresAt(snap),
      pixExpiresAt: _resolveChargeExpiresAt(),
    );
  }

  void _rescheduleExpiries() {
    final snap = ref
        .read(tournamentRegistrationSnapshotProvider(widget.args.registrationId))
        .valueOrNull;
    final deadline = _effectiveDeadline(snap);
    if (deadline == null) return;
    _scheduleExpiry(deadline);
  }

  Future<void> _loadCharge() async {
    final isCard = _method == RegistrationPaymentMethod.card;
    final snap = ref
        .read(tournamentRegistrationSnapshotProvider(widget.args.registrationId))
        .valueOrNull;
    final holdAt = _resolveHoldExpiresAt(snap);
    // Sem janela mínima o servidor recusa: melhor dizer aqui do que gastar uma
    // ida para voltar com o mesmo "não".
    if (!canRegeneratePix(holdExpiresAt: holdAt)) {
      setState(() {
        _chargeError = 'Não há mais tempo para concluir o pagamento. Volte à '
            'inscrição.';
        _loadingCharge = false;
      });
      return;
    }

    final cpfMsg = _cpfHint;
    if (!_hasValidCpf) {
      setState(() {
        _chargeError = cpfMsg ??
            (isCard
                ? 'Informe um CPF válido para pagar com cartão.'
                : 'Informe um CPF válido para gerar o PIX.');
        _loadingCharge = false;
      });
      return;
    }
    setState(() {
      _loadingCharge = true;
      _chargeError = null;
    });
    try {
      await _saveCpfToProfileIfNeeded();
      // Só pede o saldo com o switch ligado e algo a usar; o servidor
      // recalcula e devolve o valor aplicado de verdade.
      final useCashback = _cashbackQuote(
        ref.read(cashbackCheckoutContextProvider),
      ).sendUseCashback;
      final service = ref.read(paymentServiceProvider);
      if (isCard) {
        final card = await service.createTournamentRegistrationCardPayment(
          registrationId: widget.args.registrationId,
          cpfCnpj: _cpfDigits,
          amountType: widget.args.amountType,
          useCashback: useCashback,
          squadCode: _squadCodeForCharge,
        );
        if (!mounted) return;
        setState(() {
          _card = card;
          _loadingCharge = false;
        });
        _rescheduleExpiries();
        await _openCardCheckout();
        return;
      }
      final pix = await service.createTournamentRegistrationPixPayment(
        registrationId: widget.args.registrationId,
        cpfCnpj: _cpfDigits,
        amountType: widget.args.amountType,
        useCashback: useCashback,
        squadCode: _squadCodeForCharge,
      );
      if (!mounted) return;
      setState(() {
        _pix = pix;
        _loadingCharge = false;
      });
      _rescheduleExpiries();
    } on PaymentException catch (e) {
      if (!mounted) return;
      setState(() => _loadingCharge = false);
      await pushErrorFeedback(
        context,
        title: 'Não foi possível gerar a cobrança',
        description: e.message,
        primaryAction: FeedbackAction(
          label: 'Tentar novamente',
          onPressed: () => Navigator.of(context).pop(),
        ),
        secondaryAction: FeedbackAction(
          label: 'Voltar à inscrição',
          isPrimary: false,
          onPressed: () {
            Navigator.of(context).pop();
            _onBack();
          },
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingCharge = false);
      await pushErrorFeedback(
        context,
        title: isCard
            ? 'Não foi possível abrir o pagamento'
            : 'Não foi possível gerar o PIX',
        description: 'Tente novamente em instantes.',
        primaryAction: FeedbackAction(
          label: 'Tentar novamente',
          onPressed: () => Navigator.of(context).pop(),
        ),
        secondaryAction: FeedbackAction(
          label: 'Voltar à inscrição',
          isPrimary: false,
          onPressed: () {
            Navigator.of(context).pop();
            _onBack();
          },
        ),
      );
    }
  }

  /// Abre (ou reabre) o checkout do Asaas no navegador do app. A cobrança
  /// segue viva se o atleta fechar sem pagar: o painel deixa reabrir.
  Future<void> _openCardCheckout() async {
    final card = _card;
    if (card == null) return;
    try {
      await ref.read(paymentServiceProvider).openHostedCheckout(card.invoiceUrl);
    } on PaymentException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível abrir o pagamento. Tente de novo.',
        isError: true,
      );
    }
  }

  /// Mata a cobrança do cartão e devolve o seletor (o atleta pode ir de PIX).
  /// Se o cartão já tinha sido aprovado, o Asaas recusa apagar e o webhook
  /// confirma a vaga do mesmo jeito — a tela segue ouvindo a inscrição.
  Future<void> _cancelCardAndChooseAgain() async {
    _expiryTimer?.cancel();
    await _cancelPendingIfNeeded();
    if (!mounted) return;
    setState(() => _card = null);
    _rescheduleExpiries();
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
    // Checkout aberto numa cobrança que vai morrer: fecha antes de o atleta
    // digitar o cartão à toa.
    if (_card != null) {
      unawaited(ref.read(paymentServiceProvider).closeHostedCheckout());
    }
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

    final confirmed = snap.isPaid || snap.athleteSharePaid(uid);
    // Cartão aprovado com o checkout ainda na frente: fecha para o atleta ver
    // a confirmação.
    if (confirmed && _card != null) {
      unawaited(ref.read(paymentServiceProvider).closeHostedCheckout());
    }

    if (snap.isPaid) {
      _navigatedBack = true;
      _expiryTimer?.cancel();
      if (!mounted) return;
      // Solo pagou o total: a vaga está garantida, mas ainda falta o parceiro
      // — volta pra tela anterior (que mostra o convite; ele entra sem taxa)
      // em vez da confirmação genérica.
      if (snap.partnerPending) {
        showAppSnackBar(
          context,
          'Vaga garantida! Você pagou o total — convide seu parceiro, ele '
          'entra sem taxa.',
        );
        context.pop();
        return;
      }
      showAppSnackBar(context, 'Inscrição confirmada!');
      navigateToTournamentRegistrationSuccess(
        context,
        ref: ref,
        tournamentId: widget.args.tournamentId,
        registrationId: widget.args.registrationId,
        tournamentName: widget.args.tournamentName,
        categoryName: widget.args.categoryName,
        paymentId: _livePaymentId,
      );
      return;
    }

    if (!confirmed) return;
    _navigatedBack = true;
    _expiryTimer?.cancel();
    if (!mounted) return;
    // Copy neutra: vale para dupla e para equipe (trio+), onde faltam N cotas.
    showAppSnackBar(
      context,
      'Parcela paga. A inscrição confirma quando todos pagarem a sua parte.',
    );
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
    final snap = ref
        .watch(tournamentRegistrationSnapshotProvider(widget.args.registrationId))
        .valueOrNull;

    ref.listen(
      tournamentRegistrationSnapshotProvider(widget.args.registrationId),
      (prev, next) {
        next.whenData((registration) {
          _onRegistrationUpdate(registration);
          if (!_navigatedBack && !_paymentFailed) {
            _rescheduleExpiries();
          }
        });
      },
    );

    if (!access.canAccess) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        appBar: BookingPixAppBar(
          onBack: _onBack,
          title: registrationChargePageTitle(_liveMethod),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.lg,
            AppSpacing.screenH,
            AppSpacing.xxl,
          ),
          children: [
            TournamentAccessBanner(
              onboardingCompleted: access.onboardingCompleted,
              blockMessage: access.blockMessage,
              missingStepTitles: access.missingStepTitles,
            ),
          ],
        ),
      );
    }

    final holdExpiresAt = _resolveHoldExpiresAt(snap);
    final hasHoldCountdown =
        holdExpiresAt != null && snap?.isPaid != true;
    final chargeExpiresAt = _resolveChargeExpiresAt();
    final displayExpiresAt = registrationEffectivePaymentDeadline(
      holdExpiresAt: holdExpiresAt,
      pixExpiresAt: chargeExpiresAt,
    );
    final liveMethod = _liveMethod;
    final showCharge = liveMethod != null && !_loadingCharge;
    final cashbackCtx = ref.watch(cashbackCheckoutContextProvider);
    final cashbackQuote = _cashbackQuote(cashbackCtx);
    final liveSquadDiscountReais =
        _pix?.squadDiscountReais ?? _card?.squadDiscountReais ?? 0;
    final liveCashbackAppliedReais =
        _pix?.cashbackAppliedReais ?? _card?.cashbackAppliedReais ?? 0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingPixAppBar(
        onBack: _onBack,
        title: registrationChargePageTitle(_liveMethod),
      ),
      body: _paymentFailed
          ? _buildFailedBody(context)
          : Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenH,
                      AppSpacing.lg,
                      AppSpacing.screenH,
                      AppSpacing.xxl,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (hasHoldCountdown) ...[
                          RegistrationWizardNotice(
                            expiresAt: holdExpiresAt,
                            totalWindow: registrationHoldCountdownTotalWindow(
                              holdMinutes: widget.args.holdMinutes,
                            ),
                          ),
                          const SizedBox(height: 20),
                        ],
                        if (!showCharge) ...[
                          RegistrationPaymentMethodPicker(
                            value: _method,
                            amountReais: cashbackQuote.chargePreviewCents / 100,
                            enabled: !_loadingCharge,
                            onChanged: (m) => setState(() {
                              _method = m;
                              _chargeError = null;
                            }),
                          ),
                          SizedBox(height: 12),
                          Text(
                            '${widget.args.tournamentName} · ${widget.args.categoryName}',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: context.themeColors.onSurfaceMuted,
                                  fontWeight: FontWeight.w500,
                                ),
                          ),
                          SizedBox(height: 20),
                          if (cashbackCtx != null &&
                              cashbackQuote.mode !=
                                  CashbackToggleMode.hidden) ...[
                            CheckoutCashbackToggle(
                              priceCents: cashbackQuote.priceCents,
                              availableCents: cashbackCtx.availableCents,
                              config: cashbackCtx.config,
                              value: _useCashback,
                              enabled: !_loadingCharge,
                              onChanged: (v) =>
                                  setState(() => _useCashback = v),
                            ),
                            const SizedBox(height: 20),
                          ],
                          BookingPixCpfField(
                            controller: _cpfController,
                            errorText: _cpfHint,
                            onSubmitted: _hasValidCpf ? _loadCharge : null,
                            helperText: _method ==
                                    RegistrationPaymentMethod.card
                                ? 'Exigido pelo emissor da cobrança no cartão.'
                                : 'Necessário pela legislação brasileira para '
                                    'emissão do PIX.',
                          ),
                          SizedBox(height: 12),
                          BookingPixSaveCpfTile(
                            value: _saveCpf,
                            onChanged: (v) => setState(() => _saveCpf = v),
                          ),
                          const SizedBox(height: 12),
                          SquadCodeField(
                            controller: _squadCodeController,
                            registrationId: widget.args.registrationId,
                            athleteUids: snap?.participantUids ?? const [],
                            enabled: !_loadingCharge,
                            onChanged: (check) =>
                                setState(() => _squad = check),
                          ),
                          if (_squadDiscountCents > 0) ...[
                            const SizedBox(height: 16),
                            SquadCheckoutSummary(
                              priceCents: reaisToCents(_shareReais),
                              discountCents: _squadDiscountCents,
                              discountLabel: _squadPreview.origin == 'code'
                                  ? 'Código ${_squadPreview.code}'
                                  : 'Indicação',
                              cashbackCents: cashbackQuote.appliedPreviewCents,
                              totalCents: cashbackQuote.chargePreviewCents,
                            ),
                          ],
                          if (_chargeError != null) ...[
                            SizedBox(height: 16),
                            _PixErrorCard(
                              message: _chargeError!,
                              onRetry: _loadCharge,
                            ),
                          ],
                        ] else ...[
                          if (displayExpiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: displayExpiresAt,
                              // A cobrança vale `chargedReais` (preço − saldo).
                              amountReais: _pix?.chargedReais ??
                                  _card?.chargedReais ??
                                  _shareReais,
                            ),
                            const SizedBox(height: 20),
                          ],
                          if (liveSquadDiscountReais > 0) ...[
                            Text(
                              '${formatBRL(liveSquadDiscountReais)} de '
                              'desconto pela indicação de embaixador',
                              key: const Key('squad-discount-note'),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: context.themeColors.win,
                                    fontWeight: FontWeight.w600,
                                  ),
                            ),
                            const SizedBox(height: 12),
                          ],
                          if (liveCashbackAppliedReais > 0) ...[
                            CheckoutCashbackAppliedNote(
                              appliedCents: reaisToCents(
                                liveCashbackAppliedReais,
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
                          if (liveMethod == RegistrationPaymentMethod.card) ...[
                            RegistrationCardCheckoutPanel(
                              amountReais: _card!.chargedReais,
                              onOpen: _openCardCheckout,
                            ),
                            SizedBox(height: 16),
                            const BookingPixWaitingCard(),
                            SizedBox(height: 12),
                            TextButton(
                              onPressed:
                                  _cancelling ? null : _cancelCardAndChooseAgain,
                              child: Text(
                                'Cancelar e trocar o meio de pagamento',
                              ),
                            ),
                          ] else ...[
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
                              child: Text('Voltar sem pagar'),
                            ),
                          ],
                        ],
                      ],
                    ),
                  ),
                ),
                if (!showCharge)
                  BookingPixGenerateBar(
                    enabled: _hasValidCpf,
                    loading: _loadingCharge,
                    onPressed: _loadCharge,
                    label: registrationChargeButtonLabel(
                      _method,
                      chargeReais: cashbackQuote.chargePreviewCents / 100,
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _buildFailedBody(BuildContext context) {
    final snap = ref
        .read(tournamentRegistrationSnapshotProvider(widget.args.registrationId))
        .valueOrNull;
    final holdAt = _resolveHoldExpiresAt(snap);
    // Faltando menos que a janela mínima, um novo código seria recusado — a
    // vaga acabou junto com a cobrança, mesmo que o relógio ainda não tenha
    // zerado.
    final outOfTime = !canRegeneratePix(holdExpiresAt: holdAt);
    final isCard = _method == RegistrationPaymentMethod.card;
    return FeedbackPage.error(
      title: outOfTime
          ? 'Prazo da vaga encerrado'
          : (isCard ? 'Pagamento expirado' : 'PIX expirado'),
      description: outOfTime
          ? 'Não há mais tempo para concluir o pagamento e sua vaga será '
              'liberada. Volte à inscrição se ainda houver vagas.'
          : (isCard
              ? 'O tempo para pagar acabou. Abra um novo pagamento na tela '
                  'de inscrição.'
              : 'Gere um novo código na tela de inscrição.'),
      primaryAction: FeedbackAction(
        label: 'Voltar à inscrição',
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
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: AppColors.live.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.themeColors.onSurface),
            ),
            SizedBox(height: AppSpacing.md),
            FilledButton(
              onPressed: onRetry,
              child: Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Resumo com o desconto da indicação (App 07): prévia — o valor de verdade
/// volta na cobrança.
