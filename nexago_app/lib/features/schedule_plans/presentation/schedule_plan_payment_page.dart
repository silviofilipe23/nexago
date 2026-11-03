import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../arenas/data/payment_service.dart';
import '../../arenas/domain/payment_providers.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_app_bar.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_cpf_field.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_expiry_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_generate_bar.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_waiting_card.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../tournaments/domain/registration_payment_method.dart';
import '../../tournaments/presentation/widgets/tournament_registration/registration_card_checkout_panel.dart';
import '../../tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';
import '../application/schedule_plans_providers.dart';
import '../domain/schedule_plan_logic.dart';
import '../domain/schedule_plan_models.dart';
import 'widgets/schedule_plan_sheets.dart';

/// Pagamento de uma mensalidade do plano de horário: Pix (QR no app) ou
/// cartão (checkout do Asaas dentro do app). Os dois usam a mesma cobrança;
/// a baixa chega pelo webhook e a tela vê pelo doc da mensalidade.
class SchedulePlanPaymentPage extends ConsumerStatefulWidget {
  const SchedulePlanPaymentPage({
    super.key,
    required this.chargeId,
    this.openCheckout,
    this.closeCheckout,
  });

  final String chargeId;

  /// Abre o checkout do cartão; injetável para teste.
  final Future<void> Function(String url)? openCheckout;

  /// Fecha o checkout quando a baixa chega; injetável para teste.
  final Future<void> Function()? closeCheckout;

  @override
  ConsumerState<SchedulePlanPaymentPage> createState() =>
      _SchedulePlanPaymentPageState();
}

class _SchedulePlanPaymentPageState
    extends ConsumerState<SchedulePlanPaymentPage> {
  RegistrationPaymentMethod _method = RegistrationPaymentMethod.pix;
  late final TextEditingController _cpf;
  String? _cpfError;
  bool _loading = false;
  String? _error;

  /// Cobrança aberta na tela e o meio dela.
  ScheduleCheckout? _checkout;
  RegistrationPaymentMethod? _live;

  @override
  void initState() {
    super.initState();
    String? profileCpf;
    try {
      profileCpf = ref.read(athleteProfileProvider).valueOrNull?.cpfCnpj;
    } catch (_) {}
    _cpf = TextEditingController(
      text: profileCpf != null && CpfCnpjValidator.isValid(profileCpf)
          ? CpfCnpjValidator.formatDisplay(profileCpf)
          : '',
    )..addListener(_onCpfChanged);
  }

  /// O botão acende quando o CPF fica válido.
  void _onCpfChanged() {
    if (mounted) setState(() => _cpfError = null);
  }

  @override
  void dispose() {
    _cpf.dispose();
    super.dispose();
  }

  bool get _hasValidCpf => CpfCnpjValidator.isValid(_cpf.text);

  Future<void> _generate(ScheduleCharge charge) async {
    if (_loading) return;
    if (!_hasValidCpf) {
      setState(() => _cpfError =
          CpfCnpjValidator.validationMessage(_cpf.text) ??
              'Informe um CPF válido.');
      return;
    }
    final method = _method;
    setState(() {
      _loading = true;
      _error = null;
      _cpfError = null;
    });
    try {
      final checkout = await ref
          .read(schedulePlansRepositoryProvider)
          .chargeCheckout(
            chargeId: charge.id,
            method: method == RegistrationPaymentMethod.pix ? 'pix' : 'card',
            cpfCnpj: CpfCnpjValidator.digitsOnly(_cpf.text),
          );
      if (!mounted) return;
      setState(() {
        _checkout = checkout;
        _live = method;
        _loading = false;
      });
      if (method == RegistrationPaymentMethod.card) await _openCard();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = friendlyErrorMessage(
          e,
          action: method == RegistrationPaymentMethod.pix
              ? 'Não foi possível gerar o Pix'
              : 'Não foi possível abrir o pagamento',
          logReason: 'schedule_plan_checkout',
        );
      });
    }
  }

  Future<void> _openCard() async {
    final url = _checkout?.invoiceUrl ?? '';
    if (url.isEmpty) return;
    try {
      final open = widget.openCheckout ??
          ref.read(paymentServiceProvider).openHostedCheckout;
      await open(url);
    } on PaymentException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o pagamento. Tente de novo.',
          isError: true,
        );
      }
    }
  }

  /// Volta para a escolha (a cobrança é a mesma; nada a cancelar).
  void _changeMethod() => setState(() {
        _checkout = null;
        _live = null;
        _error = null;
      });

  void _goToMyPlan() => context.go(AppRoutes.mySchedulePlans);

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<ScheduleCharge?>>(
      scheduleChargeProvider(widget.chargeId),
      (previous, next) {
        final was = previous?.valueOrNull?.isPaid ?? false;
        if (!was && (next.valueOrNull?.isPaid ?? false) && _live != null) {
          // Cartão aprovado com o checkout na frente: fecha para ver a baixa.
          final close = widget.closeCheckout ??
              ref.read(paymentServiceProvider).closeHostedCheckout;
          close();
        }
      },
    );
    final chargeAsync = ref.watch(scheduleChargeProvider(widget.chargeId));
    final charge = chargeAsync.valueOrNull;

    if (charge != null && charge.isPaid) {
      return FeedbackPage.success(
        key: const Key('schedule-payment-paid'),
        title: 'Pagamento confirmado',
        description:
            '${_chargeLabel(charge)} do ${charge.planName.isEmpty ? 'plano' : charge.planName} '
            'está paga e o horário é seu. Bom jogo!',
        primaryAction:
            FeedbackAction(label: 'Ver meu plano', onPressed: _goToMyPlan),
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingPixAppBar(
        onBack: () => context.canPop() ? context.pop() : _goToMyPlan(),
        title: registrationChargePageTitle(_live),
      ),
      body: switch (chargeAsync) {
        AsyncLoading() when charge == null =>
          const Center(child: CircularProgressIndicator()),
        _ when charge == null => _Message(
            text: 'Não encontramos esta mensalidade.',
            onMyPlan: _goToMyPlan,
          ),
        _ when !charge.isOpen => _Message(
            key: const Key('schedule-payment-closed'),
            text: charge.cancelReason == 'payment_expired'
                ? 'O prazo de 30 minutos para pagar acabou e o horário foi '
                    'liberado. Assine de novo se ainda quiser o plano.'
                : 'Esta mensalidade foi cancelada e não precisa ser paga.',
            onMyPlan: _goToMyPlan,
          ),
        _ => _openBody(charge),
      },
    );
  }

  /// Assinatura aguardando pagamento: desiste e libera o horário na hora.
  Future<void> _giveUp(ScheduleCharge charge) async {
    final ok = await confirmScheduleAction(
      context,
      title: 'Desistir da assinatura?',
      message: 'O horário reservado volta a ficar livre na arena agora.',
      confirmLabel: 'Desistir',
    );
    if (ok != true || !mounted) return;
    try {
      await ref
          .read(schedulePlansRepositoryProvider)
          .cancelMine(charge.subscriptionId);
      if (!mounted) return;
      showAppSnackBar(context, 'Assinatura desfeita. O horário foi liberado.');
      _goToMyPlan();
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível desistir',
          logReason: 'schedule_plan_give_up',
        ),
        isError: true,
      );
    }
  }

  Widget _openBody(ScheduleCharge charge) {
    final checkout = _checkout;
    final live = _live;
    final amount = checkout?.amountReais ?? charge.amountReais;
    final sub = charge.subscriptionId.isEmpty
        ? null
        : ref
            .watch(scheduleSubscriptionDocProvider(charge.subscriptionId))
            .valueOrNull;
    final pending = sub?.status == ScheduleSubscriptionStatus.pendingPayment;
    final deadline = pending ? sub?.pendingPaymentUntil : null;
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (deadline != null) ...[
                  BookingPixExpiryCard(
                    key: const Key('schedule-payment-deadline'),
                    expiresAt: deadline,
                    amountReais: amount,
                    statusLabel: 'horário reservado',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Pague até ${scheduleClock(deadline)} para confirmar o '
                    'plano. Sem pagamento, o horário é liberado.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                _ChargeSummary(charge: charge, label: _chargeLabel(charge)),
                const SizedBox(height: 20),
                if (checkout == null || live == null) ...[
                  RegistrationPaymentMethodPicker(
                    value: _method,
                    amountReais: amount,
                    enabled: !_loading,
                    onChanged: (m) => setState(() {
                      _method = m;
                      _error = null;
                    }),
                  ),
                  const SizedBox(height: 20),
                  BookingPixCpfField(
                    controller: _cpf,
                    errorText: _cpfError,
                    onSubmitted: _hasValidCpf ? () => _generate(charge) : null,
                    helperText: _method == RegistrationPaymentMethod.card
                        ? 'Exigido pelo emissor da cobrança no cartão.'
                        : 'Necessário pela legislação brasileira para '
                            'emissão do PIX.',
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      key: const Key('schedule-payment-error'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ] else if (live == RegistrationPaymentMethod.pix) ...[
                  BookingPixQrCard(
                    base64: checkout.qrCodeBase64 ?? '',
                    payload: checkout.qrCode ?? '',
                  ),
                  const SizedBox(height: 16),
                  BookingPixCopyButton(
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(text: checkout.qrCode ?? ''),
                      );
                      if (!mounted) return;
                      showAppSnackBar(context, 'Código PIX copiado.');
                    },
                  ),
                  const SizedBox(height: 16),
                  const BookingPixWaitingCard(),
                  const SizedBox(height: 12),
                  TextButton(
                    key: const Key('schedule-payment-change'),
                    onPressed: _changeMethod,
                    child: const Text('Pagar com cartão'),
                  ),
                ] else ...[
                  RegistrationCardCheckoutPanel(
                    amountReais: amount,
                    onOpen: _openCard,
                  ),
                  const SizedBox(height: 16),
                  const BookingPixWaitingCard(),
                  const SizedBox(height: 12),
                  TextButton(
                    key: const Key('schedule-payment-change'),
                    onPressed: _changeMethod,
                    child: const Text('Pagar com PIX'),
                  ),
                ],
                if (pending)
                  TextButton(
                    key: const Key('schedule-payment-give-up'),
                    onPressed: () => _giveUp(charge),
                    child: const Text('Desistir da assinatura'),
                  )
                else
                  TextButton(
                    onPressed: _goToMyPlan,
                    child: const Text('Pagar depois'),
                  ),
              ],
            ),
          ),
        ),
        if (checkout == null || live == null)
          BookingPixGenerateBar(
            enabled: _hasValidCpf,
            loading: _loading,
            onPressed: () => _generate(charge),
            label: registrationChargeButtonLabel(_method, chargeReais: amount),
          ),
      ],
    );
  }

  /// "Mensalidade de novembro" (pelo `period` AAAA-MM).
  static String _chargeLabel(ScheduleCharge charge) {
    final month = int.tryParse(charge.period.split('-').last);
    return month == null || month < 1 || month > 12
        ? 'Mensalidade'
        : 'Mensalidade de ${scheduleMonthLong(month).toLowerCase()}';
  }
}

class _ChargeSummary extends StatelessWidget {
  const _ChargeSummary({required this.charge, required this.label});

  final ScheduleCharge charge;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final due = charge.dueDate;
    return Container(
      key: const Key('schedule-payment-summary'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outline),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  charge.planName.isEmpty
                      ? 'Plano de horário'
                      : charge.planName,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  due == null
                      ? label
                      : '$label · vence ${scheduleDayMonth(due)}',
                  style:
                      TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
          Text(
            formatBRL(charge.amountReais),
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 17,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({super.key, required this.text, required this.onMyPlan});

  final String text;
  final VoidCallback onMyPlan;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.themeColors.onSurfaceMuted),
            ),
            const SizedBox(height: 12),
            TextButton(onPressed: onMyPlan, child: const Text('Ver meu plano')),
          ],
        ),
      ),
    );
  }
}
