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
import '../../cashback/application/cashback_providers.dart';
import '../../cashback/domain/cashback_rules.dart';
import '../../cashback/presentation/widgets/checkout_cashback_toggle.dart';
import '../../squad/domain/squad_models.dart';
import '../../squad/domain/squad_rules.dart';
import '../../squad/presentation/widgets/squad_checkout_summary.dart';
import '../../tournaments/domain/registration_payment_method.dart';
import '../../tournaments/presentation/widgets/squad_code_field.dart';
import '../../tournaments/presentation/widgets/tournament_registration/registration_card_checkout_panel.dart';
import '../../tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';
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
  final _squadCodeController = TextEditingController();
  ArenaBookingPixPaymentResult? _pix;
  CardCheckoutPaymentResult? _card;
  RegistrationPaymentMethod _method = RegistrationPaymentMethod.pix;

  /// Houve cobrança de cartão nesta reserva (mesmo depois de trocar para o
  /// PIX): soltar o horário tem de usar a chamada que repassa "cartão aprovado
  /// / em análise", senão a tela daria como perdida uma reserva confirmada.
  bool _cardAttempted = false;

  /// Último prazo que o servidor deu (5 min do PIX, ou o do cartão).
  DateTime? _deadline;
  bool _loadingCharge = false;
  String? _chargeError;
  bool _navigatedSuccess = false;
  bool _paymentFailed = false;
  bool _cancelling = false;
  bool _saveCpf = true;

  /// "Usar meu cashback" — começa desligado: o atleta escolhe gastar.
  bool _useCashback = false;
  double _paymentFraction = 1.0;

  /// Indicação do NexaSquad vigente (código aplicado ou link/QR).
  SquadCodeCheck _squad = SquadCodeCheck.none;
  Timer? _expiryTimer;

  static final _dateFmt = DateFormat('d MMM yyyy', 'pt_BR');

  /// Meio da cobrança viva — uma por vez; `null` sem cobrança.
  RegistrationPaymentMethod? get _liveMethod => _pix != null
      ? RegistrationPaymentMethod.pix
      : (_card != null ? RegistrationPaymentMethod.card : null);

  /// Total da reserva pro cashback (sinal + saldo na arena): o que o
  /// servidor calculou, com cupom/promoção já aplicados — não o preço de
  /// lista do `confirmArgs` (que não sabe de desconto nenhum).
  /// `booking_service.dart` pode devolver os dois zerados; aí cai no preço
  /// de lista.
  double get _totalReais {
    final serverTotal =
        widget.args.amountToPayNowReais + widget.args.amountDueOnsiteReais;
    return serverTotal > 0 ? serverTotal : widget.args.confirmArgs.amountReais;
  }

  double get _payNowReais =>
      ArenaBookingPixAmounts.payNowReais(_totalReais, _paymentFraction);

  double get _dueOnsiteReais =>
      ArenaBookingPixAmounts.dueOnsiteReais(_totalReais, _paymentFraction);

  /// Indicação que vale para a prévia. Código digitado e não aplicado é
  /// conferido só na cobrança — e ele vence o link —, então até lá não há
  /// desconto a prever.
  SquadCodeCheck get _squadPreview =>
      _squad.origin != 'code' && _squadCodeController.text.trim().isNotEmpty
          ? SquadCodeCheck.none
          : _squad;

  /// Prévia do desconto do código sobre o que se paga AGORA (com sinal, a
  /// metade), com teto na taxa da arena: sai da taxa da nexaGO e a arena
  /// recebe o mesmo líquido. O servidor confere e devolve o aplicado.
  int get _squadDiscountCents => squadDiscountPreviewCents(
        reaisToCents(_payNowReais),
        _squadPreview.discountPct,
        _squadPreview.feePercent,
        floorReais: _squadPreview.feeFloorReais,
      );

  /// Código que vai na cobrança: o aplicado ou, sem ele, o que foi digitado
  /// (a cobrança confere). Vazio = a indicação por link, se houver, vale sozinha.
  String get _squadCodeForCharge => _squad.origin == 'code'
      ? (_squad.code ?? '')
      : _squadCodeController.text;

  /// Prévia do cashback sobre o valor a pagar AGORA — com sinal de 50% é a
  /// metade: o servidor reserva o saldo sobre `amountToPayNow` — depois do
  /// desconto do código.
  CashbackCheckoutQuote _cashbackQuote(CashbackCheckoutContext? checkout) =>
      quoteCheckoutCashback(
        priceCents: reaisToCents(_payNowReais) - _squadDiscountCents,
        checkout: checkout,
        useCashback: _useCashback,
      );

  @override
  void initState() {
    super.initState();
    _paymentFraction = widget.args.paymentFraction;
    if (_paymentFraction != 0.5 && _paymentFraction != 1.0) {
      _paymentFraction = 1.0;
    }
    if (widget.args.weatherCreditAppliedReais > 0) _paymentFraction = 1.0;
    _cpfController.addListener(_onCpfTextChanged);
    _squadCodeController.addListener(_onCpfTextChanged);
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
    _squadCodeController.removeListener(_onCpfTextChanged);
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

  Future<void> _loadCharge() async {
    final isCard = _method == RegistrationPaymentMethod.card;
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
        // O relógio do PIX (5 min) não pode cancelar a reserva no meio da
        // chamada: o cartão ganha prazo próprio no servidor.
        _expiryTimer?.cancel();
        final card = await service.createArenaBookingCardPayment(
          bookingId: widget.args.bookingId,
          cpfCnpj: _cpfDigits,
          paymentFraction: _paymentFraction,
          useCashback: useCashback,
          squadCode: _squadCodeForCharge,
        );
        if (!mounted || _paymentFailed || _navigatedSuccess) return;
        setState(() {
          _card = card;
          _cardAttempted = true;
          _loadingCharge = false;
        });
        // O cartão ganha prazo próprio no servidor (15 min desde a criação).
        _scheduleExpiry(card.expiresAt);
        await _openCardCheckout();
        return;
      }
      final pix = await service.createArenaBookingPixPayment(
        bookingId: widget.args.bookingId,
        cpfCnpj: _cpfDigits,
        paymentFraction: _paymentFraction,
        useCashback: useCashback,
        squadCode: _squadCodeForCharge,
      );
      if (!mounted) return;
      setState(() {
        _pix = pix;
        _loadingCharge = false;
      });
      _scheduleExpiry(pix.expiresAt);
    } on PaymentException catch (e) {
      if (!mounted) return;
      setState(() => _loadingCharge = false);
      _restoreExpiryAfterFailedCharge();
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
      setState(() => _loadingCharge = false);
      _restoreExpiryAfterFailedCharge();
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

  /// Cobrança que falhou: volta o relógio que valia (o do cartão desligou o
  /// do PIX antes da chamada).
  void _restoreExpiryAfterFailedCharge() {
    if (_liveMethod != null) return;
    final expiry = _deadline ?? widget.args.paymentExpiresAt;
    if (expiry != null) _scheduleExpiry(expiry);
  }

  /// Abre (ou reabre) o checkout do Asaas no navegador do app.
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

  /// Volta ao seletor para pagar com PIX. Não cancela nada aqui: gerar o PIX
  /// tira a cobrança do cartão de cena no servidor (e recusa, se ela já foi
  /// aprovada). O prazo continua o do cartão.
  void _switchToPix() {
    setState(() {
      _card = null;
      _method = RegistrationPaymentMethod.pix;
      _chargeError = null;
    });
  }

  void _scheduleExpiry(DateTime expiresAt) {
    _deadline = expiresAt;
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
    if (_card != null || _cardAttempted) {
      // Cartão: o servidor confere no Asaas antes de soltar o horário. Se o
      // cartão foi aprovado (ou está em análise), a reserva não é perdida — o
      // doc da reserva leva à confirmação.
      final released = await _cancelCardBooking();
      if (!released || !mounted) return;
      unawaited(ref.read(paymentServiceProvider).closeHostedCheckout());
      setState(() => _paymentFailed = true);
      _expiryTimer?.cancel();
      return;
    }
    setState(() => _paymentFailed = true);
    _expiryTimer?.cancel();
    await _cancelPendingIfNeeded();
  }

  /// Devolve se o servidor soltou o horário. Recusa (cartão aprovado, em
  /// análise) ou falha de rede: segue esperando — a varredura resolve.
  Future<bool> _cancelCardBooking() async {
    if (_cancelling) return false;
    _cancelling = true;
    try {
      await ref
          .read(paymentServiceProvider)
          .releasePendingArenaBookingCardPayment(bookingId: widget.args.bookingId);
      return true;
    } on PaymentException catch (e) {
      if (mounted) showAppSnackBar(context, e.message);
      return false;
    } catch (_) {
      return false;
    } finally {
      _cancelling = false;
    }
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
    // Cartão aprovado com o checkout ainda na frente: fecha para o atleta ver
    // a confirmação.
    if (_card != null) {
      unawaited(ref.read(paymentServiceProvider).closeHostedCheckout());
    }
    _goSuccess();
  }

  void _goSuccess() {
    final confirm = widget.args.confirmArgs;
    final timeRange = '${confirm.startTime} – ${confirm.endTime}';
    final dateLabel = _dateFmt.format(confirm.date);
    final paid = _pix?.amountToPayNowReais ?? _card?.amountReais ?? _payNowReais;
    final due = _dueOnsiteReais;
    final isCard = _card != null;
    final amountLabel = due > 0.02
        ? '${isCard ? 'Cartão' : 'PIX'}: ${formatBRL(paid)} · Restante no local: ${formatBRL(due)}'
        : 'Total pago: ${formatBRL(paid)}${isCard ? ' no cartão' : ''}';
    // Id do pagamento = id do lote de cashback: a confirmação ouve o lote.
    final paymentId = _pix?.paymentId ?? _card?.paymentId ?? '';

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
        if (paymentId.isNotEmpty) 'paymentId': paymentId,
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
        paymentId: paymentId.isEmpty ? null : paymentId,
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

    // Crédito de chuva (na criação ou no doc, ao retomar): o servidor cobra o
    // resto integral e ignora o pedido de 50% — a tela nem oferece o sinal.
    final docCredit = ref
        .watch(arenaBookingDocProvider(widget.args.bookingId))
        .valueOrNull
        ?.data()?['weatherCreditReais'];
    final weatherCreditReais = widget.args.weatherCreditAppliedReais > 0
        ? widget.args.weatherCreditAppliedReais
        : (docCredit is num && docCredit > 0 ? docCredit.toDouble() : 0.0);
    final allowDeposit = weatherCreditReais <= 0;
    if (!allowDeposit) _paymentFraction = 1.0;

    final expiresAt = _pix?.expiresAt ?? _card?.expiresAt ?? widget.args.paymentExpiresAt;
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
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
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
                          SizedBox(height: 20),
                          BookingPixAmountSection(
                            totalReais: _totalReais,
                            selectedFraction: _paymentFraction,
                            enabled: !_loadingCharge,
                            allowDeposit: allowDeposit,
                            weatherCreditReais: weatherCreditReais,
                            onFractionChanged: (f) {
                              if (_liveMethod != null) return;
                              if (!allowDeposit && f != 1.0) return;
                              setState(() => _paymentFraction = f);
                            },
                          ),
                          SizedBox(height: 20),
                          SquadCodeField(
                            controller: _squadCodeController,
                            purpose: 'booking',
                            arenaId: widget.arenaId,
                            enabled: !_loadingCharge,
                            onChanged: (check) =>
                                setState(() => _squad = check),
                          ),
                          if (_squadDiscountCents > 0) ...[
                            const SizedBox(height: 4),
                            SquadCheckoutSummary(
                              priceLabel: _paymentFraction == 0.5
                                  ? 'Sinal (50%)'
                                  : 'Reserva',
                              priceCents: reaisToCents(_payNowReais),
                              discountCents: _squadDiscountCents,
                              discountLabel: _squadPreview.origin == 'code'
                                  ? 'Código ${_squadPreview.code}'
                                  : 'Indicação',
                              cashbackCents: cashbackQuote.appliedPreviewCents,
                              totalCents: cashbackQuote.chargePreviewCents,
                            ),
                          ],
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
                            helperText: _method == RegistrationPaymentMethod.card
                                ? 'Exigido pelo emissor da cobrança no cartão.'
                                : 'Necessário pela legislação brasileira para '
                                    'emissão do PIX.',
                          ),
                          SizedBox(height: 12),
                          BookingPixSaveCpfTile(
                            value: _saveCpf,
                            onChanged: (v) => setState(() => _saveCpf = v),
                          ),
                          if (_chargeError != null) ...[
                            SizedBox(height: 16),
                            _PixErrorCard(
                              message: _chargeError!,
                              onRetry: _loadCharge,
                            ),
                          ],
                        ] else ...[
                          if (expiresAt != null) ...[
                            BookingPixExpiryCard(
                              expiresAt: expiresAt,
                              // A cobrança vale `chargedReais` (preço − saldo).
                              amountReais: _pix?.chargedReais ??
                                  _card?.chargedReais ??
                                  _payNowReais,
                            ),
                            SizedBox(height: 20),
                          ],
                          if (liveSquadDiscountReais > 0) ...[
                            SquadDiscountAppliedNote(
                              discountCents: reaisToCents(
                                liveSquadDiscountReais,
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
                              onPressed: _cancelling ? null : _switchToPix,
                              child: Text('Pagar com PIX'),
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
                              child: Text('Desistir do pagamento'),
                            ),
                          ],
                          if (liveMethod == RegistrationPaymentMethod.card)
                            TextButton(
                              onPressed: _cancelling
                                  ? null
                                  : () => unawaited(_handlePaymentNotCompleted()),
                              child: Text('Desistir do pagamento'),
                            ),
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
