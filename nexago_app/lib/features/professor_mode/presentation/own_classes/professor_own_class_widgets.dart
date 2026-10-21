import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_own_classes_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_own_classes.dart';
import '../../domain/professor_wallet.dart';
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';

/// Contexto da tela (protótipo `PaCtx ctx="IND"`): a arena e o tipo do
/// vínculo, em azul. Com mais de uma arena, o toque troca.
class ProfessorOwnClassCtx extends StatelessWidget {
  const ProfessorOwnClassCtx({
    super.key,
    required this.arenaName,
    this.logoUrl,
    this.onTap,
  });

  final String arenaName;
  final String? logoUrl;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(7, 7, 10, 7),
      onTap: onTap,
      child: Row(
        children: [
          ProfessorArenaMark(name: arenaName, logoUrl: logoUrl, size: 28),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  arenaName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                Text(
                  'INDEPENDENTE',
                  style: ProfessorLinksStyle.mono(
                    9,
                    color: colors.readableTone(ProfessorLinksStyle.blue),
                  ),
                ),
              ],
            ),
          ),
          if (onTap != null)
            Icon(
              Icons.swap_horiz_rounded,
              size: 16,
              color: ProfessorLinksStyle.dim(colors),
            ),
        ],
      ),
    );
  }
}

/// Selo azul "PRÓPRIA" (turma do professor independente).
class ProfessorOwnClassBadge extends StatelessWidget {
  const ProfessorOwnClassBadge({super.key});

  @override
  Widget build(BuildContext context) => ArenaClassTag(
        label: 'Própria',
        color: context.themeColors.readableTone(ProfessorLinksStyle.blue),
        background: ProfessorLinksStyle.blue.withValues(alpha: 0.12),
      );
}

/// Cor da situação da série: ativa em verde, pausada em amarelo, cancelada
/// em vermelho.
Color professorOwnClassSeriesColor(ProfessorOwnClassSeriesStatus s) =>
    switch (s) {
      ProfessorOwnClassSeriesStatus.active => AppColors.win,
      ProfessorOwnClassSeriesStatus.paused => AppColors.pending,
      ProfessorOwnClassSeriesStatus.canceled => AppColors.live,
    };

/// Um chip por dia da turma com a situação da série na arena ("Ter · ativo",
/// "Qui · pausado pela arena"…).
class ProfessorOwnClassSeriesChips extends StatelessWidget {
  const ProfessorOwnClassSeriesChips({super.key, required this.cls});

  final ProfessorOwnClass cls;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final d in cls.weekdays)
          Builder(builder: (context) {
            final status = cls.seriesStatusOf(d);
            final tone = colors.readableTone(
              professorOwnClassSeriesColor(status),
            );
            return Container(
              key: Key('professor-own-class-series-$d'),
              padding: const EdgeInsets.fromLTRB(8, 5, 10, 5),
              decoration: BoxDecoration(
                color: professorOwnClassSeriesColor(status)
                    .withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration:
                        BoxDecoration(color: tone, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    professorOwnClassSeriesLabel(d, status),
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: status == ProfessorOwnClassSeriesStatus.active
                          ? colors.onSurface
                          : tone,
                    ),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}

/// Arena da turma: com uma só, vai direto; com mais, pergunta numa folha.
Future<String?> pickProfessorOwnClassArena(
  BuildContext context,
  List<ArenaProfessorLink> arenas,
) async {
  if (arenas.isEmpty) return null;
  if (arenas.length == 1) return arenas.first.arenaId;
  return showProfessorLinksSheet<String>(
    context,
    builder: (sheetContext) => ProfessorLinksSheetBody(
      title: 'Em qual arena?',
      subtitle: 'O horário fixo segue as regras da arena',
      children: [
        for (final l in arenas) ...[
          const SizedBox(height: 8),
          ProfessorLinksCard(
            key: Key('professor-own-class-arena-${l.arenaId}'),
            onTap: () => Navigator.of(sheetContext).pop(l.arenaId),
            child: Row(
              children: [
                ProfessorArenaMark(
                  name: l.arenaName,
                  logoUrl: l.arenaLogoUrl,
                  size: 36,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l.arenaName,
                    style: ProfessorLinksStyle.display(
                      14,
                      weight: FontWeight.w600,
                      color: sheetContext.themeColors.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    ),
  );
}

/// Cartão da turma própria no Minhas turmas.
class ProfessorOwnClassCard extends StatelessWidget {
  const ProfessorOwnClassCard({
    super.key,
    required this.cls,
    required this.onTap,
  });

  final ProfessorOwnClass cls;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = cls;
    final percent = c.capacity <= 0
        ? 0
        : ((c.studentCount * 100) / c.capacity).round().clamp(0, 100);
    return ProfessorLinksCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  c.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    17,
                    weight: FontWeight.w700,
                    color: c.isActive
                        ? colors.onSurface
                        : ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (professorOwnClassSeriesTag(c) case final tag?) ...[
                ArenaClassTag(
                  key: Key('professor-own-class-series-tag-${c.id}'),
                  label: tag,
                  color: AppColors.pending,
                ),
                const SizedBox(width: 6),
              ],
              if (c.isActive)
                const ProfessorOwnClassBadge()
              else
                ArenaClassTag(
                  label: 'Encerrada',
                  color: ProfessorLinksStyle.mute(colors),
                ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            professorOwnClassScheduleLabel(c),
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          Text(
            '${c.courtName} · ${c.arenaName}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          if (c.isActive) ...[
            const SizedBox(height: 13),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'ALUNOS',
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      weight: FontWeight.w600,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
                Text(
                  '${c.studentCount}/${c.capacity}',
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ProfessorMeter(percent: percent),
          ],
        ],
      ),
    );
  }
}

/// "Editar alunos": alunos ATIVOS da carteira, até o número de vagas.
/// Devolve os que ENTRARAM (para oferecer a cobrança) ou `null` sem salvar.
Future<List<String>?> showProfessorOwnClassStudentsSheet(
  BuildContext context,
  ProfessorOwnClass cls,
) =>
    showProfessorLinksSheet<List<String>>(
      context,
      builder: (_) => _OwnClassStudentsSheet(cls: cls),
    );

class _OwnClassStudentsSheet extends ConsumerStatefulWidget {
  const _OwnClassStudentsSheet({required this.cls});

  final ProfessorOwnClass cls;

  @override
  ConsumerState<_OwnClassStudentsSheet> createState() =>
      _OwnClassStudentsSheetState();
}

class _OwnClassStudentsSheetState
    extends ConsumerState<_OwnClassStudentsSheet> {
  List<String>? _picked;
  bool _saving = false;

  Future<void> _save(List<String> ids) async {
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref
          .read(professorOwnClassesRepositoryProvider)
          .setStudents(widget.cls.id, ids),
      message: 'Alunos da turma salvos.',
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop([
        for (final id in ids)
          if (!widget.cls.studentIds.contains(id)) id,
      ]);
    } else {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cls = widget.cls;
    final students = [
      for (final s in ref.watch(professorWalletStudentsProvider).valueOrNull ??
          const <ProfessorWalletStudent>[])
        if (s.active) s,
    ];
    final activeIds = {for (final s in students) s.athleteId};
    // Quem saiu da carteira não volta no salvar (o servidor recusaria tudo).
    final picked = _picked ??
        [
          for (final id in cls.studentIds)
            if (activeIds.contains(id)) id,
        ];
    final full = picked.length >= cls.capacity;
    final dropped = cls.studentIds.length - picked.length;

    return ProfessorLinksSheetBody(
      title: 'Alunos da turma',
      subtitle: '${picked.length} de ${cls.capacity} vagas · só alunos ativos '
          'da sua carteira',
      children: [
        if (_picked == null && dropped > 0) ...[
          const SizedBox(height: 10),
          ProfessorLinksNote(
            dropped == 1
                ? '1 aluno não está mais ativo na carteira e sai da turma ao '
                    'salvar.'
                : '$dropped alunos não estão mais ativos na carteira e saem '
                    'da turma ao salvar.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
        ],
        const SizedBox(height: 6),
        if (students.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: ProfessorMutedText(
              'Nenhum aluno ativo na carteira. Convide alunos em Carteira › '
              'Adicionar.',
            ),
          ),
        for (final s in students) ...[
          const SizedBox(height: 8),
          ArenaClassChoiceCard(
            key: Key('professor-own-class-pick-${s.athleteId}'),
            title: s.name,
            multi: true,
            selected: picked.contains(s.athleteId),
            dimmed: full && !picked.contains(s.athleteId),
            trailing: ArenaClassAvatar(
              initials: arenaClassInitials(s.name),
              photoUrl: s.photoUrl,
              size: 32,
            ),
            onTap: () => setState(() {
              final next = List.of(picked);
              if (next.contains(s.athleteId)) {
                next.remove(s.athleteId);
              } else if (next.length < cls.capacity) {
                next.add(s.athleteId);
              }
              _picked = next;
            }),
          ),
        ],
        if (full) ...[
          const SizedBox(height: 10),
          const ProfessorActionHint('Turma cheia: tire alguém para trocar.'),
        ],
        const SizedBox(height: 16),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-own-class-students-save'),
          label: 'Salvar alunos',
          loading: _saving,
          onPressed: () => _save(picked),
        ),
      ],
    );
  }
}

/// "Cobrar mensalidade": escolhe o aluno e abre a Nova cobrança (B15) já com
/// o preço da turma e "Repetir todo mês". [athleteIds] = quem oferecer.
Future<void> offerProfessorOwnClassCharge(
  BuildContext context, {
  required ProfessorOwnClass cls,
  required List<ProfessorWalletStudent> students,
  String title = 'Cobrar mensalidade',
  String? subtitle,
}) async {
  if (students.isEmpty) return;
  final athleteId = await showProfessorLinksSheet<String>(
    context,
    builder: (sheetContext) => ProfessorLinksSheetBody(
      title: title,
      subtitle: subtitle ??
          'Cobrança mensal de ${professorOwnClassPriceLabel(cls)} pela '
              'carteira',
      children: [
        for (final s in students) ...[
          const SizedBox(height: 8),
          ProfessorLinksCard(
            key: Key('professor-own-class-charge-${s.athleteId}'),
            onTap: () => Navigator.of(sheetContext).pop(s.athleteId),
            child: Row(
              children: [
                ArenaClassAvatar(
                  initials: arenaClassInitials(s.name),
                  photoUrl: s.photoUrl,
                  size: 32,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    s.name,
                    style: ProfessorLinksStyle.display(
                      14,
                      weight: FontWeight.w600,
                      color: sheetContext.themeColors.onSurface,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: ProfessorLinksStyle.dim(sheetContext.themeColors),
                ),
              ],
            ),
          ),
        ],
      ],
    ),
  );
  if (athleteId == null || !context.mounted) return;
  context.pushNamed(
    AppRouteNames.professorWalletCharge,
    pathParameters: {'athleteId': athleteId},
    extra: ProfessorChargePrefill(
      amountReais: cls.monthlyPriceReais,
      description: 'Mensalidade · ${cls.name}',
    ),
  );
}

/// "R$ 260,00".
String professorOwnClassPriceLabel(ProfessorOwnClass cls) =>
    professorOwnClassMoney(cls.monthlyPriceReais);

/// Reais sem centavos quando inteiro ("R$ 60"), senão com ("R$ 62,50").
String professorOwnClassMoney(double reais) {
  final whole = reais == reais.roundToDouble();
  final text = whole
      ? reais.round().toString()
      : reais.toStringAsFixed(2).replaceAll('.', ',');
  return 'R\$ $text';
}
