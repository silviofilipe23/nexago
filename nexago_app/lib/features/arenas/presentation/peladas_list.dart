import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../athlete/presentation/widgets/match_history/match_history_month_header.dart';
import '../domain/booking_result_record.dart';
import '../domain/booking_result_record_providers.dart';
import '../domain/pelada.dart';
import 'pelada_analytics.dart';
import 'widgets/pelada/pelada_widgets.dart';

/// Abre o detalhe da pelada (10c).
void openPeladaDetail(BuildContext context, String bookingId) {
  context.push(
    AppRoutes.peladaDetail.replaceFirst(
      ':bookingId',
      Uri.encodeComponent(bookingId),
    ),
  );
}

/// Filtro dos chips da aba Peladas do próprio Histórico.
final peladaFilterProvider = StateProvider.autoDispose<PeladaFilter>(
  (ref) => const PeladaFilter.all(),
);

/// 10b · Histórico · Peladas: resumo do ano, chips e as peladas por mês. Só
/// dados — quem embute decide de onde vêm ([all]) e se é o próprio histórico
/// ([readOnly] = de outro atleta: só confirmadas, sem "Pendentes").
class PeladasListContent extends StatelessWidget {
  const PeladasListContent({
    super.key,
    required this.all,
    required this.uid,
    required this.year,
    required this.filter,
    required this.onFilterChanged,
    required this.onOpen,
    this.readOnly = false,
    this.onReserve,
  });

  final List<SavedBookingResult> all;

  /// Dono do histórico.
  final String uid;
  final int year;
  final PeladaFilter filter;
  final ValueChanged<PeladaFilter> onFilterChanged;
  final ValueChanged<SavedBookingResult> onOpen;
  final bool readOnly;

  /// CTA do vazio ("Reservar horário"); `null` esconde.
  final VoidCallback? onReserve;

  @override
  Widget build(BuildContext context) {
    final mine = peladasOf(
      readOnly
          ? [
              for (final s in all)
                if (s.isConfirmed) s
            ]
          : all,
      uid,
    );
    if (mine.isEmpty) {
      return PeladasEmptyState(onReserve: onReserve, readOnly: readOnly);
    }
    final summary = peladasSummary(mine, uid, year: year);
    final shown = [
      for (final s in mine)
        if (filter.matches(s)) s,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PeladasSummaryCard(summary: summary),
        const SizedBox(height: 14),
        PeladaFilterChips(
          filter: filter,
          total: mine.length,
          pendingCount: readOnly ? 0 : summary.pendingCount,
          arenas: peladaArenaChips(mine),
          onChanged: onFilterChanged,
        ),
        const SizedBox(height: 14),
        if (shown.isEmpty)
          _FilterEmpty(onClear: () => onFilterChanged(const PeladaFilter.all()))
        else
          for (final group in peladaMonthGroups(shown, uid)) ...[
            MatchHistoryMonthHeader(
              title: group.title,
              summaryLabel: group.summaryLabel,
            ),
            for (final s in group.items)
              PeladaSessionRow(saved: s, uid: uid, onTap: () => onOpen(s)),
          ],
      ],
    );
  }
}

/// A aba Peladas do próprio Histórico: placares ao vivo do atleta logado.
class MyPeladasTab extends ConsumerWidget {
  const MyPeladasTab({super.key, this.onReserve});

  final VoidCallback? onReserve;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(bookingResultUidProvider);
    final async = ref.watch(myBookingResultsProvider);
    return async.when(
      skipLoadingOnRefresh: true,
      loading: () => const PeladasSkeleton(),
      error: (_, _) => PeladasError(
        onRetry: () => ref.invalidate(myBookingResultsProvider),
      ),
      data: (all) => PeladasListContent(
        all: all,
        uid: uid,
        year: DateTime.now().year,
        filter: ref.watch(peladaFilterProvider),
        onFilterChanged: (f) {
          ref.read(peladaFilterProvider.notifier).state = f;
          logPelada(
            ref,
            (a) => a.logPeladaFilterApplied(
              f.pending ? 'pending' : (f.arena == null ? 'all' : 'arena'),
            ),
          );
        },
        onOpen: (s) {
          logPelada(ref, (a) => a.logPeladaOpened('history'));
          openPeladaDetail(context, s.bookingId);
        },
        onReserve: onReserve,
      ),
    );
  }
}

/// 10b de outro atleta ("Ver todas as peladas" do perfil público): só as
/// confirmadas, sem o chip "Pendentes".
class PeladasHistoryPage extends ConsumerStatefulWidget {
  const PeladasHistoryPage({
    super.key,
    required this.userId,
    this.title = 'Peladas',
  });

  final String userId;
  final String title;

  @override
  ConsumerState<PeladasHistoryPage> createState() => _PeladasHistoryPageState();
}

class _PeladasHistoryPageState extends ConsumerState<PeladasHistoryPage> {
  PeladaFilter _filter = const PeladaFilter.all();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(userConfirmedPeladasProvider(widget.userId));
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          widget.title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          async.when(
            skipLoadingOnRefresh: true,
            loading: () => const PeladasSkeleton(),
            error: (_, _) => PeladasError(
              onRetry: () =>
                  ref.invalidate(userConfirmedPeladasProvider(widget.userId)),
            ),
            data: (all) => PeladasListContent(
              all: all,
              uid: widget.userId,
              year: DateTime.now().year,
              filter: _filter,
              readOnly: true,
              onFilterChanged: (f) => setState(() => _filter = f),
              onOpen: (s) {
                logPelada(ref, (a) => a.logPeladaOpened('profile'));
                openPeladaDetail(context, s.bookingId);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class PeladasEmptyState extends StatelessWidget {
  const PeladasEmptyState({super.key, this.onReserve, this.readOnly = false});

  final VoidCallback? onReserve;
  final bool readOnly;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 12),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.brand.withValues(alpha: 0.10),
            ),
            child: Icon(
              Icons.sports_volleyball_outlined,
              size: 30,
              color: colors.brandText,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            readOnly
                ? 'Nenhuma pelada confirmada ainda.'
                : 'Seus jogos avulsos aparecem aqui depois que você lança o '
                    'placar de uma reserva.',
            key: const Key('peladas-empty'),
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              height: 1.45,
              color: PeladaStyle.dim(colors),
            ),
          ),
          if (onReserve != null) ...[
            const SizedBox(height: 18),
            FilledButton(
              key: const Key('peladas-empty-reserve'),
              onPressed: onReserve,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: const Color(0xFF0A0A0A),
                minimumSize: const Size(0, 46),
                textStyle: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: const Text('Reservar horário'),
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterEmpty extends StatelessWidget {
  const _FilterEmpty({required this.onClear});

  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(
        children: [
          Text(
            'Nada nesse filtro.',
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: PeladaStyle.dim(context.themeColors),
            ),
          ),
          TextButton(
            key: const Key('peladas-clear-filter'),
            onPressed: onClear,
            style: TextButton.styleFrom(
              foregroundColor: context.themeColors.brandText,
            ),
            child: const Text('Limpar filtro'),
          ),
        ],
      ),
    );
  }
}

class PeladasError extends StatelessWidget {
  const PeladasError({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(
        children: [
          Text(
            'Não foi possível carregar as peladas.',
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: PeladaStyle.dim(context.themeColors),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: context.themeColors.brandText,
            ),
            child: const Text('Tentar de novo'),
          ),
        ],
      ),
    );
  }
}

/// Três linhas + o resumo, enquanto carrega.
class PeladasSkeleton extends StatelessWidget {
  const PeladasSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NexaSkeleton(height: 168, radius: AppRadii.lgAll),
        SizedBox(height: 14),
        NexaSkeleton(height: 34, width: 220, radius: AppRadii.pillAll),
        SizedBox(height: 18),
        NexaSkeleton(height: 74, radius: AppRadii.mdAll),
        SizedBox(height: 10),
        NexaSkeleton(height: 74, radius: AppRadii.mdAll),
        SizedBox(height: 10),
        NexaSkeleton(height: 74, radius: AppRadii.mdAll),
      ],
    );
  }
}
