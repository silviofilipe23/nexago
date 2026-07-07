import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/feedback_published_share_row.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

class LeaguePublishedArgs {
  const LeaguePublishedArgs({
    required this.leagueId,
    required this.name,
    required this.published,
  });

  final String leagueId;
  final String name;
  final bool published;
}

class LeaguePublishedPage extends StatelessWidget {
  const LeaguePublishedPage({super.key, required this.args});

  final LeaguePublishedArgs args;

  String get _shareLink => 'https://nexago.app/ligas/${args.leagueId}';

  @override
  Widget build(BuildContext context) {
    return FeedbackPage.success(
      eyebrow: args.published ? 'CIRCUITO NO AR' : 'RASCUNHO SALVO',
      title: '${args.name} está ${args.published ? 'publicado' : 'salvo'}!',
      description: args.published
          ? 'Os atletas já podem acompanhar o circuito e se inscrever nas etapas. Compartilhe para lotar mais rápido.'
          : 'Você pode voltar depois para revisar e publicar.',
      extraContent: FeedbackPublishedShareRow(
        onShare: () => nexaShareText(
          context,
          'Acompanhe o circuito ${args.name}: $_shareLink',
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
        label: 'Ver página do circuito →',
        onPressed: () => context.goNamed(
          AppRouteNames.leagueDetail,
          pathParameters: {'leagueId': args.leagueId},
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
