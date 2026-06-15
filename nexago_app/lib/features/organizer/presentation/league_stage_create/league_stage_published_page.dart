import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

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

  String get _shareLink => 'https://nexago.app/torneios/${args.tournamentId}';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = args.stageName.isNotEmpty
        ? args.stageName
        : 'Etapa ${args.leagueName}';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Center(
                child: Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: const Color(0xFF22C55E),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    color: Colors.black,
                    size: 42,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                args.published
                    ? 'NO AR · INSCRIÇÕES ABERTAS'
                    : 'RASCUNHO SALVO',
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: const Color(0xFF22C55E),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                args.published ? 'Etapa publicada!' : 'Etapa salva como rascunho',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '$title está ${args.published ? 'no ar' : 'salva'} no circuito ${args.leagueName}.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.45,
                ),
              ),
              if (args.published) ...[
                const SizedBox(height: 28),
                Center(
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
                ),
              ],
              const Spacer(),
              FilledButton(
                onPressed: () => context.goNamed(
                  AppRouteNames.tournamentDetail,
                  pathParameters: {'tournamentId': args.tournamentId},
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Ver torneio da etapa',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => context.goNamed(AppRouteNames.organizerHome),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Voltar ao painel',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              if (args.published) ...[
                const SizedBox(height: 10),
                TextButton(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: _shareLink));
                    if (context.mounted) {
                      showAppSnackBar(context, 'Link copiado!');
                    }
                  },
                  child: const Text('Copiar link'),
                ),
                TextButton(
                  onPressed: () => Share.share(
                    'Inscreva-se na etapa $title: $_shareLink',
                  ),
                  child: const Text('Compartilhar'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
