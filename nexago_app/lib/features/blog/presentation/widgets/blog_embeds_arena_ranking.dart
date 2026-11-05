import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/sports/sport_catalog.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_skeleton.dart';
import '../../../app_news/presentation/widgets/app_news_parts.dart';
import '../../../arenas/domain/arena_list_item.dart';
import '../../../arenas/domain/arena_sport_codes.dart';
import '../../../arenas/domain/arenas_providers.dart';
import '../../../arenas/domain/slots_page_logic.dart';
import '../../../arenas/presentation/arena_booking_navigation.dart';
import '../../../ranking/domain/ranking_list_models.dart';
import '../../../ranking/domain/ranking_providers.dart';
import '../../application/blog_embed_providers.dart';
import '../../domain/blog_embed_logic.dart';
import '../../domain/blog_post.dart';
import 'blog_parts.dart';

/// Blocos nexaGO Arena e Ranking da leitura, lidos AO VIVO. Sem dado (arena
/// que não existe, ranking vazio, esporte desconhecido) o bloco some em
/// silêncio.

/// Card da arena: capa, nome, cidade/bairro, esportes, até 4 horários livres
/// de hoje e "Reservar" (o fluxo de reserva da arena). Arena de pré-cadastro
/// não reserva pelo app: card sem horários, com "Ver arena".
class BlogArenaEmbedCard extends ConsumerWidget {
  const BlogArenaEmbedCard({super.key, required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arena = ref.watch(arenaByIdProvider(arenaId)).valueOrNull;
    if (arena == null) return const SizedBox.shrink();
    final colors = context.themeColors;
    final sports = {
      for (final t in arena.courtTypes)
        if (courtSportLabel(t).trim().isNotEmpty) courtSportLabel(t).trim(),
    }.join(' · ');
    const radius = BorderRadius.all(Radius.circular(18));

    return Container(
      key: Key('blog-arena-$arenaId'),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: radius,
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(height: 132, child: _ArenaCover(url: arena.coverUrl)),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const BlogCategoryLabel(BlogCategory.arenas),
                const SizedBox(height: 4),
                Text(
                  arena.name,
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                    color: colors.onSurface,
                  ),
                ),
                if (arena.locationLabel.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _ArenaInfo(
                    icon: Icons.place_outlined,
                    text: arena.locationLabel.trim(),
                  ),
                ],
                if (sports.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  _ArenaInfo(icon: Icons.sports_tennis_rounded, text: sports),
                ],
                const SizedBox(height: 12),
                if (arena.isUnclaimed)
                  AppNewsOutlinedButton(
                    key: Key('blog-arena-open-$arenaId'),
                    label: 'Ver arena',
                    onTap: () => openArenaDetail(context, arena),
                  )
                else ...[
                  _FreeTimes(arena: arena),
                  const SizedBox(height: 12),
                  AppNewsPrimaryButton(
                    key: Key('blog-arena-book-$arenaId'),
                    label: 'Reservar',
                    onTap: () => openArenaBookingSlots(
                      context,
                      arena: arena,
                      date: _today(),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

DateTime _today() {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
}

class _ArenaCover extends StatelessWidget {
  const _ArenaCover({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final placeholder = DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1B1610), Color(0xFF6E5530)],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.stadium_outlined,
          size: 34,
          color: AppColors.onSurface.withValues(alpha: 0.35),
        ),
      ),
    );
    final cover = url;
    if (cover == null || cover.isEmpty) return placeholder;
    return CachedNetworkImage(
      imageUrl: cover,
      fit: BoxFit.cover,
      placeholder: (_, _) => placeholder,
      errorWidget: (_, _, _) => placeholder,
    );
  }
}

class _ArenaInfo extends StatelessWidget {
  const _ArenaInfo({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: colors.onSurfaceMuted),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              height: 1.35,
              color: colors.onSurfaceMuted,
            ),
          ),
        ),
      ],
    );
  }
}

/// "Horários livres hoje": chips que abrem a reserva já no horário.
class _FreeTimes extends ConsumerWidget {
  const _FreeTimes({required this.arena});

  final ArenaListItem arena;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(blogArenaFreeTimesProvider(arena.id));
    final times = async.valueOrNull;
    final label = Text(
      'HORÁRIOS LIVRES HOJE',
      style: AppTypography.mono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.4,
        color: colors.onSurfaceMuted,
      ),
    );
    if (times == null) {
      // Erro de leitura: sem a linha (o botão Reservar segue valendo).
      if (async.hasError) return const SizedBox.shrink();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          label,
          const SizedBox(height: 8),
          const Row(
            children: [
              NexaSkeleton(width: 60, height: 34, radius: AppRadii.pillAll),
              SizedBox(width: 8),
              NexaSkeleton(width: 60, height: 34, radius: AppRadii.pillAll),
              SizedBox(width: 8),
              NexaSkeleton(width: 60, height: 34, radius: AppRadii.pillAll),
            ],
          ),
        ],
      );
    }
    if (times.isEmpty) {
      return Text(
        'Sem horário livre hoje',
        key: Key('blog-arena-no-times-${arena.id}'),
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: colors.onSurfaceMuted,
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        label,
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [for (final t in times) _TimeChip(arena: arena, time: t)],
        ),
      ],
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.arena, required this.time});

  final ArenaListItem arena;
  final BlogArenaFreeTime time;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: AppColors.brand.withValues(alpha: 0.10),
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.pillAll,
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: InkWell(
        key: Key('blog-arena-time-${time.startTime}'),
        customBorder: const StadiumBorder(),
        onTap: () => openArenaBookingSlots(
          context,
          arena: arena,
          slot: time.slot,
          date: _today(),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 36, minWidth: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Center(
              widthFactor: 1,
              child: Text(
                formatCompactSlotTime(time.startTime),
                style: AppTypography.mono(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: colors.brandText,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Card do ranking: top 5 da temporada no recorte do bloco e "Ver ranking
/// completo", que abre a tela de ranking no mesmo recorte.
class BlogRankingEmbedCard extends ConsumerWidget {
  const BlogRankingEmbedCard({super.key, required this.block});

  final BlogRankingEmbed block;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(blogRankingTopProvider(block)).valueOrNull;
    if (entries == null || entries.isEmpty) return const SizedBox.shrink();
    final year = ref.watch(rankingSeasonYearProvider);
    final filter = blogRankingFilter(block, year: year);
    if (filter == null) return const SizedBox.shrink();
    final colors = context.themeColors;
    final sportLabel = SportCatalog.resolve(block.sport)?.label ?? block.sport;
    final cut = [
      block.mode == BlogRankingMode.teams ? 'Duplas e equipes' : 'Atletas',
      if (block.gender != BlogRankingGender.all) filter.gender.label,
    ].join(' · ');

    return Container(
      key: Key('blog-ranking-${block.sport}-${block.mode.key}'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'RANKING · TEMPORADA $year',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.4,
              color: colors.brandText,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Top ${entries.length} · $sportLabel',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          Text(
            cut,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w400,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 10),
          for (final e in entries) _RankingRow(entry: e),
          const SizedBox(height: 10),
          AppNewsOutlinedButton(
            key: const Key('blog-ranking-open'),
            label: 'Ver ranking completo',
            onTap: () {
              // A rota do ranking não recebe recorte: a tela lê o filtro
              // deste provider, então ele é posto antes de abrir.
              ref.read(rankingPageFilterProvider.notifier).state = filter;
              context.pushNamed(AppRouteNames.athleteRanking);
            },
          ),
        ],
      ),
    );
  }
}

class _RankingRow extends StatelessWidget {
  const _RankingRow({required this.entry});

  final RankingListEntry entry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final avatarUrl = entry.avatarUrl ?? entry.player1AvatarUrl;
    final initials = (entry.initials ?? entry.player1Initials ?? '').trim();
    final color = entry.avatarColor ?? entry.player1Color ?? AppColors.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 26,
            child: Text(
              '${entry.rank}',
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: entry.rank <= 3
                    ? colors.brandText
                    : colors.onSurfaceMuted,
              ),
            ),
          ),
          ClipOval(
            child: SizedBox(
              width: 32,
              height: 32,
              child: avatarUrl == null || avatarUrl.isEmpty
                  ? _Initials(initials: initials, color: color)
                  : CachedNetworkImage(
                      imageUrl: avatarUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, _) =>
                          _Initials(initials: initials, color: color),
                      errorWidget: (_, _, _) =>
                          _Initials(initials: initials, color: color),
                    ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              entry.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${entry.points} pts',
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initials, required this.color});

  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: color.withValues(alpha: 0.22),
    child: Center(
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: AppTypography.soraRegular(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: context.themeColors.onSurface,
        ),
      ),
    ),
  );
}
