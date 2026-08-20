import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';

/// Landing do convite de dupla por LINK (parceiro que ainda não tinha conta).
///
/// Quem chega aqui já passou pelo login e pelo onboarding — a trilha de
/// retomada de deep link (`pendingDeepLinkPathProvider` →
/// `post_login_destination` → fim do onboarding) devolve para cá. Só então dá
/// para resgatar o token: o convite real exige um uid, que só existe depois do
/// cadastro.
///
/// O resgate cria o convite de verdade e leva para a tela de aceite, que é
/// onde moram o termo LGPD, a confirmação de nível e o uniforme.
class TournamentExternalInvitePage extends ConsumerStatefulWidget {
  const TournamentExternalInvitePage({
    super.key,
    required this.externalInviteId,
  });

  final String externalInviteId;

  @override
  ConsumerState<TournamentExternalInvitePage> createState() =>
      _TournamentExternalInvitePageState();
}

class _TournamentExternalInvitePageState
    extends ConsumerState<TournamentExternalInvitePage> {
  bool _claiming = false;

  Future<void> _claim() async {
    if (_claiming) return;
    setState(() => _claiming = true);
    try {
      final claim = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .claimExternalInvite(widget.externalInviteId);
      if (!mounted) return;
      if (!claim.isValid) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o convite. Tente de novo.',
          isError: true,
        );
        return;
      }
      // `pushReplacementNamed`: o token já foi gasto, voltar para esta tela
      // não teria mais o que fazer.
      context.pushReplacementNamed(
        AppRouteNames.tournamentPartnerInvite,
        pathParameters: <String, String>{'inviteId': claim.inviteId},
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  void _exit() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(AppRoutes.discover);
  }

  @override
  Widget build(BuildContext context) {
    final inviteAsync = ref.watch(
      externalPartnerInviteProvider(widget.externalInviteId),
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: _exit,
        ),
        title: const Text('Convite de dupla'),
      ),
      body: inviteAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (_, __) => AppEmptyView(
          icon: Icons.link_off_rounded,
          title: 'Não foi possível abrir o convite',
          subtitle: 'Verifique sua conexão e tente de novo.',
          actionLabel: 'Voltar',
          onAction: _exit,
        ),
        data: (invite) {
          if (invite == null) {
            return AppEmptyView(
              icon: Icons.link_off_rounded,
              title: 'Convite não encontrado',
              subtitle: 'O link pode ter sido digitado errado ou removido.',
              actionLabel: 'Voltar',
              onAction: _exit,
            );
          }
          if (invite.isCancelled) {
            return FeedbackPage.info(
              title: 'Convite cancelado',
              description: 'Quem te chamou desfez este convite.',
              primaryAction: FeedbackAction(label: 'Voltar', onPressed: _exit),
            );
          }
          if (invite.isExpired) {
            return FeedbackPage.alert(
              title: 'Convite expirado',
              description: 'Peça um link novo para quem te chamou.',
              primaryAction: FeedbackAction(label: 'Voltar', onPressed: _exit),
            );
          }
          return _InviteBody(
            invite: invite,
            claiming: _claiming,
            onClaim: _claim,
            tournament: ref
                .watch(tournamentDetailProvider(invite.tournamentId))
                .valueOrNull,
          );
        },
      ),
    );
  }
}

class _InviteBody extends StatelessWidget {
  const _InviteBody({
    required this.invite,
    required this.claiming,
    required this.onClaim,
    this.tournament,
  });

  final ExternalPartnerInvite invite;
  final bool claiming;
  final VoidCallback onClaim;
  final TournamentDetail? tournament;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final tournamentName = tournament?.name ?? 'um torneio';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Spacer(),
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(
                Icons.handshake_outlined,
                size: 34,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              '${invite.inviterName} te chamou pra jogar',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'É no $tournamentName. Confirme para o convite chegar na sua '
              'conta — depois é só aceitar.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const Spacer(),
            FilledButton(
              onPressed: claiming ? null : onClaim,
              child: claiming
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Entrar na dupla'),
            ),
          ],
        ),
      ),
    );
  }
}
