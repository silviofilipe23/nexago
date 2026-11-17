import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/benefits_club_premium_logic.dart';
import '../domain/my_benefits.dart';
import 'widgets/benefits_sheets.dart';

/// Folhas da entrada no clube, em sequência e nunca empilhadas:
/// 1. "Como funciona o clube" na primeira visita da conta neste aparelho;
/// 2. "Conseguiu usar?" quando o servidor aponta uso pendente, uma vez por
///    sessão do app. "Agora não" só fecha.
Future<void> runBenefitsEntrySheets(BuildContext context, WidgetRef ref) async {
  final uid = ref.read(benefitsClubUidProvider);
  if (uid.isEmpty) return;

  final store = ref.read(benefitsOnboardingStoreProvider);
  if (!await store.hasSeenHowItWorks(uid)) {
    // Marca antes de mostrar: fechar arrastando também conta como visto.
    await store.markHowItWorksSeen(uid);
    if (!context.mounted) return;
    await showBenefitsHowItWorksSheet(context);
  }
  if (!context.mounted) return;
  await _maybeAskUse(context, ref, uid);
}

Future<void> _maybeAskUse(
  BuildContext context,
  WidgetRef ref,
  String uid,
) async {
  if (ref.read(benefitsQuestionAskedProvider)) return;
  final MyBenefits mine;
  try {
    mine = await ref.read(benefitsMyBenefitsProvider.future);
  } on Exception {
    // Sem a resposta do servidor, não pergunta nada (tenta na próxima visita).
    return;
  }
  final partnerId = mine.pendingQuestionPartnerId;
  if (partnerId == null || !context.mounted) return;
  final visible = ref.read(benefitsVisiblePartnersProvider).valueOrNull;
  final partner = visible == null ? null : partnerById(visible, partnerId);
  if (partner == null) return;

  ref.read(benefitsQuestionAskedProvider.notifier).state = true;
  final use = mine.uses.where((u) => u.partnerId == partnerId).firstOrNull;
  final answer = await showBenefitUseQuestionSheet(
    context,
    partner: partner,
    subtitle: pendingQuestionSubtitle(
      partner: partner,
      coupon: couponViaClaim(partner) ? null : couponFor(partner, uid),
      lastUsedAt: use?.lastUsedAt,
      now: ref.read(benefitsClockProvider)(),
    ),
  );
  if (answer == null || !context.mounted) return;
  try {
    await ref
        .read(benefitsClubServiceProvider)
        .answerBenefitUse(partnerId: partnerId, used: answer);
    ref.invalidate(benefitsMyBenefitsProvider);
    if (!context.mounted) return;
    showAppSnackBar(context, 'Obrigado! Sua resposta ajuda o clube.');
  } on Exception catch (error) {
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      friendlyErrorMessage(
        error,
        action: 'Não foi possível enviar a resposta',
        logReason: 'clube:resposta',
      ),
      isError: true,
    );
  }
}
