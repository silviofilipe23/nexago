import '../../../core/brand/nexa_hashtag.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../athlete/domain/agenda/class_story.dart';
import '../../athlete/domain/agenda/class_story_tag.dart';
import '../../athlete/domain/agenda/teacher_class_roster.dart';
import 'professor_lesson_plans.dart';

/// "Story do treino" no detalhe da aula (E4): aula dele, não cancelada, com a
/// chamada liberada pelo vínculo e que já TERMINOU (hoje depois do fim ou
/// antes de hoje). A tela G1 lista os presentes pela chamada.
bool isProfessorClassStoryAvailable(
  ClassAgendaEntry e,
  ({String todayKey, int nowMin}) now,
) {
  if (!e.isTeacher || e.isCanceled || !e.canManageLessons) return false;
  final cmp = e.date.compareTo(now.todayKey);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  final end = _minutesOfDay(e.endTime);
  return end != null && now.nowMin >= end;
}

int? _minutesOfDay(String hhmm) {
  final parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  return h == null || m == null ? null : h * 60 + m;
}

/// Números do "Treino encerrado" (G1) a partir da chamada.
({int? minutes, int present, int total, int taggable}) professorClassSummary(
  TeacherClassRoster roster,
) {
  final s = roster.session;
  return (
    minutes: classMinutesBetween(s.startTime, s.endTime),
    present: roster.students.where((x) => x.isPresent).length,
    total: roster.students.length,
    taggable:
        roster.students.where((x) => x.isPresent && x.storyTaggable).length,
  );
}

/// Quem o professor pode marcar: presente e liberou a marcação.
List<TeacherClassRosterStudent> professorStoryTaggable(
  TeacherClassRoster roster,
) =>
    [
      for (final s in roster.students)
        if (s.isPresent && s.storyTaggable) s,
    ];

/// Legenda da folha de compartilhamento do story do professor.
String professorClassStoryShareText(TeacherClassRosterSession s) {
  final where = s.arenaName.trim().isEmpty ? '' : ' na ${s.arenaName.trim()}';
  final what = s.className.trim().isEmpty ? '' : ' ${s.className.trim()}.';
  return withNexaHashtag('Treino pago$where!$what');
}

/// O plano de aula da turma (H1–H5) no "Treino encerrado": os blocos que de
/// fato rolaram — com registro pós-aula, sai o que ficou "Não rolou" ou
/// "Pulado" — com minutos e nome (nota e foco nunca vão para o story). A arte
/// cabe [kClassStoryPlanMaxBlocks]; [left] conta os que ficaram de fora.
({List<ClassStoryPlanBlock> blocks, int left}) classStoryPlanFromLessonPlan(
  LessonPlan plan,
) {
  final ratings = plan.review?.blockRatings ?? const {};
  final done = <ClassStoryPlanBlock>[];
  for (final b in plan.blocks) {
    final rating = ratings[b.id];
    if (rating == LessonBlockRating.no || rating == LessonBlockRating.skipped) {
      continue;
    }
    final name = b.name.trim();
    if (name.isEmpty) continue;
    done.add(ClassStoryPlanBlock(
      minutes: b.minutes.clamp(1, 240),
      label: name.length > kClassStoryPlanLabelMax
          ? name.substring(0, kClassStoryPlanLabelMax).trim()
          : name,
    ));
  }
  final shown = done.take(kClassStoryPlanMaxBlocks).toList();
  return (blocks: shown, left: done.length - shown.length);
}

/// Minutos somados do plano do story.
int classStoryPlanMinutes(Iterable<ClassStoryPlanBlock> plan) =>
    plan.fold(0, (sum, b) => sum + b.minutes);

/// Uma sugestão do "Novo bloco" (G1b): o nome, os minutos de costume e o selo
/// (`TÉCNICA`, `FÍSICO`, `JOGO` ou vazio).
typedef ClassStoryBlockSuggestion = ({String label, int minutes, String tag});

/// Selo da categoria do plano de aula na sugestão.
String classStoryCategoryTag(LessonPlanCategory c) => switch (c) {
      LessonPlanCategory.fisico => 'FÍSICO',
      LessonPlanCategory.jogo => 'JOGO',
      LessonPlanCategory.outro => '',
      _ => 'TÉCNICA',
    };

/// Para quem ainda não tem plano de aula nenhum.
const List<ClassStoryBlockSuggestion> kClassStoryDefaultSuggestions = [
  (label: 'Aquecimento', minutes: 10, tag: 'FÍSICO'),
  (label: 'Saque cruzado', minutes: 15, tag: 'TÉCNICA'),
  (label: 'Devolução', minutes: 15, tag: 'TÉCNICA'),
  (label: 'Voleio de rede', minutes: 10, tag: 'TÉCNICA'),
  (label: 'Jogo reduzido 2×2', minutes: 20, tag: 'JOGO'),
  (label: 'Pontos corridos', minutes: 10, tag: 'JOGO'),
];

/// Os blocos que o professor mais usa nos planos de aula (nome igual sem
/// diferença de caixa), com os minutos e a categoria mais frequentes de
/// cada. Empate: o que apareceu primeiro. `fromHistory: false` = ainda sem
/// planos, vão as sugestões padrão.
({List<ClassStoryBlockSuggestion> items, bool fromHistory})
    classStoryBlockSuggestions(Iterable<LessonPlan> plans, {int max = 6}) {
  final byKey = <String,
      ({
    String label,
    Map<int, int> minutes,
    Map<LessonPlanCategory, int> cats,
    int count,
    int order
  })>{};
  var order = 0;
  for (final plan in plans) {
    for (final b in plan.blocks) {
      var name = b.name.trim();
      if (name.isEmpty) continue;
      if (name.length > kClassStoryPlanLabelMax) {
        name = name.substring(0, kClassStoryPlanLabelMax).trim();
      }
      final key = name.toLowerCase();
      final prev = byKey[key];
      final minutes = {...?prev?.minutes};
      minutes[b.minutes] = (minutes[b.minutes] ?? 0) + 1;
      final cats = {...?prev?.cats};
      cats[b.category] = (cats[b.category] ?? 0) + 1;
      byKey[key] = (
        label: prev?.label ?? name,
        minutes: minutes,
        cats: cats,
        count: (prev?.count ?? 0) + 1,
        order: prev?.order ?? order++,
      );
    }
  }
  if (byKey.isEmpty) {
    return (
      items: kClassStoryDefaultSuggestions.take(max).toList(),
      fromHistory: false,
    );
  }
  K top<K>(Map<K, int> counts) =>
      counts.entries.reduce((a, b) => b.value > a.value ? b : a).key;
  final sorted = byKey.values.toList()
    ..sort((a, b) => a.count != b.count
        ? b.count.compareTo(a.count)
        : a.order.compareTo(b.order));
  return (
    items: [
      for (final s in sorted.take(max))
        (
          label: s.label,
          minutes: top(s.minutes).clamp(1, 240),
          tag: classStoryCategoryTag(top(s.cats)),
        ),
    ],
    fromHistory: true,
  );
}
