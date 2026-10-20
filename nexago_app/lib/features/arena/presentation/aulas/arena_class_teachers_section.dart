import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/aulas/arena_class.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_payout.dart';
import '../../domain/aulas/arena_class_payout_logic.dart';
import '../../domain/aulas/arena_class_payout_providers.dart';
import '../../domain/aulas/arena_class_teacher.dart';
import '../widgets/arena_async_state.dart';
import 'arena_class_payout_sheets.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_form_atoms.dart';
import 'widgets/arena_class_payout_atoms.dart';

/// Aba Professores de Aulas (tela 14 do protótipo): agenda e alunos de cada
/// professor e, só para quem lê o financeiro, o modelo de repasse e o "a
/// pagar" do mês corrente. O modelo só o gestor muda (escreve a agenda E lê o
/// financeiro). O cadastro do professor continua no portal.
class ArenaClassTeachersSection extends ConsumerWidget {
  const ArenaClassTeachersSection({super.key, required this.classes});

  /// Turmas da arena (aulas/semana e alunos de cada professor).
  final List<ArenaClass> classes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final teachersAsync = ref.watch(arenaClassTeachersProvider);
    final canSeePayout = ref.watch(arenaClassCanSeePayoutProvider);
    final canManage = ref.watch(arenaClassCanManagePayoutProvider);
    final month = arenaClassMonthOf(ref.watch(arenaClassTodayKeyProvider));
    // A prévia só existe para quem lê o financeiro (a callable recusa o
    // resto) — nem chama para a recepção.
    final preview =
        canSeePayout ? ref.watch(arenaClassPayoutPreviewProvider(month)) : null;
    final stats = arenaClassTeacherStats(classes);

    return teachersAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.only(top: 40),
        child: ArenaLoadingState(label: 'Carregando professores...'),
      ),
      error: (e, _) => ArenaErrorState(message: '$e'),
      data: (all) {
        final teachers = arenaClassTeachersForList(all);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (canSeePayout) ...[
              _PayoutSummary(month: month, preview: preview!),
              const SizedBox(height: 12),
            ],
            if (teachers.isEmpty)
              const ArenaEmptyState(
                title: 'Nenhum professor',
                message: 'Cadastre os professores no portal da arena — aqui '
                    'você acompanha a agenda de cada um.',
                icon: Icons.person_outline_rounded,
              ),
            for (final t in teachers)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _TeacherCard(
                  teacher: t,
                  stats: stats[t.id],
                  month: month,
                  payout: canSeePayout
                      ? (
                          toPay: preview!.valueOrNull?.teacher(t.id),
                          loaded: preview.hasValue,
                        )
                      : null,
                  onOpen: canSeePayout
                      ? () => context.pushNamed(
                            AppRouteNames.arenaClassTeacherPayout,
                            pathParameters: {'teacherId': t.id},
                            queryParameters: {'month': month},
                          )
                      : null,
                  onEditModel:
                      canManage ? () => _editModel(context, ref, t) : null,
                ),
              ),
            const SizedBox(height: 6),
            Text(
              canSeePayout
                  ? 'Professores são cadastrados no portal da arena. O '
                      'pagamento ao professor é feito por fora — o app só '
                      'registra.'
                  : 'Professores são cadastrados no portal da arena.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11.5,
                height: 1.45,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        );
      },
    );
  }

  static Future<void> _editModel(
    BuildContext context,
    WidgetRef ref,
    ArenaClassTeacher teacher,
  ) async {
    final ok = await showArenaClassPayoutModelSheet(context, teacher: teacher);
    if (ok != true || !context.mounted) return;
    // A prévia carrega o modelo do professor: refaz com o novo.
    ref.invalidate(arenaClassPayoutPreviewProvider);
    showAppSnackBar(context, 'Repasse de ${teacher.name} atualizado.');
  }
}

/// Repasse previsto do mês + atalho para o fechamento.
class _PayoutSummary extends StatelessWidget {
  const _PayoutSummary({required this.month, required this.preview});

  final String month;
  final AsyncValue<ArenaClassPayoutPreview> preview;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = preview.valueOrNull;
    final total =
        p?.teachers.fold<double>(0, (sum, t) => sum + t.amountReais) ?? 0;
    final short = arenaClassMonthShortLabel(month);
    return ArenaClassPanel(
      highlight: true,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ArenaClassKicker('Repasse previsto · $short',
              color: AppColors.brandHover),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              preview.hasError
                  ? 'Indisponível'
                  : p == null
                      ? '—'
                      : formatBRL(total),
              style: AppTypography.soraRegular(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                letterSpacing: -1,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(height: 12),
          ArenaClassPayoutStatRow(
            stats: [
              ArenaClassPayoutStat(
                label: 'Receita de aulas · $short',
                value: p == null ? '—' : formatBRL(p.revenueReais),
                color: AppColors.win,
              ),
              ArenaClassPayoutStat(
                label: 'Fechamento',
                value: arenaClassShortDate(arenaClassMonthLastDay(month)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ArenaClassGhostButton(
            label: 'Repasse do mês',
            icon: Icons.receipt_long_outlined,
            onPressed: () => context.pushNamed(AppRouteNames.arenaClassPayouts),
          ),
        ],
      ),
    );
  }
}

class _TeacherCard extends StatelessWidget {
  const _TeacherCard({
    required this.teacher,
    required this.stats,
    required this.month,
    required this.payout,
    required this.onOpen,
    required this.onEditModel,
  });

  final ArenaClassTeacher teacher;
  final ArenaClassTeacherStats? stats;
  final String month;

  /// null = quem vê não lê o financeiro (sem repasse no cartão).
  final ({ArenaClassTeacherPayoutPreview? toPay, bool loaded})? payout;
  final VoidCallback? onOpen;

  /// Só o gestor.
  final VoidCallback? onEditModel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = teacher;
    final color = arenaClassTeacherColor(t.color);
    final s = stats ?? const ArenaClassTeacherStats();
    final sub = [
      if (t.specialty != null) t.specialty!,
      '${s.classesPerWeek} aula${s.classesPerWeek == 1 ? '' : 's'}/sem',
      '${s.students} aluno${s.students == 1 ? '' : 's'}',
    ].join(' · ');

    final header = Row(
      children: [
        ArenaClassAvatar(
          initials: arenaClassInitials(t.name),
          photoUrl: t.photoUrl,
          color: color,
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      t.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  if (!t.isActive) ...[
                    const SizedBox(width: 6),
                    ArenaClassTag(
                      label: 'Arquivado',
                      color: colors.onSurfaceMuted,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 2),
              Text(
                sub,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
              ),
            ],
          ),
        ),
        if (onOpen != null)
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: colors.onSurfaceMuted,
          ),
      ],
    );

    final p = payout;
    final card = ArenaClassPanel(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          header,
          if (p != null) ...[
            const SizedBox(height: 11),
            Container(
              padding: const EdgeInsets.only(top: 10),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.08),
                  ),
                ),
              ),
              child: Row(
                children: [
                  Expanded(child: _ModelCell(t: t, onEdit: onEditModel)),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      ArenaClassKicker(
                        'A pagar · ${arenaClassMonthShortLabel(month)}',
                      ),
                      const SizedBox(height: 4),
                      Text(
                        !p.loaded ? '—' : formatBRL(p.toPay?.amountReais ?? 0),
                        style: AppTypography.mono(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brand,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );

    final body = Opacity(opacity: t.isActive ? 1 : 0.6, child: card);
    if (onOpen == null) return body;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onOpen, child: body),
    );
  }
}

/// "Repasse · 50% da receita" — tocável pelo gestor ("Definir repasse").
class _ModelCell extends StatelessWidget {
  const _ModelCell({required this.t, required this.onEdit});

  final ArenaClassTeacher t;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final undefined = t.payout == null;
    final label = undefined && onEdit != null
        ? 'Definir repasse'
        : arenaClassPayoutModelLabel(t.payout);
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ArenaClassKicker('Repasse'),
        const SizedBox(height: 4),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: undefined ? colors.pending : colors.onSurface,
                ),
              ),
            ),
            if (onEdit != null) ...[
              const SizedBox(width: 6),
              Icon(
                Icons.edit_outlined,
                size: 14,
                color: undefined ? colors.pending : AppColors.brand,
                semanticLabel: 'Alterar repasse',
              ),
            ],
          ],
        ),
      ],
    );
    if (onEdit == null) return content;
    return InkWell(
      onTap: onEdit,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: content,
      ),
    );
  }
}
