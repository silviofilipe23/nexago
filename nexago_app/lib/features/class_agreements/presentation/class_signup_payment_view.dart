import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart' show showAppSnackBar;
import '../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_waiting_card.dart';
import '../../schedule_plans/presentation/widgets/schedule_plan_ui.dart';
import '../../tournaments/presentation/widgets/tournament_registration/registration_card_checkout_panel.dart';
import '../application/class_agreements_providers.dart';
import '../domain/class_agreements.dart';

/// 06a · Pagar para confirmar a matrícula (como nos Planos de horário): a
/// vaga fica segurada até [pending.until]; Pix com QR no app ou cartão no
/// checkout do Asaas. Consulta o servidor a cada poucos segundos: a fatura
/// leva um instante para nascer e a baixa chega pelo webhook.
class ClassSignupPaymentView extends ConsumerStatefulWidget {
  const ClassSignupPaymentView({
    super.key,
    required this.pending,
    required this.methods,
    required this.onPaid,
    required this.onExpired,
    this.pollEvery = const Duration(seconds: 4),
    this.kind = 'signup',
  });

  /// `signup` (1ª cobrança, vaga segurada) ou `penalty` (multa do cancelamento).
  final String kind;

  final ClassPendingPayment pending;

  /// Formas online que o plano aceita (`pix`, `card`).
  final List<String> methods;
  final VoidCallback onPaid;
  final VoidCallback onExpired;
  final Duration pollEvery;

  @override
  ConsumerState<ClassSignupPaymentView> createState() =>
      _ClassSignupPaymentViewState();
}

class _ClassSignupPaymentViewState extends ConsumerState<ClassSignupPaymentView> {
  late String _method = widget.pending.paymentForm;
  ClassEnrollmentPayment? _payment;
  Timer? _poll;
  Timer? _clock;
  DateTime _now = DateTime.now();
  bool _loading = false;
  bool _finished = false;

  List<String> get _online => widget.methods.where((m) => m != 'onsite').toList();

  @override
  void initState() {
    super.initState();
    _refresh();
    _poll = Timer.periodic(widget.pollEvery, (_) => _refresh());
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_loading || _finished) return;
    _loading = true;
    try {
      final p = await ref.read(classAgreementsRepositoryProvider).enrollmentPayment(
            enrollmentId: widget.pending.enrollmentId,
            method: _method,
            kind: widget.kind,
          );
      if (!mounted) return;
      setState(() => _payment = p);
      if (p.isPaid) {
        _finish();
        widget.onPaid();
      } else if (p.isOver) {
        _finish();
        widget.onExpired();
      }
    } catch (_) {
      // Rede instável: tenta de novo no próximo ciclo.
    } finally {
      _loading = false;
    }
  }

  void _finish() {
    _finished = true;
    _poll?.cancel();
    _clock?.cancel();
  }

  void _switch(String method) {
    if (method == _method) return;
    setState(() {
      _method = method;
      _payment = null;
    });
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = _payment;
    final until = p?.until ?? widget.pending.until;
    final amount = (p?.amountReais ?? 0) > 0 ? p!.amountReais : widget.pending.amountReais;
    final ready = p != null && p.state == 'ready';
    return ListView(
      key: const Key('class-signup-payment'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        if (widget.kind == 'penalty')
          const ScheduleBanner(
            icon: Icons.event_available_rounded,
            tone: AppColors.win,
            title: 'Cancelamento registrado',
            message: 'Pague a multa por Pix ou cartão. Dá para pagar depois em Cobranças.',
          )
        else
          const ScheduleBanner(
            icon: Icons.verified_rounded,
            tone: AppColors.win,
            title: 'Contrato assinado',
            message: 'Pague a 1ª cobrança para confirmar a matrícula.',
          ),
        const SizedBox(height: 12),
        if (until != null && widget.kind != 'penalty')
          Container(
            key: const Key('class-signup-pay-timer'),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.pending.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
            ),
            child: Row(
              children: [
                Icon(Icons.timer_outlined, size: 18, color: colors.pending),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Sua vaga fica segurada por',
                    style: AppTypography.bodyS.copyWith(color: colors.onSurface),
                  ),
                ),
                Text(
                  countdownLabel(until, _now),
                  style: AppTypography.mono(fontSize: 15, fontWeight: FontWeight.w700, color: colors.pending),
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        ScheduleCard(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ScheduleKicker(widget.kind == 'penalty' ? 'Multa' : '1ª cobrança'),
                    if ((p?.description ?? '').isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        p!.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                      ),
                    ],
                  ],
                ),
              ),
              Text(
                formatBRL(amount),
                key: const Key('class-signup-pay-amount'),
                style: AppTypography.mono(fontSize: 21, fontWeight: FontWeight.w700, color: colors.onSurface),
              ),
            ],
          ),
        ),
        if (_online.length > 1) ...[
          const SizedBox(height: 14),
          Row(
            children: [
              for (final m in _online) ...[
                if (m != _online.first) const SizedBox(width: 8),
                Expanded(
                  child: ScheduleChoiceChip(
                    key: Key('class-signup-pay-$m'),
                    label: paymentFormLabel(m),
                    selected: m == _method,
                    onTap: () => _switch(m),
                  ),
                ),
              ],
            ],
          ),
        ],
        const SizedBox(height: 16),
        if (!ready)
          Padding(
            key: const Key('class-signup-pay-preparing'),
            padding: const EdgeInsets.symmetric(vertical: 28),
            child: Column(
              children: [
                const CircularProgressIndicator(color: AppColors.brand, strokeWidth: 2),
                const SizedBox(height: 12),
                Text(
                  'Gerando a cobrança…',
                  style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                ),
              ],
            ),
          )
        else if (_method == 'pix' && p.pixCode != null) ...[
          BookingPixQrCard(base64: p.pixImageBase64 ?? '', payload: p.pixCode!),
          const SizedBox(height: 16),
          BookingPixCopyButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: p.pixCode!));
              if (!context.mounted) return;
              showAppSnackBar(context, 'Código Pix copiado.');
            },
          ),
          const SizedBox(height: 16),
          const BookingPixWaitingCard(),
        ] else if (p.invoiceUrl != null)
          RegistrationCardCheckoutPanel(
            amountReais: amount,
            onOpen: () => openExternalUrl(p.invoiceUrl!),
          ),
        const SizedBox(height: 14),
        Text(
          widget.kind == 'penalty'
              ? 'Assim que o pagamento cair, a multa aparece como paga.'
              : 'Assim que o pagamento cair, a matrícula é confirmada aqui mesmo. '
                  'Depois, as mensalidades saem sozinhas todo mês.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.45),
        ),
      ],
    );
  }
}
