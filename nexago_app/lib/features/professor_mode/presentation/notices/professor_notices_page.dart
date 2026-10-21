import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_notices_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_notices.dart';
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';
import 'professor_arena_notice_page.dart';
import 'professor_notice_widgets.dart';

/// Abre o comunicado: enviado vai ao relatório (F5); rascunho e agendado ao
/// editor.
void openProfessorNotice(BuildContext context, ProfessorNotice n) {
  context.pushNamed(
    n.status == ProfessorNoticeStatus.sent
        ? AppRouteNames.professorNoticeReport
        : AppRouteNames.professorNoticeEdit,
    pathParameters: {'noticeId': n.id},
  );
}

/// F1 Comunicados: enviados, agendados e rascunhos, com a leitura de cada
/// um, e "Da gestão" (F6): o que as arenas mandaram ao professor — o mais
/// novo não lido fica em destaque no topo. "+" abre o editor (F2).
class ProfessorNoticesPage extends ConsumerWidget {
  const ProfessorNoticesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorNoticesProvider);
    final all = async.valueOrNull;
    final tab = ref.watch(professorNoticesTabProvider);
    int count(ProfessorNoticeStatus s) =>
        all?.where((n) => n.status == s).length ?? 0;
    final visible = all == null ? null : professorNoticesOf(all, tab);
    final arenaTab = ref.watch(professorNoticesArenaTabProvider);
    final arenaAsync = ref.watch(arenaProfessorNoticesProvider);
    final arenaNotices = arenaAsync.valueOrNull ?? const [];
    final arenaUnread = [
      for (final n in arenaNotices)
        if (!ref.watch(arenaProfessorNoticeReadProvider(n.id))) n,
    ];

    return ProfessorLinksScaffold(
      title: 'Comunicados',
      subtitle: 'PARA SEUS ALUNOS',
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      trailing: ProfessorLinksRoundButton(
        key: const Key('professor-notices-new'),
        icon: Icons.add_rounded,
        filled: true,
        semanticLabel: 'Novo comunicado',
        onTap: () => context.pushNamed(AppRouteNames.professorNoticeNew),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final (s, label) in const [
                  (ProfessorNoticeStatus.sent, 'Enviados'),
                  (ProfessorNoticeStatus.scheduled, 'Agendados'),
                  (ProfessorNoticeStatus.draft, 'Rascunhos'),
                ]) ...[
                  ArenaClassChip(
                    key: Key('professor-notices-tab-${s.name}'),
                    label: s == ProfessorNoticeStatus.sent || count(s) == 0
                        ? label
                        : '$label · ${count(s)}',
                    selected: !arenaTab && tab == s,
                    onTap: () {
                      ref.read(professorNoticesArenaTabProvider.notifier).state =
                          false;
                      ref.read(professorNoticesTabProvider.notifier).state = s;
                    },
                  ),
                  const SizedBox(width: 6),
                ],
                ArenaClassChip(
                  key: const Key('professor-notices-tab-arena'),
                  label: arenaUnread.isEmpty
                      ? 'Da gestão'
                      : 'Da gestão · ${arenaUnread.length}',
                  selected: arenaTab,
                  onTap: () => ref
                      .read(professorNoticesArenaTabProvider.notifier)
                      .state = true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (arenaTab) ...[
            if (arenaAsync.hasError && !arenaAsync.hasValue)
              ProfessorRetryCard(
                message: 'Não foi possível carregar os comunicados da gestão.',
                onRetry: () => ref.invalidate(arenaProfessorNoticesProvider),
              )
            else if (!arenaAsync.hasValue)
              const ProfessorWalletLoading()
            else if (arenaNotices.isEmpty)
              const ProfessorLinksCard(
                key: Key('arena-notices-empty'),
                child: ProfessorMutedText(
                  'Nenhum comunicado da gestão das suas arenas ainda.',
                ),
              )
            else
              for (final n in arenaNotices) ...[
                ArenaProfessorNoticeCard(notice: n),
                const SizedBox(height: 10),
              ],
          ] else ...[
            if (arenaUnread.isNotEmpty) ...[
              ArenaProfessorNoticeCard(
                notice: arenaUnread.first,
                highlight: true,
              ),
              const SizedBox(height: 10),
            ],
            ..._ownList(ref, async, visible, tab),
          ],
        ],
      ),
    );
  }

  List<Widget> _ownList(
    WidgetRef ref,
    AsyncValue<List<ProfessorNotice>> async,
    List<ProfessorNotice>? visible,
    ProfessorNoticeStatus tab,
  ) =>
      [
        if (visible == null && async.hasError)
          ProfessorRetryCard(
            message: 'Não foi possível carregar seus comunicados.',
            onRetry: () => ref.invalidate(professorNoticesProvider),
          )
        else if (visible == null)
          const ProfessorWalletLoading()
        else if (visible.isEmpty)
          ProfessorLinksCard(
            key: const Key('professor-notices-empty'),
            child: ProfessorMutedText(switch (tab) {
              ProfessorNoticeStatus.sent =>
                'Nenhum comunicado enviado ainda. Toque em "+" para avisar '
                    'seus alunos de uma mudança, cancelar uma aula ou fazer '
                    'uma enquete.',
              ProfessorNoticeStatus.scheduled => 'Nada agendado.',
              ProfessorNoticeStatus.draft => 'Nenhum rascunho.',
            }),
          )
        else
          for (final n in visible) ...[
            ProfessorNoticeCard(notice: n),
            const SizedBox(height: 10),
          ],
      ];
}

class ProfessorNoticeCard extends ConsumerWidget {
  const ProfessorNoticeCard({super.key, required this.notice});

  final ProfessorNotice notice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final n = notice;
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    final classes = ref.watch(professorNoticeClassesProvider);
    final hasWallet =
        (ref.watch(professorWalletStudentsProvider).valueOrNull ?? const [])
            .any((s) => s.active);
    final status = switch (n.status) {
      ProfessorNoticeStatus.scheduled => 'AGENDADO · ',
      ProfessorNoticeStatus.draft => 'RASCUNHO · ',
      ProfessorNoticeStatus.sent => '',
    };
    final sent = n.status == ProfessorNoticeStatus.sent;
    final total = n.recipientCount;
    final pct = total == 0 ? 0 : (n.readCount * 100 / total).round();
    return ProfessorLinksCard(
      key: Key('professor-notice-${n.id}'),
      borderColor: n.status == ProfessorNoticeStatus.draft
          ? ProfessorLinksStyle.line2(colors)
          : null,
      onTap: () => openProfessorNotice(context, n),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ProfessorNoticeKindTag(n.kind),
              const Spacer(),
              Text(
                '$status${professorNoticeWhenLabel(n.when, todayKey)}',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  weight: FontWeight.w600,
                  color: n.status == ProfessorNoticeStatus.scheduled
                      ? ProfessorLinksStyle.blue
                      : ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            n.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.display(
              14.5,
              weight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            [
              professorNoticeAudienceLabel(n.audience, classes,
                  hasWallet: hasWallet),
              if (sent) '$total aluno${total == 1 ? '' : 's'}',
            ].join(' · '),
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          if (sent && total > 0) ...[
            const SizedBox(height: 11),
            Row(
              children: [
                Expanded(
                  child: ProfessorMeter(percent: pct, color: AppColors.win),
                ),
                const SizedBox(width: 10),
                Text(
                  '${n.readCount}/$total leram',
                  key: Key('professor-notice-read-${n.id}'),
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: colors.onSurface,
                  ),
                ),
                if (n.isPoll && n.pollOptions.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Text(
                    '${n.pollOptions.first} · ${n.answersFor(0)}',
                    key: Key('professor-notice-first-${n.id}'),
                    style: ProfessorLinksStyle.mono(
                      10.5,
                      color: ProfessorLinksStyle.blue,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}
