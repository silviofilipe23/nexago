import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_wallet.dart';
import '../../domain/professor_wallet_logic.dart';
import '../../infrastructure/professor_students_repository.dart';

/// Peças das telas da carteira do professor independente (protótipo
/// `pa-app-a/c.jsx`: B4, B14, B15, B16). Azul = independente.

/// Pílula pequena em caixa alta ("CARTEIRA", "CONVITE ENVIADO", "PAGO"…).
class ProfessorWalletTag extends StatelessWidget {
  const ProfessorWalletTag(this.label, {super.key, required this.color});

  /// Selo azul da carteira na lista de alunos.
  const ProfessorWalletTag.wallet({super.key})
      : label = 'CARTEIRA',
        color = ProfessorLinksStyle.blue;

  /// Convite pendente: o atleta ainda não aceitou.
  const ProfessorWalletTag.invited({super.key})
      : label = kProfessorInviteSentLabel,
        color = AppColors.pending;

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Center(
        widthFactor: 1,
        child: Text(
          label.toUpperCase(),
          maxLines: 1,
          style: ProfessorLinksStyle.mono(8.5, color: color)
              .copyWith(letterSpacing: 0.8),
        ),
      ),
    );
  }
}

Color professorChargeStandingColor(
  ProfessorChargeStanding s,
  AppThemeColors colors,
) =>
    switch (s) {
      ProfessorChargeStanding.paid => AppColors.win,
      ProfessorChargeStanding.open => AppColors.pending,
      ProfessorChargeStanding.overdue ||
      ProfessorChargeStanding.failed =>
        AppColors.live,
      ProfessorChargeStanding.creating => ProfessorLinksStyle.blue,
      ProfessorChargeStanding.canceled ||
      ProfessorChargeStanding.refunded =>
        ProfessorLinksStyle.dim(colors),
    };

class ProfessorChargePill extends StatelessWidget {
  const ProfessorChargePill(this.standing, {super.key});

  final ProfessorChargeStanding standing;

  @override
  Widget build(BuildContext context) => ProfessorWalletTag(
        standing.label,
        color: professorChargeStandingColor(standing, context.themeColors),
      );
}

/// Linha de cobrança: descrição + situação à esquerda, valor + pílula à
/// direita. [withStudent] troca a descrição pelo nome do aluno (B16).
class ProfessorChargeRow extends StatelessWidget {
  const ProfessorChargeRow({
    super.key,
    required this.charge,
    required this.todayKey,
    this.withStudent = false,
    this.onTap,
  });

  final ProfessorCharge charge;
  final String todayKey;
  final bool withStudent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = charge;
    final title = withStudent ? c.studentName : c.description;
    final sub = [
      if (withStudent) c.description,
      professorChargeSubtitle(c, todayKey),
    ].join(' · ');
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.mono(
                      10,
                      weight: FontWeight.w500,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatBRL(c.amountReais),
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                ProfessorChargePill(professorChargeStanding(c, todayKey)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Aviso de conta ainda não aprovada (cobrar exige `approved`), com toque
/// para a tela da conta.
class ProfessorAccountBanner extends StatelessWidget {
  const ProfessorAccountBanner({super.key, required this.account});

  final ProfessorPayoutAccount? account;

  @override
  Widget build(BuildContext context) {
    final a = account;
    final text = a == null || a.status == ProfessorAccountStatus.failed
        ? 'Para cobrar seus alunos, crie sua conta de recebimento. Toque '
            'para começar.'
        : a.status == ProfessorAccountStatus.creating
            ? 'Sua conta de recebimento está sendo criada. Aguarde um instante.'
            : a.status == ProfessorAccountStatus.rejected
                ? 'Sua conta de recebimento foi recusada pelo Asaas. Toque para '
                    'ver a situação.'
                : 'Sua conta de recebimento aguarda a aprovação do Asaas. Confira '
                    'o e-mail de ativação e envie os documentos.';
    return GestureDetector(
      key: const Key('professor-wallet-account-banner'),
      onTap: () => context.pushNamed(AppRouteNames.professorPayoutAccount),
      child: ProfessorLinksNote(
        text,
        tone: a?.status == ProfessorAccountStatus.rejected
            ? ProfessorLinksNoteTone.red
            : ProfessorLinksNoteTone.yellow,
      ),
    );
  }
}

/// Campo de texto com rótulo em caixa alta e erro embaixo.
class ProfessorWalletField extends StatelessWidget {
  const ProfessorWalletField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.error,
    this.keyboardType,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.maxLength,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final String? error;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final int? maxLength;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    OutlineInputBorder border(Color c) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: BorderSide(color: c),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksKicker(label),
        const SizedBox(height: 7),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          textCapitalization: textCapitalization,
          maxLength: maxLength,
          onChanged: onChanged,
          style: AppTypography.bodyM.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            counterText: '',
            hintStyle: AppTypography.bodyM.copyWith(
              color: ProfessorLinksStyle.dim(colors),
            ),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
            border: border(ProfessorLinksStyle.line2(colors)),
            enabledBorder: border(
              error == null
                  ? ProfessorLinksStyle.line2(colors)
                  : AppColors.live,
            ),
            focusedBorder: border(AppColors.brand),
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 5),
          Text(
            error!,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              color: AppColors.live,
            ),
          ),
        ],
      ],
    );
  }
}

/// Linha com rótulo e interruptor (ativo do plano, "Repetir todo mês").
class ProfessorWalletToggleRow extends StatelessWidget {
  const ProfessorWalletToggleRow({
    super.key,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: ProfessorLinksStyle.display(
                  13.5,
                  weight: FontWeight.w600,
                  color: onChanged == null
                      ? ProfessorLinksStyle.dim(colors)
                      : colors.onSurface,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ],
          ),
        ),
        Switch(
          value: value,
          activeThumbColor: ProfessorLinksStyle.onBrand,
          activeTrackColor: AppColors.brand,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

/// Confirmação de ação irreversível (cancelar cobrança, arquivar aluno…).
Future<bool> confirmProfessorWalletAction(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('professor-wallet-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result == true;
}

/// Roda a callable com o erro na tela; no sucesso avisa ([message]).
Future<bool> runProfessorWalletAction(
  BuildContext context,
  Future<void> Function() action, {
  String? message,
}) async {
  try {
    await action();
    if (context.mounted && message != null) showAppSnackBar(context, message);
    return true;
  } catch (e) {
    if (context.mounted) {
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não deu certo agora. Tente de novo.',
        isError: true,
      );
    }
    return false;
  }
}

/// Compartilha o lembrete (o professor não tem o telefone do aluno: ele
/// escolhe WhatsApp ou outro app). Injetável para teste.
typedef ProfessorReminderSharer = Future<void> Function(
  BuildContext context,
  String text,
);

final professorReminderSharerProvider =
    Provider<ProfessorReminderSharer>((ref) {
  return (context, text) async {
    try {
      await Share.share(
        text,
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } catch (_) {
      // Sem folha de compartilhar: copia, e o professor cola onde quiser.
      await Clipboard.setData(ClipboardData(text: text));
      if (context.mounted) showAppSnackBar(context, 'Lembrete copiado.');
    }
  };
});

/// Copia o link da fatura.
Future<void> copyProfessorInvoiceLink(BuildContext context, String url) async {
  await Clipboard.setData(ClipboardData(text: url));
  if (context.mounted) showAppSnackBar(context, 'Link de pagamento copiado.');
}

/// Carregando (sem `pumpAndSettle` nos testes: gira para sempre).
class ProfessorWalletLoading extends StatelessWidget {
  const ProfessorWalletLoading({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      );
}
