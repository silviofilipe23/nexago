import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'booking_details_section_card.dart';
import 'booking_details_team_providers.dart';

class BookingDetailsTeamSection extends ConsumerWidget {
  const BookingDetailsTeamSection({
    super.key,
    required this.bookingId,
    this.inviteEnabled = true,
  });

  final String bookingId;
  final bool inviteEnabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final teamAsync = ref.watch(bookingDetailsTeamProvider(bookingId));

    return teamAsync.when(
      loading: () => const BookingDetailsSectionCard(
        title: 'Sua equipe',
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (_, __) => BookingDetailsSectionCard(
        title: 'Sua equipe',
        child: Text(
          'Não foi possível carregar a equipe.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ),
      data: (team) {
        return BookingDetailsSectionCard(
          title: 'Sua equipe',
          titleTrailing: Text(
            '${team.confirmedCount}/${team.totalSlots} confirmados',
            style: theme.textTheme.labelMedium?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _TeamProgressBar(
                confirmed: team.confirmedCount,
                total: team.totalSlots,
              ),
              const SizedBox(height: 14),
              for (var i = 0; i < team.members.length; i++) ...[
                if (i > 0) const SizedBox(height: 10),
                _TeamMemberRow(member: team.members[i]),
              ],
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed:
                    inviteEnabled ? () => _showInviteComingSoon(context) : null,
                icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
                label: const Text('Convidar jogadores'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  disabledForegroundColor:
                      AppColors.brand.withValues(alpha: 0.4),
                  side: const BorderSide(color: AppColors.brand, width: 1.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

void _showInviteComingSoon(BuildContext context) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      const SnackBar(content: Text('Convidar jogadores em breve no app.')),
    );
}

class _TeamProgressBar extends StatelessWidget {
  const _TeamProgressBar({required this.confirmed, required this.total});

  final int confirmed;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(total, (index) {
        final filled = index < confirmed;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: index < total - 1 ? 4 : 0),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              height: 4,
              decoration: BoxDecoration(
                color: filled
                    ? const Color(0xFF2E7D32)
                    : context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _TeamMemberRow extends StatelessWidget {
  const _TeamMemberRow({required this.member});

  final BookingDetailsTeamMember member;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (member.isEmptySlot) {
      return Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                width: 1.5,
                strokeAlign: BorderSide.strokeAlignInside,
              ),
            ),
            child: Icon(
              Icons.add,
              size: 20,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.displayName,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                Text(
                  member.subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return Row(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: member.isOrganizer
                      ? AppColors.brand
                      : context.themeColors.surfaceRaised,
                  width: 2,
                ),
              ),
              child: CircleAvatar(
                radius: 20,
                backgroundColor: context.themeColors.surfaceRaised,
                backgroundImage: member.avatarUrl != null
                    ? NetworkImage(member.avatarUrl!)
                    : null,
                child: member.avatarUrl == null
                    ? Text(
                        member.initials,
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: member.isOrganizer
                              ? AppColors.brand
                              : context.themeColors.onSurface,
                        ),
                      )
                    : null,
              ),
            ),
            if (member.isConfirmed)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2E7D32),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: context.themeColors.surfaceCard,
                      width: 2,
                    ),
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    size: 11,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(
                TextSpan(
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                  children: [
                    TextSpan(text: member.displayName),
                    if (member.isOrganizer)
                      TextSpan(
                        text: ' · ${member.subtitle}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                  ],
                ),
              ),
              if (!member.isOrganizer)
                Text(
                  member.subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF2E7D32),
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
        ),
        if (member.showPaidBadge) _PaidBadge(),
      ],
    );
  }
}

class _PaidBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF2E7D32).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'PAGO',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: const Color(0xFF2E7D32),
              fontWeight: FontWeight.w800,
              fontSize: 10,
              letterSpacing: 0.3,
            ),
      ),
    );
  }
}
