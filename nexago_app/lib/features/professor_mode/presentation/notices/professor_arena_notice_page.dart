import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_notices_providers.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/arena_professor_notices.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_notice_widgets.dart';

/// Comunicados da gestão da arena para o professor (F6, protótipo
/// `CmAppDaArena`): o cartão da lista (F1) e o detalhe, com os alunos
/// elegíveis e o "Repassar aos meus alunos" — o editor (F2) abre preenchido
/// com as turmas daquela arena, sem a carteira.

Color arenaProfessorNoticeKindColor(ArenaProfessorNoticeKind k) => switch (k) {
      ArenaProfessorNoticeKind.aviso => AppColors.brand,
      ArenaProfessorNoticeKind.agenda => ProfessorLinksStyle.blue,
      ArenaProfessorNoticeKind.evento => AppColors.win,
    };

class ArenaProfessorNoticeKindTag extends StatelessWidget {
  const ArenaProfessorNoticeKindTag(this.kind, {super.key});

  final ArenaProfessorNoticeKind kind;

  @override
  Widget build(BuildContext context) => ProfessorWalletTag(
        kind.label,
        color: arenaProfessorNoticeKindColor(kind),
      );
}

void openArenaProfessorNotice(BuildContext context, ArenaProfessorNotice n) {
  context.pushNamed(
    AppRouteNames.professorArenaNotice,
    pathParameters: {'noticeId': n.id},
  );
}

/// Linha da lista: marca da arena, "DA GESTÃO · ARENA", título e o ponto de
/// não lido. [highlight] = o destaque laranja do topo da lista.
class ArenaProfessorNoticeCard extends ConsumerWidget {
  const ArenaProfessorNoticeCard({
    super.key,
    required this.notice,
    this.highlight = false,
  });

  final ArenaProfessorNotice notice;
  final bool highlight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final n = notice;
    final read = ref.watch(arenaProfessorNoticeReadProvider(n.id));
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    return ProfessorLinksCard(
      key: Key('arena-notice-${highlight ? 'highlight-' : ''}${n.id}'),
      padding: const EdgeInsets.all(12),
      backgroundColor:
          highlight ? AppColors.brand.withValues(alpha: 0.08) : null,
      borderColor: highlight ? AppColors.brand.withValues(alpha: 0.35) : null,
      onTap: () => openArenaProfessorNotice(context, n),
      child: Row(
        children: [
          ProfessorArenaMark(name: n.arenaName, size: 36),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  [
                    'DA GESTÃO · ${n.arenaName.toUpperCase()}',
                    if (!highlight && n.sentAt != null)
                      professorNoticeWhenLabel(n.sentAt, todayKey)
                          .toUpperCase(),
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: colors.readableTone(AppColors.brand),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  n.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: read ? FontWeight.w600 : FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          if (!read) ...[
            const SizedBox(width: 8),
            Container(
              key: Key('arena-notice-unread-${n.id}'),
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: AppColors.brand,
                shape: BoxShape.circle,
              ),
            ),
          ],
          const SizedBox(width: 6),
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ],
      ),
    );
  }
}

/// F6 Da gestão: o comunicado da arena; abrir marca como lido.
class ProfessorArenaNoticePage extends ConsumerStatefulWidget {
  const ProfessorArenaNoticePage({super.key, required this.noticeId});

  final String noticeId;

  @override
  ConsumerState<ProfessorArenaNoticePage> createState() =>
      _ProfessorArenaNoticePageState();
}

class _ProfessorArenaNoticePageState
    extends ConsumerState<ProfessorArenaNoticePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _markRead());
  }

  void _markRead() {
    if (!mounted || widget.noticeId.isEmpty) return;
    final local = ref.read(arenaProfessorNoticesReadLocallyProvider.notifier);
    if (local.state.contains(widget.noticeId)) return;
    local.state = {...local.state, widget.noticeId};
    // Recibo é só contagem para a arena: falha não atrapalha a leitura.
    ref
        .read(professorNoticesRepositoryProvider)
        .markArenaNoticeRead(widget.noticeId)
        .then<void>((_) {}, onError: (_) {});
  }

  void _back() => popOrGo(context, AppRoutes.professorNotices);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(arenaProfessorNoticeProvider(widget.noticeId));
    final n = async.valueOrNull;
    if (n == null) {
      return ProfessorLinksScaffold(
        title: 'Da gestão',
        onBack: _back,
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (!async.hasValue && !async.hasError)
              const ProfessorWalletLoading()
            else
              const ProfessorLinksCard(
                key: Key('arena-notice-missing'),
                child: ProfessorMutedText(
                  'Este comunicado não está disponível para você.',
                ),
              ),
          ],
        ),
      );
    }

    final colors = context.themeColors;
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    final snapshot = ref.watch(professorStudentsProvider).valueOrNull;
    final eligible = snapshot == null
        ? null
        : arenaNoticeEligibleStudents(snapshot, n.arenaId);
    final classes = arenaNoticeClasses(
        ref.watch(professorNoticeClassesProvider), n.arenaId);
    final when = professorNoticeWhenLabel(n.sentAt, todayKey);

    return ProfessorLinksScaffold(
      title: 'Da gestão',
      subtitle: '${n.arenaName} · para professores'.toUpperCase(),
      onBack: _back,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                Row(
                  children: [
                    ProfessorArenaMark(name: n.arenaName, size: 40),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${n.authorName} · gestão',
                            key: const Key('arena-notice-author'),
                            style: ProfessorLinksStyle.display(
                              13.5,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          if (when.isNotEmpty)
                            Text(
                              when.toUpperCase(),
                              style: ProfessorLinksStyle.mono(
                                10,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                        ],
                      ),
                    ),
                    ArenaProfessorNoticeKindTag(n.kind),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  n.title,
                  key: const Key('arena-notice-title'),
                  style:
                      ProfessorLinksStyle.display(19, color: colors.onSurface),
                ),
                const SizedBox(height: 8),
                Text(
                  n.body,
                  style: AppTypography.bodyM.copyWith(
                    fontSize: 13.5,
                    height: 1.55,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
                const SizedBox(height: 18),
                ProfessorRowsBlock(
                  children: [
                    ProfessorInfoRow(
                      key: const Key('arena-notice-eligible'),
                      label: 'Seus alunos elegíveis',
                      value: eligible == null ? '—' : '$eligible',
                      sub: n.arenaName,
                      last: true,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ProfessorLinksNote(
                  'Só alunos da ${n.arenaName} recebem ao repassar. Sua '
                  'carteira independente fica de fora.',
                  key: const Key('arena-notice-rule'),
                ),
                if (snapshot != null && classes.isEmpty) ...[
                  const SizedBox(height: 10),
                  ProfessorLinksNote(
                    'Você não tem turmas na ${n.arenaName} para repassar.',
                    key: const Key('arena-notice-no-classes'),
                    tone: ProfessorLinksNoteTone.yellow,
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('arena-notice-forward'),
                label: 'Repassar aos meus alunos',
                onPressed: classes.isEmpty
                    ? null
                    : () => context.pushNamed(
                          AppRouteNames.professorNoticeNew,
                          extra: arenaNoticeForwardPrefill(n, classes),
                        ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
