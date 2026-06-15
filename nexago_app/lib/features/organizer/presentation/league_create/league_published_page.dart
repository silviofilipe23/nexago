import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

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
    final theme = Theme.of(context);

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
                args.published ? 'CIRCUITO NO AR' : 'RASCUNHO SALVO',
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: const Color(0xFF22C55E),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '${args.name} está ${args.published ? 'publicado' : 'salvo'}!',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                args.published
                    ? 'Os atletas já podem acompanhar o circuito e se inscrever nas etapas. Compartilhe para lotar mais rápido.'
                    : 'Você pode voltar depois para revisar e publicar.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 28),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _ShareButton(
                    icon: Icons.share_rounded,
                    onTap: () => Share.share(
                      'Acompanhe o circuito ${args.name}: $_shareLink',
                    ),
                  ),
                  const SizedBox(width: 12),
                  _ShareButton(
                    icon: Icons.link_rounded,
                    onTap: () async {
                      await Clipboard.setData(ClipboardData(text: _shareLink));
                      if (context.mounted) {
                        showAppSnackBar(context, 'Link copiado.');
                      }
                    },
                  ),
                  const SizedBox(width: 12),
                  _ShareButton(
                    icon: Icons.qr_code_2_rounded,
                    onTap: () {
                      showDialog<void>(
                        context: context,
                        builder: (context) => AlertDialog(
                          content: QrImageView(data: _shareLink, size: 200),
                        ),
                      );
                    },
                  ),
                ],
              ),
              const Spacer(),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: () => context.goNamed(
                    AppRouteNames.leagueDetail,
                    pathParameters: {'leagueId': args.leagueId},
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    'Ver página do circuito →',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
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
                child: const Text('Voltar ao painel'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShareButton extends StatelessWidget {
  const _ShareButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 52,
          height: 52,
          child: Icon(icon, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}
