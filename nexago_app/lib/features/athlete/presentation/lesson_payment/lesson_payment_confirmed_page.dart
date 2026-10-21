import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/notifications/notification_navigation.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/lesson_payment/lesson_payment.dart';
import '../../domain/lesson_payment/lesson_payment_providers.dart';
import 'lesson_payment_widgets.dart';

/// B17 · "Pagamento confirmado" da cobrança do professor independente. Abre
/// quando a Agenda vê a baixa na volta do Asaas e pelo push
/// `professor_charge_paid`. Se o webhook ainda não chegou, espera ao vivo.
class LessonPaymentConfirmedPage extends ConsumerWidget {
  const LessonPaymentConfirmedPage({super.key, required this.chargeId});

  final String chargeId;

  void _goToAgenda(BuildContext context) =>
      context.go(athleteAgendaTabLocation);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(lessonPaymentProvider(chargeId));
    final payment = async.valueOrNull;

    Widget body;
    if (async.isLoading && payment == null) {
      body = const LessonPaymentStatusView(
        title: 'Carregando pagamento',
        message: 'Só um instante.',
        loading: true,
      );
    } else if (payment == null) {
      body = LessonPaymentStatusView(
        icon: Icons.receipt_long_outlined,
        title: 'Pagamento não encontrado',
        message: 'Confira suas cobranças na Agenda.',
        actionLabel: 'Ir para a Agenda',
        onAction: () => _goToAgenda(context),
      );
    } else if (payment.isPaid) {
      body = _ConfirmedContent(payment: payment, chargeId: chargeId);
    } else if (payment.status == 'open' || payment.status == 'creating') {
      body = LessonPaymentStatusView(
        title: 'Confirmando pagamento',
        message: 'Assim que o banco confirmar, esta tela atualiza sozinha. '
            'Pix costuma levar segundos.',
        loading: true,
        actionLabel: 'Voltar para a Agenda',
        onAction: () => _goToAgenda(context),
      );
    } else {
      body = LessonPaymentStatusView(
        icon: Icons.info_outline_rounded,
        title: payment.status == 'refunded'
            ? 'Pagamento estornado'
            : 'Cobrança cancelada',
        message: 'Essa cobrança não está mais ativa. Fale com o professor '
            'se tiver dúvida.',
        actionLabel: 'Ir para a Agenda',
        onAction: () => _goToAgenda(context),
      );
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(child: body),
    );
  }
}

class _ConfirmedContent extends ConsumerWidget {
  const _ConfirmedContent({required this.payment, required this.chargeId});

  final LessonPayment payment;
  final String chargeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final recurrence =
        ref.watch(lessonPaymentRecurrenceProvider(chargeId)).valueOrNull;
    final nextLesson =
        ref.watch(lessonPaymentNextLessonProvider(chargeId)).valueOrNull;
    final nextCharge = lessonPaymentNextChargeLabel(payment, recurrence);
    final mute = LessonPaymentStyle.mute(colors);
    final bodyStyle = AppTypography.soraRegular(
      fontSize: 14,
      height: 1.5,
      color: mute,
    );
    final strong = bodyStyle.copyWith(
      color: colors.onSurface,
      fontWeight: FontWeight.w700,
    );

    final rows = <({String label, String? hint, String value})>[
      (
        label: 'Pago com',
        hint: lessonPaymentMethodHint(payment),
        value: lessonPaymentMethodLabel(payment),
      ),
      (
        label: 'Data',
        hint: null,
        value: lessonPaymentShortDate(payment.paidAt)
      ),
      if (nextCharge != null)
        (label: 'Próxima cobrança', hint: 'Renova todo mês', value: nextCharge),
      if (payment.paymentId != null)
        (
          label: 'ID da transação',
          hint: null,
          value: lessonPaymentShortId(payment.paymentId),
        ),
    ];

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 48, 20, 24),
            child: Column(
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.win.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: AppColors.win.withValues(alpha: 0.30),
                    ),
                  ),
                  child: Icon(Icons.check_rounded, size: 36, color: colors.win),
                ),
                const SizedBox(height: 20),
                Text(
                  'Pagamento confirmado',
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.48,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text.rich(
                  TextSpan(
                    style: bodyStyle,
                    children: [
                      TextSpan(
                        text: lessonPaymentAmount(payment.amountReais),
                        style: strong,
                      ),
                      const TextSpan(text: ' pagos para '),
                      TextSpan(text: payment.professorName, style: strong),
                      const TextSpan(text: '.\nSuas aulas estão garantidas.'),
                    ],
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 26),
                LessonPaymentCard(
                  raised: true,
                  child: Column(
                    children: [
                      _PlanHeader(payment: payment),
                      if (nextLesson != null) ...[
                        Divider(
                          height: 1,
                          thickness: 1,
                          color: LessonPaymentStyle.line(colors),
                        ),
                        _NextLessonRow(
                          label: lessonPaymentLessonLabel(nextLesson),
                          onAgenda: () => context.go(athleteAgendaTabLocation),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                LessonPaymentCard(
                  child: Column(
                    children: [
                      for (var i = 0; i < rows.length; i++)
                        LessonPaymentDetailRow(
                          label: rows[i].label,
                          hint: rows[i].hint,
                          value: rows[i].value,
                          divider: i < rows.length - 1,
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(
            children: [
              SizedBox(
                width: double.infinity,
                child: LessonPaymentPrimaryButton(
                  label: 'Ver minhas aulas',
                  onTap: () => context.go(athleteAgendaTabLocation),
                ),
              ),
              const SizedBox(height: 6),
              TextButton(
                onPressed: () => context.push(
                  AppRoutes.lessonPaymentReceipt
                      .replaceAll(':chargeId', Uri.encodeComponent(chargeId)),
                ),
                child: Text(
                  'Ver comprovante',
                  style: LessonPaymentStyle.sora(
                    13,
                    color: colors.brandText,
                    weight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PlanHeader extends StatelessWidget {
  const _PlanHeader({required this.payment});

  final LessonPayment payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: LessonPaymentStyle.blue.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(11),
              border: Border.all(
                color: LessonPaymentStyle.blue.withValues(alpha: 0.25),
              ),
            ),
            child: const Icon(
              Icons.school_outlined,
              size: 20,
              color: LessonPaymentStyle.blue,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  lessonPaymentTitle(payment),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: LessonPaymentStyle.sora(14, color: colors.onSurface),
                ),
                const SizedBox(height: 3),
                Text(
                  'Prof. ${payment.professorName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 11.5,
                    color: LessonPaymentStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NextLessonRow extends StatelessWidget {
  const _NextLessonRow({required this.label, required this.onAgenda});

  final String label;
  final VoidCallback onAgenda;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Row(
        children: [
          Icon(
            Icons.calendar_today_outlined,
            size: 17,
            color: LessonPaymentStyle.mute(colors),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PRÓXIMA AULA',
                  style: LessonPaymentStyle.mono(
                    10,
                    color: LessonPaymentStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: LessonPaymentStyle.sora(
                    13.5,
                    color: colors.onSurface,
                    weight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onAgenda,
            child: Text(
              'Agenda',
              style: LessonPaymentStyle.sora(
                12.5,
                color: colors.brandText,
                weight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
