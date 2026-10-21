import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/class_presence.dart';
import '../infrastructure/class_presence_repository.dart';

/// T7 · Escolher reposição: aulas do mesmo nível na mesma arena, com vaga,
/// onde o crédito pode ser usado. Lotada = entrar na fila da turma.
class AthleteTrainingMakeupPage extends ConsumerStatefulWidget {
  const AthleteTrainingMakeupPage({super.key, this.creditId});

  /// Crédito a usar; sem ele, o que vence primeiro.
  final String? creditId;

  @override
  ConsumerState<AthleteTrainingMakeupPage> createState() =>
      _AthleteTrainingMakeupPageState();
}

class _AthleteTrainingMakeupPageState
    extends ConsumerState<AthleteTrainingMakeupPage> {
  String? _creditId;
  String? _selected;
  bool _saving = false;
  String? _error;

  ClassMakeupCredit? _credit(List<ClassMakeupCredit> credits) {
    if (credits.isEmpty) return null;
    final wanted = _creditId ?? widget.creditId;
    return credits.firstWhere(
      (c) => c.creditId == wanted,
      orElse: () => credits.first,
    );
  }

  /// Seleção padrão: a primeira com vaga do mesmo professor, senão a primeira
  /// com vaga.
  ClassMakeupOption? _selectedOption(List<ClassMakeupOption> options) {
    for (final o in options) {
      if (o.sessionId == _selected) return o;
    }
    final open = options.where((o) => !o.full).toList();
    if (open.isEmpty) return null;
    return open.firstWhere((o) => o.sameTeacher, orElse: () => open.first);
  }

  Future<void> _submit(ClassMakeupCredit credit, ClassMakeupOption o) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final repo = ref.read(classPresenceRepositoryProvider);
    try {
      final String message;
      if (o.full) {
        final already = await repo.joinWaitlist(
            creditId: credit.creditId, classId: o.classId);
        message = already
            ? 'Você já está na fila desta turma.'
            : 'Você entrou na fila. A arena avisa quando abrir vaga.';
      } else {
        await repo.bookMakeup(
            creditId: credit.creditId, sessionId: o.sessionId);
        message = 'Reposição marcada: ${makeupOptionWhen(o)}.';
      }
      refreshAthleteClassPresence(ref);
      ref.invalidate(athleteClassMakeupOptionsProvider(credit.creditId));
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
      if (!o.full) popOrGo(context, AppRoutes.athleteTrainingClasses);
    } on ClassPresenceException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final creditsAsync = ref.watch(athleteClassCreditsProvider);
    final credits = creditsAsync.valueOrNull;
    final credit = credits == null ? null : _credit(credits);
    final options = credit == null
        ? null
        : ref.watch(athleteClassMakeupOptionsProvider(credit.creditId));
    final list = options?.valueOrNull;
    final picked = list == null ? null : _picked(list);

    final subtitle = credit == null
        ? 'REPOSIÇÃO'
        : '${credits!.length} ${credits.length == 1 ? 'CRÉDITO' : 'CRÉDITOS'}'
            ' · VÁLIDO ATÉ ${classDayMonthLabel(credit.expiresOn).toUpperCase()}';

    return ProfessorLinksScaffold(
      title: 'Escolher reposição',
      subtitle: subtitle,
      onBack: () => popOrGo(context, AppRoutes.athleteTrainingClasses),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (credits == null)
                  const _Loading()
                else if (credit == null)
                  const ProfessorLinksCard(
                    key: Key('training-makeup-no-credit'),
                    child: ProfessorMutedText(
                      'Você não tem crédito de reposição. Avisando que não vai '
                      'com antecedência, a aula perdida vira um crédito.',
                    ),
                  )
                else ...[
                  if (credits.length > 1) ...[
                    _CreditChips(
                      credits: credits,
                      selected: credit.creditId,
                      onChanged: (id) => setState(() {
                        _creditId = id;
                        _selected = null;
                      }),
                    ),
                    const SizedBox(height: 12),
                  ],
                  _Intro(credit: credit),
                  const SizedBox(height: 12),
                  if (options == null || options.isLoading && list == null)
                    const _Loading()
                  else if (options.hasError && list == null)
                    ProfessorLinksNote(
                      options.error is ClassPresenceException
                          ? (options.error! as ClassPresenceException).message
                          : 'Não foi possível carregar as turmas.',
                      tone: ProfessorLinksNoteTone.red,
                    )
                  else if (list!.isEmpty)
                    const ProfessorLinksCard(
                      key: Key('training-makeup-empty'),
                      child: ProfessorMutedText(
                        'Nenhuma turma do seu nível com aula até o crédito '
                        'vencer. Fale com a arena.',
                      ),
                    )
                  else
                    for (final o in list) ...[
                      _OptionRow(
                        option: o,
                        selected: picked?.sessionId == o.sessionId,
                        onTap: () => setState(() => _selected = o.sessionId),
                      ),
                      const SizedBox(height: 8),
                    ],
                  if (_error != null) ...[
                    const SizedBox(height: 4),
                    ProfessorLinksNote(_error!,
                        tone: ProfessorLinksNoteTone.red),
                  ],
                ],
              ],
            ),
          ),
          if (credit != null && list != null && list.isNotEmpty)
            SafeArea(
              top: false,
              minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: ProfessorLinksPrimaryButton(
                key: const Key('training-makeup-submit'),
                label: picked == null
                    ? 'Escolha uma turma'
                    : picked.full
                        ? 'Entrar na fila da turma'
                        : 'Repor em ${makeupOptionWhen(picked)}',
                loading: _saving,
                onPressed:
                    picked == null ? null : () => _submit(credit, picked),
              ),
            ),
        ],
      ),
    );
  }

  /// O que o botão vai fazer: a escolhida (pode ser lotada → fila).
  ClassMakeupOption? _picked(List<ClassMakeupOption> list) =>
      _selectedOption(list);
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      );
}

class _Intro extends StatelessWidget {
  const _Intro({required this.credit});

  final ClassMakeupCredit credit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final level = classLevelLabel(credit.level);
    final turmas = level.isEmpty ? 'Turmas' : 'Turmas do nível $level';
    return Text(
      '$turmas na ${credit.arenaName} com vaga. A reposição não muda sua '
      'turma fixa.',
      style: AppTypography.bodyS.copyWith(
        fontSize: 12.5,
        height: 1.45,
        color: ProfessorLinksStyle.dim(colors),
      ),
    );
  }
}

class _CreditChips extends StatelessWidget {
  const _CreditChips({
    required this.credits,
    required this.selected,
    required this.onChanged,
  });

  final List<ClassMakeupCredit> credits;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (i, c) in credits.indexed) ...[
            if (i > 0) const SizedBox(width: 6),
            AvailabilityChoiceChip(
              key: Key('training-makeup-credit-${c.creditId}'),
              label: '${c.className} · até ${classDayMonthLabel(c.expiresOn)}',
              selected: c.creditId == selected,
              onTap: () => onChanged(c.creditId),
            ),
          ],
        ],
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final ClassMakeupOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final o = option;
    final who = [
      trainingFirstName(o.teacherName),
      if (o.sameTeacher) 'seu professor',
    ].where((s) => s.isNotEmpty).join(' · ');
    final spots = o.full
        ? 'LOTADA'
        : o.spotsLeft == 1
            ? '1 VAGA'
            : '${o.spotsLeft} VAGAS';
    return ProfessorLinksCard(
      key: Key('training-makeup-option-${o.sessionId}'),
      padding: const EdgeInsets.all(13),
      onTap: onTap,
      borderColor: selected ? AppColors.brand.withValues(alpha: 0.5) : null,
      backgroundColor:
          selected ? AppColors.brand.withValues(alpha: 0.08) : null,
      child: Opacity(
        opacity: o.full && !selected ? 0.6 : 1,
        child: Row(
          children: [
            SizedBox(
              width: 50,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    trainingWeekdayDay(o.date),
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  Text(
                    o.startTime,
                    style:
                        ProfessorLinksStyle.mono(14, color: colors.onSurface),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    o.className,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (who.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        ArenaClassAvatar(
                          initials: arenaClassInitials(o.teacherName),
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            who,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  spots,
                  style: ProfessorLinksStyle.mono(
                    10,
                    color:
                        colors.readableTone(o.full ? colors.live : colors.win),
                  ),
                ),
                if (o.full) ...[
                  const SizedBox(height: 3),
                  Text(
                    'Entrar na fila',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: colors.brandText,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(width: 10),
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  width: 2,
                  color: selected
                      ? AppColors.brand
                      : ProfessorLinksStyle.line2(colors),
                ),
              ),
              alignment: Alignment.center,
              child: selected
                  ? Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        color: AppColors.brand,
                        shape: BoxShape.circle,
                      ),
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}
