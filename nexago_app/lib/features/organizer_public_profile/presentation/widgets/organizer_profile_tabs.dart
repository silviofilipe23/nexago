import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/organizer_event.dart';
import '../../domain/organizer_public_profile_logic.dart';
import '../../domain/organizer_public_profile_models.dart';
import 'organizer_event_tiles.dart';

/// Quantos itens a Visão geral mostra antes de mandar para a aba completa.
const int kOrganizerOverviewPreviewCount = 3;

const String kOrganizerNoReputationText = 'Ainda sem avaliações suficientes';

typedef OrganizerOpenEvent = void Function(OrganizerEvent event);

class OrganizerOverviewTab extends StatelessWidget {
  const OrganizerOverviewTab({
    super.key,
    required this.profile,
    required this.now,
    required this.upcoming,
    required this.completed,
    required this.championNames,
    required this.reputation,
    required this.inviteToFollow,
    required this.onOpenEvent,
    required this.onSeeEvents,
    required this.onSeeReviews,
  });

  final OrganizerPublicProfile profile;
  final DateTime now;
  final List<OrganizerEvent> upcoming;
  final List<OrganizerEvent> completed;
  final Map<String, String> championNames;
  final OrganizerReputationView? reputation;

  /// Sem próximos eventos, o aviso convida a seguir (não no próprio perfil).
  final bool inviteToFollow;
  final OrganizerOpenEvent onOpenEvent;
  final VoidCallback onSeeEvents;
  final VoidCallback onSeeReviews;

  @override
  Widget build(BuildContext context) {
    final bio = profile.bio;
    final venues = profile.stats.venues;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (bio != null) ...[
            OrganizerSectionCard(
              child: Text(
                bio,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurface,
                  height: 1.5,
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
          OrganizerSectionTitle(
            title: 'Próximos eventos',
            actionLabel: upcoming.length > kOrganizerOverviewPreviewCount
                ? 'Ver agenda completa'
                : null,
            onAction: onSeeEvents,
          ),
          const SizedBox(height: 12),
          if (upcoming.isEmpty)
            OrganizerEmptyNote(
              text: inviteToFollow
                  ? 'Nenhum evento com data marcada agora. Siga para saber quando '
                        'abrir a próxima inscrição.'
                  : 'Nenhum evento com data marcada agora.',
            )
          else
            for (final event in upcoming.take(
              kOrganizerOverviewPreviewCount,
            )) ...[
              OrganizerUpcomingEventCard(
                event: event,
                now: now,
                onOpen: () => onOpenEvent(event),
              ),
              const SizedBox(height: 12),
            ],
          if (completed.isNotEmpty) ...[
            const SizedBox(height: 12),
            OrganizerSectionTitle(
              eyebrow: 'Histórico',
              title: 'Eventos realizados',
              // Só quando há mais do que as 3 linhas já mostradas.
              actionLabel: completed.length > kOrganizerOverviewPreviewCount
                  ? 'Ver os ${completed.length}'
                  : null,
              onAction: onSeeEvents,
            ),
            const SizedBox(height: 4),
            OrganizerSectionCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (
                    var i = 0;
                    i < completed.length && i < kOrganizerOverviewPreviewCount;
                    i++
                  ) ...[
                    if (i > 0) const _Divider(),
                    OrganizerCompletedEventRow(
                      event: completed[i],
                      championNames: championNames,
                      showEntries: true,
                      onOpen: () => onOpenEvent(completed[i]),
                    ),
                  ],
                ],
              ),
            ),
          ],
          if (venues.isNotEmpty) ...[
            const SizedBox(height: 24),
            const OrganizerSectionTitle(title: 'Onde acontece'),
            const SizedBox(height: 12),
            OrganizerSectionCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < venues.length; i++) ...[
                    if (i > 0) const _Divider(),
                    _VenueRow(venue: venues[i]),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
          OrganizerSectionTitle(
            eyebrow: 'Reputação',
            title: 'Avaliações dos atletas',
            actionLabel: reputation == null ? null : 'Ver todas',
            onAction: onSeeReviews,
          ),
          const SizedBox(height: 12),
          OrganizerReputationCard(view: reputation),
        ],
      ),
    );
  }
}

class OrganizerEventsTab extends StatelessWidget {
  const OrganizerEventsTab({
    super.key,
    required this.now,
    required this.upcoming,
    required this.completed,
    required this.championNames,
    required this.onOpenEvent,
  });

  final DateTime now;
  final List<OrganizerEvent> upcoming;
  final List<OrganizerEvent> completed;
  final Map<String, String> championNames;
  final OrganizerOpenEvent onOpenEvent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (upcoming.isEmpty && completed.isEmpty)
            const OrganizerEmptyNote(text: 'Nenhum evento publicado ainda.'),
          if (upcoming.isNotEmpty) ...[
            OrganizerSectionTitle(title: 'Próximos (${upcoming.length})'),
            const SizedBox(height: 12),
            for (final event in upcoming) ...[
              OrganizerUpcomingEventCard(
                event: event,
                now: now,
                onOpen: () => onOpenEvent(event),
              ),
              const SizedBox(height: 12),
            ],
            const SizedBox(height: 12),
          ],
          if (completed.isNotEmpty) ...[
            OrganizerSectionTitle(title: 'Realizados (${completed.length})'),
            const SizedBox(height: 4),
            OrganizerSectionCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < completed.length; i++) ...[
                    if (i > 0) const _Divider(),
                    OrganizerCompletedEventRow(
                      event: completed[i],
                      championNames: championNames,
                      onOpen: () => onOpenEvent(completed[i]),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class OrganizerResultsTab extends StatelessWidget {
  const OrganizerResultsTab({
    super.key,
    required this.completed,
    required this.championNames,
    required this.onOpenEvent,
  });

  final List<OrganizerEvent> completed;
  final Map<String, String> championNames;
  final OrganizerOpenEvent onOpenEvent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (completed.isEmpty)
            const OrganizerEmptyNote(text: 'Nenhum evento realizado ainda.'),
          for (final event in completed) ...[
            Material(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onOpenEvent(event),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: colors.onSurfaceMuted.withValues(alpha: 0.14),
                    ),
                  ),
                  child: _ResultCardBody(
                    event: event,
                    rows: organizerEventChampionRows(event, championNames),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _ResultCardBody extends StatelessWidget {
  const _ResultCardBody({required this.event, required this.rows});

  final OrganizerEvent event;
  final List<({String category, String team})> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          event.detail.name,
          style: AppTypography.soraRegular(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          organizerEventDateLabel(event),
          style: AppTypography.soraRegular(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: colors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 10),
        if (rows.isEmpty)
          Text(
            'Campeões ainda não registrados.',
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
            ),
          )
        else
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.emoji_events_outlined,
                    size: 15,
                    color: AppColors.pending,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: '${row.category}: ',
                            style: TextStyle(color: colors.onSurfaceMuted),
                          ),
                          TextSpan(text: row.team),
                        ],
                      ),
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

class OrganizerReviewsTab extends StatelessWidget {
  const OrganizerReviewsTab({
    super.key,
    required this.reputation,
    required this.eventRows,
  });

  final OrganizerReputationView? reputation;
  final List<OrganizerEventReviewRow> eventRows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final view = reputation;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OrganizerReputationCard(view: view, showDistribution: true),
          if (view != null && eventRows.isNotEmpty) ...[
            const SizedBox(height: 24),
            const OrganizerSectionTitle(title: 'Nota por evento'),
            const SizedBox(height: 4),
            OrganizerSectionCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < eventRows.length; i++) ...[
                    if (i > 0) const _Divider(),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  eventRows[i].name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.soraRegular(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: colors.onSurface,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  [
                                    if (eventRows[i].dateLabel != null)
                                      eventRows[i].dateLabel!,
                                    eventRows[i].countLabel,
                                  ].join(' · '),
                                  style: AppTypography.soraRegular(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: colors.onSurfaceMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.star_rounded,
                            size: 16,
                            color: AppColors.pending,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            eventRows[i].averageText,
                            style: AppTypography.soraRegular(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: colors.onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Nota, estrelas, número de avaliações e as barras dos aspectos (e a distribuição de 1 a 5 na
/// aba Avaliações). Sem reputação pública, só o aviso.
class OrganizerReputationCard extends StatelessWidget {
  const OrganizerReputationCard({
    super.key,
    required this.view,
    this.showDistribution = false,
  });

  final OrganizerReputationView? view;
  final bool showDistribution;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    if (v == null) {
      return OrganizerSectionCard(
        child: Row(
          children: [
            Icon(Icons.star_outline_rounded, color: colors.onSurfaceMuted),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    kOrganizerNoReputationText,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'A nota aparece a partir de 3 avaliações de atletas.',
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return OrganizerSectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Nota em cima e barras embaixo, na largura toda: lado a lado, no telefone, a barra
          // sobrava com uns 20 px.
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                v.averageText,
                style: AppTypography.soraRegular(
                  fontSize: 40,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                  height: 1,
                ),
              ),
              const SizedBox(width: 14),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    OrganizerStars(average: v.average, size: 16),
                    const SizedBox(height: 4),
                    Text(
                      v.countLabel.toUpperCase(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurfaceMuted,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (v.aspects.isNotEmpty) ...[
            const SizedBox(height: 14),
            for (final aspect in v.aspects)
              _BarRow(
                label: aspect.label,
                fraction: aspect.fraction,
                value: aspect.valueText,
              ),
          ],
          if (showDistribution) ...[
            const SizedBox(height: 16),
            const _Divider(),
            const SizedBox(height: 8),
            for (final row in v.distribution)
              _BarRow(
                label: row.stars == 1 ? '1 estrela' : '${row.stars} estrelas',
                fraction: row.fraction,
                value: '${row.count}',
              ),
          ],
        ],
      ),
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({
    required this.label,
    required this.fraction,
    required this.value,
  });

  final String label;
  final double fraction;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: fraction,
                minHeight: 5,
                backgroundColor: colors.surfaceRaised,
                color: AppColors.pending,
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 36,
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cinco estrelas, com meia estrela a partir de ,25.
class OrganizerStars extends StatelessWidget {
  const OrganizerStars({super.key, required this.average, this.size = 14});

  final double average;
  final double size;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            average >= i - 0.25
                ? Icons.star_rounded
                : average >= i - 0.75
                ? Icons.star_half_rounded
                : Icons.star_outline_rounded,
            size: size,
            color: average >= i - 0.75 ? AppColors.pending : muted,
          ),
      ],
    );
  }
}

class _VenueRow extends StatelessWidget {
  const _VenueRow({required this.venue});

  final OrganizerVenue venue;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final city = venue.city;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.stadium_outlined,
              size: 18,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              venue.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ),
          if (city != null) ...[
            const SizedBox(width: 8),
            Text(
              city,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class OrganizerSectionTitle extends StatelessWidget {
  const OrganizerSectionTitle({
    super.key,
    required this.title,
    this.eyebrow,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? eyebrow;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (eyebrow != null)
                Text(
                  eyebrow!.toUpperCase(),
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurfaceMuted,
                    letterSpacing: 0.8,
                  ),
                ),
              Text(
                title,
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
        if (actionLabel != null && onAction != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              foregroundColor: colors.onSurface,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: const Size(0, 32),
            ),
            child: Text(
              actionLabel!,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }
}

class OrganizerSectionCard extends StatelessWidget {
  const OrganizerSectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.onSurfaceMuted.withValues(alpha: 0.14),
        ),
      ),
      child: child,
    );
  }
}

class OrganizerEmptyNote extends StatelessWidget {
  const OrganizerEmptyNote({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return OrganizerSectionCard(
      padding: const EdgeInsets.all(20),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: colors.onSurfaceMuted,
          height: 1.45,
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    );
  }
}
