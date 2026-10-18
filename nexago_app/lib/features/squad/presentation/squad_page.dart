import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../application/squad_providers.dart';
import '../domain/squad_models.dart';
import '../domain/squad_rules.dart';
import 'widgets/squad_conversion_row.dart';
import 'widgets/squad_sheets.dart';
import 'widgets/squad_ui.dart';

/// App 01 · Squad — a home do embaixador.
class SquadPage extends ConsumerWidget {
  const SquadPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mySquadProvider);
    final member = async.valueOrNull?.member;
    return SquadScaffold(
      title: 'Squad',
      trailing: member == null
          ? null
          : SquadTierBadge(member.tier, small: true),
      body: async.when(
        skipLoadingOnRefresh: true,
        loading: () => const SquadLoadingList(),
        error: (e, _) => SquadMessage(
          title: 'Não foi possível abrir o Squad',
          message: e.toString(),
          actionLabel: 'Tentar de novo',
          onAction: () => ref.invalidate(mySquadProvider),
          icon: Icons.wifi_off_rounded,
        ),
        data: (squad) {
          final m = squad.member;
          if (m == null) return SquadNotMember(invite: squad.invite);
          return RefreshIndicator(
            color: AppColors.brand,
            onRefresh: () => ref.refresh(mySquadProvider.future),
            child: _SquadHome(member: m),
          );
        },
      ),
    );
  }
}

class _SquadHome extends StatelessWidget {
  const _SquadHome({required this.member});

  final SquadMember member;

  @override
  Widget build(BuildContext context) {
    final m = member;
    final notice = squadContractNotice(m);
    final recent = m.commissions.take(4).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 40),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        _EarningsHero(member: m),
        if (notice != null) ...[
          const SizedBox(height: 12),
          SquadNote(
            icon: Icons.pause_circle_outline_rounded,
            child: Text(notice),
          ),
        ],
        if (m.pendingAmendment != null) ...[
          const SizedBox(height: 12),
          SquadAmendmentCard(amendment: m.pendingAmendment!),
        ],
        const SizedBox(height: 12),
        _CodeCard(member: m),
        if (m.progress != null) ...[
          const SizedBox(height: 12),
          SquadProgressCard(from: m.tier, progress: m.progress!),
        ],
        const SizedBox(height: 12),
        const _Shortcuts(),
        SquadSection(
          'Últimas conversões',
          action: m.commissions.isEmpty ? null : 'Ver tudo',
          onAction: () => context.pushNamed(AppRouteNames.squadEarnings),
        ),
        if (recent.isEmpty)
          SquadNote(
            child: Text(
              'Quando alguém pagar a inscrição com o seu código, a conversão '
              'aparece aqui.',
            ),
          )
        else
          for (var i = 0; i < recent.length; i++)
            SquadConversionRow(commission: recent[i], divider: i > 0),
      ],
    );
  }
}

class _EarningsHero extends StatelessWidget {
  const _EarningsHero({required this.member});

  final SquadMember member;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = member.earnings;
    final (whole, cents) = squadSplitBRL(e.totalCents);
    final athletes = member.athletes == 1
        ? '1 atleta trazido'
        : '${member.athletes} atletas trazidos';
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        color: colors.surfaceCard,
        gradient: RadialGradient(
          center: Alignment.topLeft,
          radius: 1.4,
          colors: [
            AppColors.brand.withValues(alpha: 0.32),
            AppColors.brand.withValues(alpha: 0.04),
            colors.surfaceCard,
          ],
          stops: const [0, 0.62, 1],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SquadLabel(squadEarnedHeadline(member)),
          const SizedBox(height: 8),
          Text.rich(
            key: const Key('squad-earned-total'),
            TextSpan(
              text: whole,
              children: [
                TextSpan(
                  text: cents,
                  style: SquadStyle.display(24, color: SquadStyle.mute(colors)),
                ),
              ],
            ),
            style: SquadStyle.display(
              44,
              color: colors.onSurface,
            ).copyWith(height: 1),
          ),
          const SizedBox(height: 8),
          Text(
            '$athletes · ${formatBRLFromCents(e.revenueCents)} em inscrições',
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              color: SquadStyle.mute(colors),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: _HeroBox(
                  label: 'Disponível',
                  value: formatBRLFromCents(e.availableCents),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _HeroBox(
                  label: 'Próximo repasse',
                  value: squadNextPayoutShort(e),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroBox extends StatelessWidget {
  const _HeroBox({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.canvas.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11,
              color: SquadStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: SquadStyle.display(
              16,
              color: colors.onSurface,
              weight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.member});

  final SquadMember member;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SquadCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SquadLabel('Seu código'),
                const SizedBox(height: 4),
                Text(
                  member.code,
                  key: const Key('squad-code'),
                  style: SquadStyle.mono(
                    24,
                    color: colors.onSurface,
                  ).copyWith(letterSpacing: 1),
                ),
                const SizedBox(height: 2),
                Text(
                  squadFollowerOffer(member),
                  style: AppTypography.bodyS.copyWith(
                    color: SquadStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          SquadRoundButton(
            icon: Icons.copy_rounded,
            size: 48,
            semanticLabel: 'Copiar código',
            onTap: () async {
              await Clipboard.setData(ClipboardData(text: member.code));
              if (context.mounted) showAppSnackBar(context, 'Código copiado.');
            },
          ),
          const SizedBox(width: 10),
          SquadRoundButton(
            icon: Icons.ios_share_rounded,
            size: 48,
            filled: true,
            semanticLabel: 'Compartilhar',
            onTap: () => context.pushNamed(AppRouteNames.squadShare),
          ),
        ],
      ),
    );
  }
}

/// Nível atual → próximo, com as conversões que faltam (App 01 e 05).
class SquadProgressCard extends StatelessWidget {
  const SquadProgressCard({
    super.key,
    required this.from,
    required this.progress,
  });

  final SquadTier from;
  final SquadProgress progress;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SquadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SquadTierBadge(from, small: true),
              const SizedBox(width: 8),
              Icon(
                Icons.arrow_forward_rounded,
                size: 13,
                color: SquadStyle.dim(colors),
              ),
              const SizedBox(width: 8),
              SquadTierBadge(progress.toTier, small: true, solid: true),
              const Spacer(),
              Text(
                '${progress.conversions}/${progress.minConversions}',
                style: SquadStyle.mono(12, color: colors.onSurface),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SquadProgressBar(fraction: progress.fraction, height: 8),
          const SizedBox(height: 10),
          Text(
            squadProgressLine(progress),
            style: AppTypography.bodyS.copyWith(
              fontSize: 12.5,
              color: SquadStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _Shortcuts extends StatelessWidget {
  const _Shortcuts();

  @override
  Widget build(BuildContext context) {
    final items = [
      (
        Icons.account_balance_wallet_outlined,
        'Ganhos',
        AppRouteNames.squadEarnings,
      ),
      (Icons.workspace_premium_outlined, 'Ranking', AppRouteNames.squadRanking),
      (Icons.card_giftcard_rounded, 'Benefícios', AppRouteNames.squadBenefits),
    ];
    return Row(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _Shortcut(
              icon: items[i].$1,
              label: items[i].$2,
              route: items[i].$3,
            ),
          ),
        ],
      ],
    );
  }
}

class _Shortcut extends StatelessWidget {
  const _Shortcut({
    required this.icon,
    required this.label,
    required this.route,
  });

  final IconData icon;
  final String label;
  final String route;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: SquadStyle.soft(colors),
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(route),
        child: SizedBox(
          height: 76,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 20, color: AppColors.brand),
              const SizedBox(height: 8),
              Text(
                label,
                style: SquadStyle.display(
                  12.5,
                  color: colors.onSurface,
                  weight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Quem abriu o Squad sem contrato vivo: convite em aberto ou o que é o programa.
class SquadNotMember extends StatelessWidget {
  const SquadNotMember({super.key, required this.invite});

  final SquadInviteSummary? invite;

  @override
  Widget build(BuildContext context) {
    final open = invite;
    if (open != null) {
      return SquadMessage(
        title: 'Você tem um convite pro Squad',
        message:
            'O time NexaGO te convidou como ${open.tier.label}. Veja o que '
            'você recebe e escolha seu código.',
        actionLabel: 'Ver convite',
        onAction: () => context.pushNamed(
          AppRouteNames.squadInvite,
          pathParameters: {'inviteId': open.id},
        ),
        icon: Icons.mail_outline_rounded,
      );
    }
    return const SquadMessage(
      title: 'Você ainda não faz parte do Squad',
      message:
          'O NexaGO Squad é o programa de embaixadores da NexaGO. Os '
          'convites saem pelo time, a partir das candidaturas.',
    );
  }
}

/// Esqueleto das telas do Squad enquanto a callable responde.
class SquadLoadingList extends StatelessWidget {
  const SquadLoadingList({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 40),
      physics: const NeverScrollableScrollPhysics(),
      children: const [
        NexaSkeleton(
          height: 200,
          radius: BorderRadius.all(Radius.circular(26)),
        ),
        SizedBox(height: 12),
        NexaSkeleton(height: 92, radius: BorderRadius.all(Radius.circular(22))),
        SizedBox(height: 12),
        NexaSkeleton(
          height: 104,
          radius: BorderRadius.all(Radius.circular(22)),
        ),
        SizedBox(height: 12),
        NexaSkeleton(height: 76, radius: BorderRadius.all(Radius.circular(18))),
      ],
    );
  }
}
