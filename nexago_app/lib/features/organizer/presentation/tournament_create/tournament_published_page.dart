import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/feedback_published_share_row.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

class TournamentPublishedArgs {
  const TournamentPublishedArgs({
    required this.tournamentId,
    required this.name,
    required this.published,
  });

  final String tournamentId;
  final String name;
  final bool published;
}

class TournamentPublishedPage extends StatelessWidget {
  const TournamentPublishedPage({super.key, required this.args});

  final TournamentPublishedArgs args;

  String get _shareLink => 'https://nexago.app/torneios/${args.tournamentId}';

  @override
  Widget build(BuildContext context) {
    return FeedbackPage.success(
      eyebrow: args.published ? 'NO AR · INSCRIÇÕES ABERTAS' : 'RASCUNHO SALVO',
      title: '${args.name} está ${args.published ? 'publicado' : 'salvo'}!',
      description: args.published
          ? 'Os atletas já podem encontrar e se inscrever. Compartilhe para lotar mais rápido.'
          : 'Você pode voltar depois para revisar e publicar.',
      extraContent: FeedbackPublishedShareRow(
        onShare: () => Share.share(
          'Inscreva-se no ${args.name}: $_shareLink',
        ),
        onCopyLink: () async {
          await Clipboard.setData(ClipboardData(text: _shareLink));
          if (context.mounted) {
            showAppSnackBar(context, 'Link copiado.');
          }
        },
        onShowQr: () {
          showDialog<void>(
            context: context,
            builder: (context) => AlertDialog(
              content: QrImageView(data: _shareLink, size: 200),
            ),
          );
        },
      ),
      primaryAction: FeedbackAction(
        label: 'Ver página do torneio →',
        onPressed: () => context.goNamed(
          AppRouteNames.tournamentDetail,
          pathParameters: {'tournamentId': args.tournamentId},
        ),
      ),
      secondaryAction: FeedbackAction(
        label: 'Voltar ao painel',
        isPrimary: false,
        onPressed: () => context.goNamed(AppRouteNames.organizerHome),
      ),
    );
  }
}
