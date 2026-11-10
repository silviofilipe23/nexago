import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../payment_card/application/payment_card_providers.dart';
import '../../../payment_card/domain/saved_payment_card.dart';
import '../../application/schedule_plans_providers.dart';
import '../../domain/schedule_plan_logic.dart';
import '../../domain/schedule_plan_models.dart';
import 'schedule_autopay_consent_sheet.dart';
import 'schedule_plan_sheets.dart';
import 'schedule_plan_ui.dart';

/// "Débito automático" em Meu plano: liga (com autorização), troca o cartão
/// e desliga. Quem decide quando mostrar é a tela (flag, papel, forma).
class ScheduleAutopayCard extends ConsumerStatefulWidget {
  const ScheduleAutopayCard({
    super.key,
    required this.subscription,
    required this.uid,
  });

  final ScheduleSubscription subscription;
  final String uid;

  @override
  ConsumerState<ScheduleAutopayCard> createState() =>
      _ScheduleAutopayCardState();
}

class _ScheduleAutopayCardState extends ConsumerState<ScheduleAutopayCard> {
  bool _busy = false;

  ScheduleSubscription get _sub => widget.subscription;

  void _failure(Object e, String action, String reason) {
    if (!mounted) return;
    showAppSnackBar(
      context,
      friendlyErrorMessage(e, action: action, logReason: reason),
      isError: true,
    );
  }

  Future<void> _enable() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      var card = await ref.read(myPaymentCardProvider.future);
      if (card == null) {
        if (!mounted) return;
        card = await context.push<SavedPaymentCard>(AppRoutes.paymentCardNew);
        if (card == null || !mounted) return;
        ref.invalidate(myPaymentCardProvider);
      }
      final repo = ref.read(schedulePlansRepositoryProvider);
      final preview = await repo.autopayPreview(_sub.id);
      if (!mounted) return;
      final text = scheduleAutopayConsentText(
        planName: _sub.planName,
        arenaName: _sub.arenaName,
        cardLabel: card.label,
        preview: preview,
      );
      final ok = await showScheduleAutopayConsentSheet(
        context,
        consentText: text,
      );
      if (ok != true || !mounted) return;
      await repo.setAutopay(_sub.id, enabled: true, consentText: text);
      ref.invalidate(myScheduleSubscriptionsProvider);
      ref.invalidate(scheduleAutopayPreviewProvider(_sub.id));
      if (mounted) showAppSnackBar(context, 'Débito automático ligado.');
    } catch (e) {
      _failure(e, 'Não foi possível ligar o débito automático',
          'schedule_autopay_enable');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeCard() async {
    if (_busy) return;
    final card =
        await context.push<SavedPaymentCard>(AppRoutes.paymentCardNew);
    if (!mounted) return;
    ref.invalidate(myPaymentCardProvider);
    if (card != null) {
      ref.invalidate(myScheduleSubscriptionsProvider);
      ref.invalidate(scheduleAutopayPreviewProvider(_sub.id));
    }
  }

  Future<void> _disable() async {
    if (_busy) return;
    final ok = await confirmScheduleAction(
      context,
      title: 'Desligar o débito automático?',
      message: 'As próximas mensalidades voltam a ser pagas por Pix ou '
          'cartão, por você.',
      confirmLabel: 'Desligar',
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(schedulePlansRepositoryProvider)
          .setAutopay(_sub.id, enabled: false);
      ref.invalidate(myScheduleSubscriptionsProvider);
      if (mounted) showAppSnackBar(context, 'Débito automático desligado.');
    } catch (e) {
      _failure(e, 'Não foi possível desligar o débito automático',
          'schedule_autopay_disable');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final consent = _sub.autopayFor(widget.uid);
    final on = consent?.enabled == true;
    String subtitle = 'Pague todo mês sem abrir o app';
    if (on) {
      final card = SavedPaymentCard(
        brand: consent!.brand,
        last4: consent.last4,
        expiryMonth: 0,
        expiryYear: 0,
      );
      subtitle = card.label;
      final next =
          ref.watch(scheduleAutopayPreviewProvider(_sub.id)).valueOrNull?.next;
      if (next != null) {
        subtitle += ' · próxima: ${scheduleAutopayDayLabel(next.dueDate)}, '
            '${formatBRL(next.chargedReais)}';
      }
    }
    return ScheduleCard(
      key: const Key('schedule-autopay-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Débito automático',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: TextStyle(fontSize: 13.5, color: colors.onSurface),
          ),
          const SizedBox(height: 10),
          if (!on)
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                key: const Key('schedule-autopay-enable'),
                onPressed: _busy ? null : _enable,
                child: const Text('Ativar'),
              ),
            )
          else
            Wrap(
              alignment: WrapAlignment.end,
              children: [
                TextButton(
                  key: const Key('schedule-autopay-change-card'),
                  onPressed: _busy ? null : _changeCard,
                  child: const Text('Trocar cartão'),
                ),
                TextButton(
                  key: const Key('schedule-autopay-disable'),
                  onPressed: _busy ? null : _disable,
                  child: const Text('Desligar'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
