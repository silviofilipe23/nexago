import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_notices_providers.dart';
import '../../domain/professor_notices.dart';
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';
import 'professor_notice_widgets.dart';

/// F5 Leitura e respostas: totais (leram e cada opção), barra empilhada,
/// filtros, a lista de alunos e "Lembrar N" (quem não leu; na enquete, quem
/// não respondeu). Exportar fica para depois.
class ProfessorNoticeReportPage extends ConsumerStatefulWidget {
  const ProfessorNoticeReportPage({super.key, required this.noticeId});

  final String noticeId;

  @override
  ConsumerState<ProfessorNoticeReportPage> createState() =>
      _ProfessorNoticeReportPageState();
}

class _ProfessorNoticeReportPageState
    extends ConsumerState<ProfessorNoticeReportPage> {
  ProfessorNoticeFilter _filter = const ProfessorNoticeFilterAll();
  bool _reminding = false;

  void _back() => popOrGo(context, AppRoutes.professorNotices);

  Future<void> _remind(int pending) async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Lembrar $pending aluno${pending == 1 ? '' : 's'}?',
      body: 'Eles recebem um push lembrando do comunicado.',
      confirmLabel: 'Lembrar',
    );
    if (!ok || !mounted) return;
    setState(() => _reminding = true);
    int? reminded;
    await runProfessorWalletAction(context, () async {
      reminded = await ref
          .read(professorNoticesRepositoryProvider)
          .remind(widget.noticeId);
    });
    if (!mounted) return;
    setState(() => _reminding = false);
    final done = reminded;
    if (done != null) {
      showAppSnackBar(
        context,
        done == 0
            ? 'Ninguém para lembrar.'
            : 'Lembrete enviado para $done aluno${done == 1 ? '' : 's'}.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(professorNoticesProvider);
    ProfessorNotice? notice;
    for (final n in async.valueOrNull ?? const <ProfessorNotice>[]) {
      if (n.id == widget.noticeId) notice = n;
    }
    if (notice == null) {
      return ProfessorLinksScaffold(
        title: 'Comunicado',
        onBack: _back,
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (!async.hasValue && !async.hasError)
              const ProfessorWalletLoading()
            else
              const ProfessorLinksCard(
                key: Key('professor-notice-report-missing'),
                child: ProfessorMutedText('Comunicado não encontrado.'),
              ),
          ],
        ),
      );
    }
    final n = notice;
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    final names = ref.watch(professorStudentNamesProvider);
    final recipients =
        ref.watch(professorNoticeRecipientsProvider(n.id)).valueOrNull;
    final rows = recipients == null ? null : professorNoticeRows(n, recipients);
    final total = n.recipientCount;
    final pending = rows == null ? 0 : professorNoticePending(n, rows);
    final unread =
        rows?.where((r) => r.reply == ProfessorNoticeReply.unread).length ??
            (total - n.readCount);
    final readOnly =
        rows?.where((r) => r.reply == ProfessorNoticeReply.readOnly).length ??
            0;

    Widget stat(String value, String label, Color color, Key key) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
            decoration: BoxDecoration(
              color: ProfessorLinksStyle.soft(colors),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: ProfessorLinksStyle.line(colors)),
            ),
            child: Column(
              children: [
                Text(
                  value,
                  key: key,
                  style: ProfessorLinksStyle.display(16, color: color),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 10,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        );

    final filters = <(ProfessorNoticeFilter, String)>[
      (const ProfessorNoticeFilterAll(), 'Todos'),
      if (n.isPoll)
        for (var i = 0; i < n.pollOptions.length; i++)
          (
            ProfessorNoticeFilterOption(n.pollOptions[i]),
            '${n.pollOptions[i]} · ${n.answersFor(i)}',
          ),
      if (n.isPoll)
        (
          const ProfessorNoticeFilterReply(ProfessorNoticeReply.readOnly),
          'Sem resposta · $readOnly',
        ),
      (
        const ProfessorNoticeFilterReply(ProfessorNoticeReply.unread),
        'Não leram · $unread',
      ),
    ];
    final visible = rows == null ? null : professorNoticeFilter(rows, _filter);

    return ProfessorLinksScaffold(
      title: n.title,
      subtitle: 'ENVIADO ${professorNoticeWhenLabel(n.sentAt, todayKey)}'
          .toUpperCase(),
      onBack: _back,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                Row(
                  children: [
                    ProfessorNoticeKindTag(n.kind),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        n.body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          color: ProfessorLinksStyle.mute(colors),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    stat('${n.readCount}/$total', 'leram', colors.onSurface,
                        const Key('professor-notice-report-read')),
                    if (n.isPoll)
                      for (var i = 0;
                          i < n.pollOptions.length && i < 3;
                          i++) ...[
                        const SizedBox(width: 8),
                        stat(
                          '${n.answersFor(i)}',
                          n.pollOptions[i].toLowerCase(),
                          professorPollColor(i),
                          Key('professor-notice-report-option-$i'),
                        ),
                      ],
                  ],
                ),
                const SizedBox(height: 12),
                ProfessorStackedBar(
                  total: total,
                  parts: n.isPoll
                      ? [
                          for (var i = 0; i < n.pollOptions.length; i++)
                            (n.answersFor(i), professorPollColor(i)),
                        ]
                      : [(n.readCount, AppColors.win)],
                ),
                const SizedBox(height: 14),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final (f, label) in filters) ...[
                        ArenaClassChip(
                          key: Key('professor-notice-filter-$label'),
                          label: label,
                          selected: _filter == f,
                          onTap: () => setState(() => _filter = f),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                if (visible == null)
                  const ProfessorWalletLoading()
                else if (visible.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: ProfessorMutedText('Ninguém aqui.'),
                  )
                else
                  for (final r in visible)
                    _RecipientRow(
                      key: Key('professor-notice-row-${r.athleteId}'),
                      name: names[r.athleteId]?.name ?? 'Aluno',
                      photoUrl: names[r.athleteId]?.photoUrl,
                      row: r,
                      isPoll: n.isPoll,
                      color: r.reply == ProfessorNoticeReply.readOnly &&
                              !n.isPoll
                          ? AppColors.win
                          : r.answer == null
                              ? ProfessorLinksStyle.dim(colors)
                              : professorPollColor(
                                  n.pollOptions.indexOf(r.answer!).clamp(0, 4),
                                ),
                    ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-notice-remind-button'),
                label: pending == 0
                    ? 'Todos já ${n.isPoll ? 'responderam' : 'leram'}'
                    : 'Lembrar $pending que não '
                        '${n.isPoll ? 'responde${pending == 1 ? 'u' : 'ram'}' : 'le${pending == 1 ? 'u' : 'ram'}'}',
                loading: _reminding,
                onPressed: pending == 0 ? null : () => _remind(pending),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RecipientRow extends StatelessWidget {
  const _RecipientRow({
    super.key,
    required this.name,
    required this.row,
    required this.color,
    required this.isPoll,
    this.photoUrl,
  });

  final bool isPoll;

  final String name;
  final String? photoUrl;
  final ProfessorNoticeRow row;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final label = switch (row.reply) {
      ProfessorNoticeReply.answered => row.answer!,
      ProfessorNoticeReply.readOnly => isPoll ? 'Leu · sem resposta' : 'Leu',
      ProfessorNoticeReply.unread => 'Não leu',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(name),
            photoUrl: photoUrl,
            size: 36,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ProfessorLinksStyle.display(
                13.5,
                weight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
          Text(
            label,
            style: ProfessorLinksStyle.mono(10.5, color: color),
          ),
        ],
      ),
    );
  }
}
