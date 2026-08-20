import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/deep_link/app_domains.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:qr_flutter/qr_flutter.dart';

class LeagueStagePublishedArgs {
  const LeagueStagePublishedArgs({
    required this.leagueId,
    required this.tournamentId,
    required this.stageName,
    required this.leagueName,
    required this.published,
  });

  final String leagueId;
  final String tournamentId;
  final String stageName;
  final String leagueName;
  final bool published;
}

class LeagueStagePublishedPage extends StatelessWidget {
  const LeagueStagePublishedPage({super.key, required this.args});

  final LeagueStagePublishedArgs args;

  String get _shareLink => AppShareLinks.tournament(args.tournamentId);

  @override
  Widget build(BuildContext context) {
    final title = args.stageName.isNotEmpty
        ? args.stageName
        : 'Etapa ${args.leagueName}';

    return FeedbackPage.success(
      eyebrow: args.published ? 'NO AR · INSCRIÇÕES ABERTAS' : 'RASCUNHO SALVO',
      title: args.published ? 'Etapa publicada!' : 'Etapa salva como rascunho',
      description:
          '$title está ${args.published ? 'no ar' : 'salva'} no circuito ${args.leagueName}.',
      extraContent: args.published
          ? Center(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: QrImageView(
                  data: _shareLink,
                  size: 140,
                  backgroundColor: Colors.white,
                ),
              ),
            )
          : null,
      primaryAction: FeedbackAction(
        label: 'Ver torneio da etapa',
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
