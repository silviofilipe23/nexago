import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/links/open_external_url.dart';
import '../../../../core/notifications/notification_navigation.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../domain/lesson_payment/lesson_payment.dart';
import '../../domain/lesson_payment/lesson_payment_providers.dart';
import 'lesson_payment_widgets.dart';

/// B19 · comprovante do pagamento ao professor independente. "Baixar PDF"
/// abre o comprovante oficial do Asaas (`receipt.receiptUrl`); sem ele, só
/// "Compartilhar" (texto com os dados do pagamento).
class LessonPaymentReceiptPage extends ConsumerWidget {
  const LessonPaymentReceiptPage({super.key, required this.chargeId});

  final String chargeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(lessonPaymentProvider(chargeId));
    final payment = async.valueOrNull;

    Widget body;
    if (async.isLoading && payment == null) {
      body = const LessonPaymentStatusView(
        title: 'Carregando comprovante',
        message: 'Só um instante.',
        loading: true,
      );
    } else if (payment == null || !payment.isPaid) {
      body = LessonPaymentStatusView(
        icon: Icons.receipt_long_outlined,
        title: 'Comprovante indisponível',
        message: payment == null
            ? 'Não encontramos esse pagamento.'
            : 'O comprovante sai assim que o pagamento for confirmado.',
      );
    } else {
      body = _ReceiptContent(payment: payment);
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
              child: Row(
                children: [
                  _BackButton(
                    onTap: () => popOrGo(context, athleteAgendaTabLocation),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Comprovante',
                    style: AppTypography.soraRegular(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                      color: colors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class _ReceiptContent extends StatelessWidget {
  const _ReceiptContent({required this.payment});

  final LessonPayment payment;

  Future<void> _copy(BuildContext context, String value, String what) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (context.mounted) showAppSnackBar(context, '$what copiado.');
  }

  Future<void> _openPdf(BuildContext context, String url) async {
    final opened = await openExternalUrl(url);
    if (opened || !context.mounted) return;
    showAppSnackBar(
      context,
      'Não foi possível abrir o comprovante.',
      isError: true,
    );
  }

  Future<void> _share(BuildContext context) => Share.share(
        lessonPaymentShareText(payment),
        subject: 'Comprovante de pagamento',
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final receiptUrl = payment.receiptUrl;
    final paymentId = lessonPaymentFullId(payment.paymentId);
    final invoice = payment.invoiceNumber;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              children: [
                LessonPaymentCard(
                  radius: 18,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _AmountHeader(payment: payment),
                      const _DashedLine(),
                      _Section(
                        label: 'PAGAMENTO',
                        rows: [
                          LessonPaymentDetailRow(
                            label: 'Plano',
                            value: payment.description,
                            valueHint: payment.recurring
                                ? 'Mensal · recorrente'
                                : _referenceHint(payment),
                            divider: false,
                            padding: _rowPadding,
                          ),
                          LessonPaymentDetailRow(
                            label: 'Forma',
                            value: lessonPaymentMethodLabel(payment),
                            valueHint: lessonPaymentMethodHint(payment),
                            divider: false,
                            padding: _rowPadding,
                          ),
                        ],
                      ),
                      const _DashedLine(),
                      _Section(
                        label: 'DE · PARA',
                        rows: [
                          LessonPaymentDetailRow(
                            label: 'Pagador',
                            value: payment.studentName,
                            divider: false,
                            padding: _rowPadding,
                          ),
                          LessonPaymentDetailRow(
                            label: 'Recebedor',
                            value: payment.professorName,
                            valueHint: 'Professor independente',
                            divider: false,
                            padding: _rowPadding,
                          ),
                        ],
                      ),
                      if (paymentId.isNotEmpty || invoice != null) ...[
                        const _DashedLine(),
                        _Section(
                          label: 'IDENTIFICAÇÃO',
                          rows: [
                            if (paymentId.isNotEmpty)
                              LessonPaymentDetailRow(
                                label: 'ID da transação',
                                value: paymentId,
                                trailing: _CopyButton(
                                  onTap: () => _copy(
                                    context,
                                    paymentId,
                                    'ID da transação',
                                  ),
                                ),
                                divider: false,
                                padding: _rowPadding,
                              ),
                            if (invoice != null)
                              LessonPaymentDetailRow(
                                label: 'Fatura',
                                value: invoice,
                                trailing: _CopyButton(
                                  onTap: () =>
                                      _copy(context, invoice, 'Nº da fatura'),
                                ),
                                divider: false,
                                padding: _rowPadding,
                              ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 6),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'Dúvidas sobre este pagamento? ',
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        color: LessonPaymentStyle.mute(colors),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => context.push(AppRoutes.athleteMessages),
                      child: Text(
                        'Fale com o professor',
                        style: LessonPaymentStyle.sora(
                          12,
                          color: colors.brandText,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Row(
            children: [
              if (receiptUrl != null) ...[
                Expanded(
                  child: LessonPaymentOutlineButton(
                    label: 'Baixar PDF',
                    icon: Icons.download_rounded,
                    onTap: () => _openPdf(context, receiptUrl),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: LessonPaymentPrimaryButton(
                  label: 'Compartilhar',
                  icon: Icons.ios_share_rounded,
                  onTap: () => _share(context),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

const _rowPadding = EdgeInsets.symmetric(vertical: 7);

/// "Referente a novembro" quando não é recorrente.
String? _referenceHint(LessonPayment p) {
  final title = lessonPaymentTitle(p);
  if (title == p.description) return null;
  return 'Referente a ${title.split(' · ').last}';
}

class _AmountHeader extends StatelessWidget {
  const _AmountHeader({required this.payment});

  final LessonPayment payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'NexaGO',
                style: LessonPaymentStyle.sora(
                  14,
                  color: colors.brandText,
                  weight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.win.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.win.withValues(alpha: 0.35),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check_rounded, size: 13, color: colors.win),
                    const SizedBox(width: 4),
                    Text(
                      'Pago',
                      style: LessonPaymentStyle.sora(
                        11.5,
                        color: colors.win,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'VALOR PAGO',
            style: LessonPaymentStyle.mono(
              10,
              color: LessonPaymentStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            lessonPaymentAmount(payment.amountReais),
            style: AppTypography.soraRegular(
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.9,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            lessonPaymentLongDate(payment.paidAt),
            style: AppTypography.soraRegular(
              fontSize: 12.5,
              color: LessonPaymentStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.label, required this.rows});

  final String label;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: LessonPaymentStyle.mono(
              9.5,
              color: LessonPaymentStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 6),
          ...rows,
        ],
      ),
    );
  }
}

/// Picote do recibo.
class _DashedLine extends StatelessWidget {
  const _DashedLine();

  @override
  Widget build(BuildContext context) {
    final color = context.themeColors.onSurface.withValues(alpha: 0.14);
    return LayoutBuilder(
      builder: (context, constraints) {
        const dash = 4.0;
        const gap = 4.0;
        final count = (constraints.maxWidth / (dash + gap)).floor();
        return Row(
          children: [
            for (var i = 0; i < count; i++)
              Container(
                width: dash,
                height: 1,
                margin: const EdgeInsets.only(right: gap),
                color: color,
              ),
          ],
        );
      },
    );
  }
}

class _CopyButton extends StatelessWidget {
  const _CopyButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Copiar',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.all(2),
          child: Icon(
            Icons.copy_rounded,
            size: 14,
            color: context.themeColors.brandText,
          ),
        ),
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: 'Voltar',
      child: Material(
        color: colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: LessonPaymentStyle.line(colors)),
        ),
        child: InkWell(
          customBorder: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          onTap: onTap,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(
              Icons.chevron_left_rounded,
              size: 24,
              color: colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}
