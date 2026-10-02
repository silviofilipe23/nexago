import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../domain/tournament_reviews/organizer_tournament_review_logic.dart';
import '../../domain/tournament_reviews/organizer_tournament_review_models.dart';
import '../../domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

/// Avaliações dos atletas sobre o torneio — o mesmo conteúdo e os mesmos estados da aba do
/// painel web (`painel/avaliacoes/avaliacoes-torneio.component.ts`). Anônimas: nada aqui
/// identifica o atleta.
class OrganizerTournamentReviewsPage extends ConsumerWidget {
  const OrganizerTournamentReviewsPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(tournamentReviewSummaryProvider(tournamentId));
    return OrganizerTournamentSubpageScaffold(
      title: 'Avaliações',
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          sliver: summaryAsync.when(
            loading: () => const _LoadingSliver(),
            error: (_, _) => const SliverToBoxAdapter(
              child: AppInlineErrorView(message: 'Não foi possível carregar as avaliações.'),
            ),
            data: (summary) {
              if (summary == null) return _NoSummarySliver(tournamentId: tournamentId);
              if (!tournamentReviewHasPublicNumbers(summary)) {
                return SliverToBoxAdapter(child: _CollectingCard(summary: summary));
              }
              // Coluna, não lista preguiçosa: um torneio tem dezenas de avaliações, e assim os
              // comentários existem na árvore mesmo fora da tela.
              return SliverToBoxAdapter(
                child: _FullReviews(tournamentId: tournamentId, summary: summary),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _LoadingSliver extends StatelessWidget {
  const _LoadingSliver();

  @override
  Widget build(BuildContext context) {
    return const SliverFillRemaining(
      hasScrollBody: false,
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

class _NoSummarySliver extends ConsumerWidget {
  const _NoSummarySliver({required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(organizerTournamentDetailProvider(tournamentId));
    return detailAsync.when(
      loading: () => const _LoadingSliver(),
      error: (e, _) => SliverToBoxAdapter(child: AppInlineErrorView(error: e)),
      data: (detail) {
        if (detail.isLoading) return const _LoadingSliver();
        final tournament = detail.tournament;
        return SliverFillRemaining(
          hasScrollBody: false,
          child: AppEmptyView(
            icon: Icons.star_outline_rounded,
            title: tournament == null ? 'Torneio não encontrado' : 'Avaliação dos atletas',
            subtitle: tournament == null
                ? 'Volte e abra o torneio de novo.'
                : tournamentReviewsEmptyText(
                    tournamentReviewsEmptyState(tournament, DateTime.now()),
                  ),
          ),
        );
      },
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: child,
    );
  }
}

class _WindowChip extends StatelessWidget {
  const _WindowChip({required this.summary});

  final TournamentReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final open = isTournamentReviewWindowOpen(summary, now);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: open ? AppColors.brand.withValues(alpha: 0.15) : context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        tournamentReviewsWindowLabel(summary, now),
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: open ? AppColors.brand : context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _CollectingCard extends StatelessWidget {
  const _CollectingCard({required this.summary});

  final TournamentReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _WindowChip(summary: summary),
          const SizedBox(height: 12),
          Text(
            tournamentReviewsCollectingText(summary),
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }
}

class _FullReviews extends ConsumerStatefulWidget {
  const _FullReviews({required this.tournamentId, required this.summary});

  final String tournamentId;
  final TournamentReviewSummary summary;

  @override
  ConsumerState<_FullReviews> createState() => _FullReviewsState();
}

class _FullReviewsState extends ConsumerState<_FullReviews> {
  bool _lowOnly = false;

  @override
  Widget build(BuildContext context) {
    final summary = widget.summary;
    // Só aqui, com 3+ avaliações: abaixo disso a rule nega a leitura dos comentários.
    final commentsAsync = ref.watch(tournamentAnonymousReviewsProvider(widget.tournamentId));
    final aspects = tournamentReviewAspectRows(summary.aspects);
    final muted = context.themeColors.onSurfaceMuted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Panel(
          child: Row(
            children: [
              Text(
                formatTournamentReviewAverage(summary.average!),
                style: AppTypography.soraRegular(fontSize: 44, fontWeight: FontWeight.w900),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.star_rounded, color: AppColors.brand, size: 32),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentReviewsCountLabel(summary.count),
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(tournamentReviewsResponseRate(summary), style: TextStyle(color: muted)),
                    const SizedBox(height: 8),
                    _WindowChip(summary: summary),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        const _SectionLabel('DISTRIBUIÇÃO'),
        for (final row in tournamentReviewDistributionRows(summary.distribution))
          _BarRow(
            label: row.label,
            value: tournamentReviewsCountLabel(row.count),
            fraction: row.fraction,
          ),
        const SizedBox(height: 24),
        const _SectionLabel('ASPECTOS · DO MAIS FRACO AO MAIS FORTE'),
        if (aspects.isEmpty)
          const _Muted('Nenhum aspecto recebeu nota.')
        else
          for (final row in aspects)
            _BarRow(label: row.label, value: row.valueText, fraction: row.fraction),
        const SizedBox(height: 24),
        const _SectionLabel('COMENTÁRIOS ANÔNIMOS'),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Todos'),
              selected: !_lowOnly,
              onSelected: (_) => setState(() => _lowOnly = false),
            ),
            ChoiceChip(
              label: const Text('Só 1–2★'),
              selected: _lowOnly,
              onSelected: (_) => setState(() => _lowOnly = true),
            ),
          ],
        ),
        const SizedBox(height: 12),
        commentsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const _Muted('Não foi possível carregar os comentários.'),
          data: (reviews) {
            final cards = tournamentReviewCommentCards(reviews, lowOnly: _lowOnly);
            if (cards.isEmpty) {
              return _Muted(
                _lowOnly
                    ? 'Nenhum comentário com 1 ou 2 estrelas.'
                    : 'Nenhum atleta escreveu comentário.',
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final review in cards) _CommentCard(review: review)],
            );
          },
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        text,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _Muted extends StatelessWidget {
  const _Muted(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(text, style: TextStyle(color: context.themeColors.onSurfaceMuted)),
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({required this.label, required this.value, required this.fraction});

  final String label;
  final String value;
  final double fraction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Text(
                value,
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 6,
              color: AppColors.brand,
              backgroundColor: context.themeColors.surfaceRaised,
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentCard extends StatelessWidget {
  const _CommentCard({required this.review});

  final AnonymousTournamentReview review;

  @override
  Widget build(BuildContext context) {
    final chips = tournamentReviewAspectChips(review);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tournamentReviewStars(review.overall),
              semanticsLabel: '${review.overall} de 5 estrelas',
              style: const TextStyle(color: AppColors.brand, letterSpacing: 1),
            ),
            if (chips.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final chip in chips)
                    Text(
                      chip,
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Text(review.comment ?? ''),
          ],
        ),
      ),
    );
  }
}
