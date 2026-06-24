import 'package:flutter/material.dart';

import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/feedback/feedback_page.dart';
import '../../../../core/ui/feedback/show_feedback_page.dart';
import '../../data/tournament_partner_invite_service.dart';

/// Exibe alerta de página para conflitos de inscrição/dupla; snackbar nos demais.
Future<void> showTournamentPartnerInviteError(
  BuildContext context,
  TournamentPartnerInviteException error,
) async {
  if (error.isRegistrationConflict) {
    await pushAlertFeedback(
      context,
      title: 'Inscrição indisponível',
      description: error.message,
      primaryAction: FeedbackAction(
        label: 'Entendi',
        onPressed: () => Navigator.of(context).pop(),
      ),
    );
    return;
  }
  showAppSnackBar(context, error.message, isError: true);
}
