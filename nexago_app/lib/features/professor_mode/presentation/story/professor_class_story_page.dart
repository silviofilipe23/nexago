import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/booking_story.dart';
import '../../../arenas/presentation/widgets/booking_story/booking_story_editor.dart';
import '../../../athlete/domain/agenda/class_story.dart';
import '../../../athlete/domain/agenda/class_story_tag.dart';
import '../../../athlete/domain/agenda/teacher_class_roster.dart';
import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../athlete/presentation/widgets/agenda/class_story_card.dart';
import '../../domain/professor_class_story.dart';
import '../../infrastructure/professor_class_story_repository.dart';
import '../../infrastructure/professor_students_repository.dart';

/// G2 · Postar no story — o editor do story do treino pelo professor: mesmo
/// editor e mesma arte do story do aluno, com o plano do treino e "Marcar
/// alunos". Marcados = presentes que liberaram a marcação no perfil; ao postar,
/// `shareClassStory` grava o card de cada um e manda o aviso de repostar (G3).
class ProfessorClassStoryPage extends ConsumerStatefulWidget {
  const ProfessorClassStoryPage({
    super.key,
    required this.roster,
    this.plan = const [],
  });

  final TeacherClassRoster roster;
  final List<ClassStoryPlanBlock> plan;

  @override
  ConsumerState<ProfessorClassStoryPage> createState() =>
      _ProfessorClassStoryPageState();
}

class _ProfessorClassStoryPageState
    extends ConsumerState<ProfessorClassStoryPage>
    with BookingStoryEditorMixin {
  final Set<ClassStoryInfo> _hidden = {};
  bool _tagging = false;

  void _toggleInfo(ClassStoryInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  Future<void> _post(
    Set<ClassStoryInfo> infos,
    List<TeacherClassRosterStudent> tagged,
  ) async {
    if (storyBusy || _tagging) return;
    if (infos.contains(ClassStoryInfo.people) && tagged.isNotEmpty) {
      setState(() => _tagging = true);
      try {
        final r = await ref
            .read(professorClassStoryRepositoryProvider)
            .shareClassStory(
              sessionId: widget.roster.session.sessionId,
              studentIds: [for (final s in tagged) s.studentId],
              plan: widget.plan,
              infos: infos,
            );
        if (mounted && r.notified > 0) {
          showAppSnackBar(
            context,
            r.notified == 1
                ? '1 aluno recebeu o aviso para repostar.'
                : '${r.notified} alunos receberam o aviso para repostar.',
          );
        }
      } on ProfessorStudentsException catch (e) {
        if (mounted) showAppSnackBar(context, e.message, isError: true);
      } finally {
        if (mounted) setState(() => _tagging = false);
      }
      if (!mounted) return;
    }
    await shareStory(
      caption: professorClassStoryShareText(widget.roster.session),
      fileName: 'nexago_treino.png',
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.roster.session;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final present = widget.roster.students.where((s) => s.isPresent).length;
    final taggable = professorStoryTaggable(widget.roster);
    final data = professorClassStoryData(
      className: session.className,
      arenaName: session.arenaName,
      courtName: session.courtName,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      presentCount: present,
      plan: widget.plan,
      tagged: [
        for (final s in taggable)
          BookingStoryPerson(
            firstName: s.name.split(RegExp(r'\s+')).first,
            initials: classStoryInitials(s.name),
            avatarUrl: s.photoUrl,
          ),
      ],
      teacherName:
          profile == null ? '' : athleteDisplayName(profile, fallback: ''),
      teacherNickname: profile?.nickname,
    );
    final available = classStoryInfosFor(data);
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };
    final tagging = infos.contains(ClassStoryInfo.people);

    final String note;
    if (taggable.isEmpty) {
      note = present == 0
          ? 'Ninguém presente na chamada: o story sai sem alunos marcados.'
          : 'Nenhum aluno presente liberou a marcação no story. Ela fica em '
              'Privacidade, no perfil de cada aluno.';
    } else if (tagging) {
      note = 'Só aparecem alunos que liberaram imagem no perfil '
          '(${taggable.length} de $present). Eles recebem um aviso para '
          'repostar.';
    } else {
      note = 'Nenhum aluno é marcado nem aparece no story.';
    }

    return BookingStoryEditorScaffold(
      title: 'Postar no story',
      cardKey: storyCardKey,
      card: ClassStoryCard(
        data: data,
        theme: storyTheme,
        infos: infos,
        photo: storyPhoto,
      ),
      theme: storyTheme,
      photo: storyPhoto,
      busy: storyBusy || _tagging,
      onPickPhoto: pickStoryPhoto,
      onSelectTheme: selectStoryTheme,
      onSave: () => shareStory(fileName: 'nexago_treino.png'),
      onPost: () => _post(infos, taggable),
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('professor-story-info-${info.name}'),
            label: info == ClassStoryInfo.people ? 'Marcar alunos' : info.label,
            selected: infos.contains(info),
            onTap: () => _toggleInfo(info),
          ),
      ],
      infoFooter: Text(
        note,
        key: const Key('professor-story-tag-note'),
        style: AppTypography.soraRegular(
          fontSize: 11.5,
          fontWeight: FontWeight.w500,
          height: 1.45,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}
