import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../../arenas/domain/my_booking_item.dart';
import '../../domain/athlete_profile.dart';
import '../../domain/gamification_models.dart';

/// Dados mockados até integração com backend (parceiros, ranking, etc.).
abstract final class AthleteProfileMock {
  static const locationFallback = 'Aparecida de Goiânia · GO';
  static const profileCompletionPercent = 40;
  static const profileStepsDone = 3;
  static const profileStepsTotal = 5;
  static const profileXpBonus = 150;
  static const wins = 5;
  static const ranking = 412;
  static const xpCurrent = 340;
  static const xpGoal = 1000;
  static const displayLevel = 2;

  static const playsWith = <_PlayPartner>[
    _PlayPartner(initials: 'EN', name: 'Enzo R.', games: '4 JOGOS', color: Color(0xFF2BD17E)),
    _PlayPartner(initials: 'BR', name: 'Bruno V.', games: '2 JOGOS', color: Color(0xFF7C6CFF)),
    _PlayPartner(initials: 'CA', name: 'Camila S.', games: '1 JOGO', color: Color(0xFFFF6B9D)),
  ];

  static const achievements = <_AchievementItem>[
    _AchievementItem(title: 'Primeiro jogo', icon: Icons.sync_rounded, unlocked: true),
    _AchievementItem(title: 'Bem-vindo', icon: Icons.star_rounded, unlocked: true),
    _AchievementItem(title: 'Estreante', icon: Icons.emoji_events_outlined, unlocked: false),
    _AchievementItem(title: 'Conector', icon: Icons.groups_outlined, unlocked: false),
  ];
}

class _PlayPartner {
  const _PlayPartner({
    required this.initials,
    required this.name,
    required this.games,
    required this.color,
  });

  final String initials;
  final String name;
  final String games;
  final Color color;
}

class _AchievementItem {
  const _AchievementItem({
    required this.title,
    required this.icon,
    required this.unlocked,
  });

  final String title;
  final IconData icon;
  final bool unlocked;
}

/// Layout principal do perfil do atleta (design 01 — Perfil principal).
class AthleteProfileMainView extends StatelessWidget {
  const AthleteProfileMainView({
    super.key,
    required this.profile,
    required this.embedded,
    required this.readOnly,
    required this.totalBookings,
    required this.nextBooking,
    required this.gamificationSummary,
    required this.badges,
    this.onBack,
    required this.onEdit,
    required this.onShare,
    required this.onCompleteProfile,
    required this.onOpenAgenda,
    required this.onOpenAchievements,
    required this.onOpenPlaysWith,
  });

  final AthleteProfile profile;
  final bool embedded;
  final bool readOnly;
  final int totalBookings;
  final MyBookingItem? nextBooking;
  final GamificationSummary gamificationSummary;
  final List<UserBadgeProgress> badges;
  final VoidCallback? onBack;
  final VoidCallback onEdit;
  final VoidCallback onShare;
  final VoidCallback onCompleteProfile;
  final VoidCallback onOpenAgenda;
  final VoidCallback onOpenAchievements;
  final VoidCallback onOpenPlaysWith;

  @override
  Widget build(BuildContext context) {
    final name =
        profile.name.trim().isNotEmpty ? profile.name.trim() : 'Atleta';
    final initials = _initials(name);
    final location = profile.city.trim().isNotEmpty
        ? profile.city.trim()
        : AthleteProfileMock.locationFallback;
    final sport = profile.sport.trim().isNotEmpty
        ? profile.sport.trim()
        : 'Vôlei de praia';
    final levelLabel = profile.level.trim().isNotEmpty
        ? profile.level.trim().toUpperCase()
        : 'INICIANTE';

    final games = totalBookings > 0 ? totalBookings : 7;
    final streak = gamificationSummary.streak > 0
        ? gamificationSummary.streak
        : 3;
    final level = gamificationSummary.level > 0
        ? gamificationSummary.level
        : AthleteProfileMock.displayLevel;
    final xp = gamificationSummary.xp > 0
        ? gamificationSummary.xp
        : AthleteProfileMock.xpCurrent;
    final xpGoal = AthleteProfileMock.xpGoal;
    final xpProgress = (xp / xpGoal).clamp(0.0, 1.0);

    return ColoredBox(
      color: AppColors.canvas,
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          SliverToBoxAdapter(
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                child: Row(
                  children: [
                    if (!embedded)
                      IconButton(
                        onPressed: onBack,
                        icon: const Icon(
                          Icons.arrow_back_rounded,
                          color: AppColors.onSurface,
                        ),
                      )
                    else
                      const SizedBox(width: 8),
                    const Spacer(),
                    IconButton(
                      onPressed: onShare,
                      icon: const Icon(
                        Icons.ios_share_rounded,
                        color: AppColors.onSurface,
                      ),
                    ),
                    if (!readOnly)
                      IconButton(
                        onPressed: onEdit,
                        icon: const Icon(
                          Icons.edit_outlined,
                          color: AppColors.onSurface,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                ArenaDashboardTokens.horizontalPadding,
                8,
                ArenaDashboardTokens.horizontalPadding,
                28,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _ProfileIdentityRow(
                        avatarUrl: profile.avatarUrl,
                        initials: initials,
                        name: name,
                        location: location,
                        sport: sport,
                        levelLabel: levelLabel,
                        displayLevel: level,
                      ),
                      if (!readOnly) ...[
                        const SizedBox(height: 16),
                        _CompleteProfileCard(
                          percent: AthleteProfileMock.profileCompletionPercent,
                          stepsDone: AthleteProfileMock.profileStepsDone,
                          stepsTotal: AthleteProfileMock.profileStepsTotal,
                          xpBonus: AthleteProfileMock.profileXpBonus,
                          onTap: onCompleteProfile,
                        ),
                      ],
                      const SizedBox(height: 16),
                      _XpLevelSection(
                        level: level,
                        xpCurrent: xp,
                        xpGoal: xpGoal,
                        progress: xpProgress,
                      ),
                      const SizedBox(height: 14),
                      _StatsGrid(
                        games: games,
                        wins: AthleteProfileMock.wins,
                        streak: streak,
                        ranking: AthleteProfileMock.ranking,
                      ),
                      const SizedBox(height: 14),
                      _NextBookingCard(
                        booking: nextBooking,
                        onTap: onOpenAgenda,
                      ),
                      const SizedBox(height: 20),
                      _SectionHeader(
                        title: 'Conquistas',
                        trailing: badges.isEmpty
                            ? '2 DE 24'
                            : '${badges.length} DE 24',
                        onTrailingTap: onOpenAchievements,
                      ),
                      const SizedBox(height: 10),
                      _AchievementsStrip(
                        items: _achievementsFromBadges(badges),
                        onTap: onOpenAchievements,
                      ),
                      const SizedBox(height: 20),
                      _SectionHeader(
                        title: 'Joga com',
                        trailing: 'VER TODOS',
                        onTrailingTap: onOpenPlaysWith,
                      ),
                      const SizedBox(height: 10),
                      _PlaysWithStrip(
                        partners: AthleteProfileMock.playsWith,
                        onInvite: onOpenPlaysWith,
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static List<_AchievementItem> _achievementsFromBadges(
    List<UserBadgeProgress> badges,
  ) {
    if (badges.isEmpty) return AthleteProfileMock.achievements;
    return badges.take(4).map((b) {
      return _AchievementItem(
        title: b.badge.title,
        icon: Icons.military_tech_outlined,
        unlocked: true,
      );
    }).toList();
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.substring(0, 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _ProfileIdentityRow extends StatelessWidget {
  const _ProfileIdentityRow({
    required this.avatarUrl,
    required this.initials,
    required this.name,
    required this.location,
    required this.sport,
    required this.levelLabel,
    required this.displayLevel,
  });

  final String? avatarUrl;
  final String initials;
  final String name;
  final String location;
  final String sport;
  final String levelLabel;
  final int displayLevel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            _ProfileAvatar(
              size: 72,
              imageUrl: avatarUrl,
              initials: initials,
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.canvas, width: 2),
                ),
                child: Text(
                  'LV $displayLevel',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.black,
                    fontSize: 10,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                  letterSpacing: -0.4,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(
                    Icons.location_on_outlined,
                    size: 14,
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.9),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      location,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _SportTag(label: sport),
                  _MutedTag(label: levelLabel),
                  const _OnlineTag(),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProfileAvatar extends StatelessWidget {
  const _ProfileAvatar({
    required this.size,
    required this.imageUrl,
    required this.initials,
  });

  final double size;
  final String? imageUrl;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.brand,
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.5),
          width: 2,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null && url.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => _Initials(initials: initials),
            )
          : _Initials(initials: initials),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initials});

  final String initials;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        initials,
        style: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w900,
          color: AppColors.black,
          letterSpacing: -0.5,
        ),
      ),
    );
  }
}

class _SportTag extends StatelessWidget {
  const _SportTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.45),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                ),
          ),
        ],
      ),
    );
  }
}

class _MutedTag extends StatelessWidget {
  const _MutedTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
              letterSpacing: 0.4,
            ),
      ),
    );
  }
}

class _OnlineTag extends StatelessWidget {
  const _OnlineTag();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppColors.win.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'ONLINE',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.win,
                  letterSpacing: 0.4,
                ),
          ),
        ],
      ),
    );
  }
}

class _CompleteProfileCard extends StatelessWidget {
  const _CompleteProfileCard({
    required this.percent,
    required this.stepsDone,
    required this.stepsTotal,
    required this.xpBonus,
    required this.onTap,
  });

  final int percent;
  final int stepsDone;
  final int stepsTotal;
  final int xpBonus;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surfaceRaised.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.55),
              width: 1.5,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                SizedBox(
                  width: 48,
                  height: 48,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(
                        value: percent / 100,
                        strokeWidth: 4,
                        backgroundColor:
                            AppColors.onSurfaceMuted.withValues(alpha: 0.15),
                        color: AppColors.brand,
                      ),
                      Text(
                        '$percent%',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Complete seu perfil',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text.rich(
                        TextSpan(
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.onSurfaceMuted,
                            height: 1.35,
                          ),
                          children: [
                            TextSpan(
                              text:
                                  '$stepsDone de $stepsTotal passos. Ganhe ',
                            ),
                            TextSpan(
                              text: '+$xpBonus XP',
                              style: const TextStyle(
                                color: AppColors.brand,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const TextSpan(text: ' e desbloqueie torneios.'),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.arrow_forward_rounded,
                    color: AppColors.black,
                    size: 20,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _XpLevelSection extends StatelessWidget {
  const _XpLevelSection({
    required this.level,
    required this.xpCurrent,
    required this.xpGoal,
    required this.progress,
  });

  final int level;
  final int xpCurrent;
  final int xpGoal;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(
              Icons.bolt_rounded,
              size: 16,
              color: AppColors.brand,
            ),
            const SizedBox(width: 4),
            Text(
              'NÍVEL $level',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.6,
              ),
            ),
            const Spacer(),
            Text(
              '$xpCurrent / $xpGoal XP',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 6,
            backgroundColor: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
            color: AppColors.brand,
          ),
        ),
      ],
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({
    required this.games,
    required this.wins,
    required this.streak,
    required this.ranking,
  });

  final int games;
  final int wins;
  final int streak;
  final int ranking;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            value: '$games',
            label: 'JOGOS',
            icon: Icons.sports_volleyball_outlined,
            iconColor: AppColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            value: '$wins',
            label: 'VITÓRIAS',
            icon: Icons.emoji_events_outlined,
            iconColor: AppColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            value: '$streak',
            label: 'STREAK',
            icon: Icons.local_fire_department_rounded,
            iconColor: AppColors.brand,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            value: '#$ranking',
            label: 'RANKING',
            icon: Icons.star_outline_rounded,
            iconColor: AppColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.value,
    required this.label,
    required this.icon,
    required this.iconColor,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        color: AppColors.surfaceRaised.withValues(alpha: 0.75),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        child: Column(
          children: [
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(height: 6),
            Text(
              value,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.onSurface,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.onSurfaceMuted,
                fontSize: 9,
                letterSpacing: 0.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NextBookingCard extends StatelessWidget {
  const _NextBookingCard({
    required this.booking,
    required this.onTap,
  });

  final MyBookingItem? booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final item = booking;
    final mock = item == null;
    final dateBlock =
        mock ? _MockBooking.dateBlock : _formatDateBlock(item.dateRaw);
    final courtSuffix = item != null &&
            item.courtName != null &&
            item.courtName!.isNotEmpty
        ? ' · ${item.courtName}'
        : '';
    final arena = mock
        ? 'Arena CFC · Quadra 1'
        : '${item.arenaName}$courtSuffix';
    final timeLine = mock
        ? '11:00 – 12:00 · com Enzo R.'
        : '${item.startTime} – ${item.endTime}';
    final amount = mock
        ? 'R\$ 60 / PAGO'
        : (item.amountReais != null
            ? 'R\$ ${item.amountReais!.toStringAsFixed(0)}'
            : '');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: ArenaDashboardTokens.cardDecoration(
            color: AppColors.surfaceRaised.withValues(alpha: 0.75),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 52,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceCard,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      Text(
                        dateBlock.weekday,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurfaceMuted,
                          fontSize: 10,
                        ),
                      ),
                      Text(
                        dateBlock.day,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.onSurface,
                          height: 1,
                        ),
                      ),
                      Text(
                        dateBlock.month,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.onSurfaceMuted,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'PRÓXIMA RESERVA',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.8,
                          fontSize: 10,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        arena,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        timeLine,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _StatusPill(
                            label: 'CONFIRMADA',
                            color: AppColors.win,
                            dot: true,
                          ),
                          if (amount.isNotEmpty)
                            _StatusPill(
                              label: amount,
                              color: AppColors.onSurfaceMuted,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MockBooking {
  static const dateBlock = _DateBlock(
    weekday: 'SAB',
    day: '24',
    month: 'MAI',
  );
}

class _DateBlock {
  const _DateBlock({
    required this.weekday,
    required this.day,
    required this.month,
  });

  final String weekday;
  final String day;
  final String month;
}

_DateBlock _formatDateBlock(String dateRaw) {
  final parsed = DateTime.tryParse(
    dateRaw.length >= 10 ? dateRaw.substring(0, 10) : dateRaw,
  );
  if (parsed == null) return _MockBooking.dateBlock;
  const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const months = [
    'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
    'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
  ];
  return _DateBlock(
    weekday: weekdays[parsed.weekday % 7],
    day: parsed.day.toString().padLeft(2, '0'),
    month: months[parsed.month - 1],
  );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.color,
    this.dot = false,
  });

  final String label;
  final Color color;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: dot ? 0.15 : 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: color.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 5,
              height: 5,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: dot ? color : AppColors.onSurface,
                  fontSize: 10,
                ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.trailing,
    required this.onTrailingTap,
  });

  final String title;
  final String trailing;
  final VoidCallback onTrailingTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
          ),
        ),
        const Spacer(),
        TextButton(
          onPressed: onTrailingTap,
          style: TextButton.styleFrom(
            foregroundColor: title == 'Conquistas'
                ? AppColors.brand
                : AppColors.onSurfaceMuted,
            padding: EdgeInsets.zero,
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$trailing ',
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: title == 'Conquistas'
                    ? AppColors.brand
                    : AppColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AchievementsStrip extends StatelessWidget {
  const _AchievementsStrip({
    required this.items,
    required this.onTap,
  });

  final List<_AchievementItem> items;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final item = items[index];
          return _AchievementTile(item: item, onTap: onTap);
        },
      ),
    );
  }
}

class _AchievementTile extends StatelessWidget {
  const _AchievementTile({
    required this.item,
    required this.onTap,
  });

  final _AchievementItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unlocked = item.unlocked;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          width: 100,
          decoration: BoxDecoration(
            color: AppColors.surfaceRaised.withValues(alpha: 0.75),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: unlocked
                  ? AppColors.brand.withValues(alpha: 0.35)
                  : AppColors.onSurfaceMuted.withValues(alpha: 0.15),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Stack(
                  alignment: Alignment.center,
                  children: [
                    Icon(
                      item.icon,
                      size: 28,
                      color: unlocked
                          ? AppColors.brand
                          : AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                    ),
                    if (!unlocked)
                      Icon(
                        Icons.lock_outline_rounded,
                        size: 14,
                        color: AppColors.onSurfaceMuted.withValues(alpha: 0.5),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  item.title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: unlocked
                        ? AppColors.onSurface
                        : AppColors.onSurfaceMuted,
                    height: 1.15,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlaysWithStrip extends StatelessWidget {
  const _PlaysWithStrip({
    required this.partners,
    required this.onInvite,
  });

  final List<_PlayPartner> partners;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 100,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: partners.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          if (index == partners.length) {
            return _InvitePartnerTile(onTap: onInvite);
          }
          final p = partners[index];
          return _PartnerTile(partner: p);
        },
      ),
    );
  }
}

class _PartnerTile extends StatelessWidget {
  const _PartnerTile({required this.partner});

  final _PlayPartner partner;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      width: 64,
      child: Column(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: partner.color.withValues(alpha: 0.25),
            child: Text(
              partner.initials,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
                color: partner.color,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            partner.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          Text(
            partner.games,
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 9,
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _InvitePartnerTile extends StatelessWidget {
  const _InvitePartnerTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 64,
          child: Column(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.surfaceRaised,
                  border: Border.all(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.25),
                  ),
                ),
                child: const Icon(
                  Icons.person_add_alt_1_rounded,
                  color: AppColors.brand,
                  size: 24,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Convidar',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
