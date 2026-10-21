import 'package:flutter/foundation.dart';

import '../../../../core/deep_link/app_domains.dart';
import '../../../arenas/domain/booking_story.dart';
import 'class_story.dart';

/// Blocos que cabem no plano da arte (mesmo teto da `shareClassStory`).
const int kClassStoryPlanMaxBlocks = 5;

/// Texto de um bloco do plano (mesmo teto da `shareClassStory`).
const int kClassStoryPlanLabelMax = 40;

/// Um bloco do plano do treino: `10′ Aquecimento`.
@immutable
class ClassStoryPlanBlock {
  const ClassStoryPlanBlock({required this.minutes, required this.label});

  final int minutes;
  final String label;

  Map<String, Object> toMap() => {'minutes': minutes, 'label': label};

  (String, String) get artLine => ('$minutes′', label);

  @override
  bool operator ==(Object other) =>
      other is ClassStoryPlanBlock &&
      other.minutes == minutes &&
      other.label == label;

  @override
  int get hashCode => Object.hash(minutes, label);
}

/// O story que o professor postou e em que o aluno foi marcado —
/// `classStoryTags/{sessionId}_{uid}` (só o próprio aluno lê; grava a
/// `shareClassStory`). Traz só o que a arte mostra.
@immutable
class ClassStoryTag {
  const ClassStoryTag({
    required this.id,
    required this.className,
    required this.classType,
    required this.arenaName,
    required this.courtName,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.teacherName,
    required this.teacherHandle,
    required this.presentCount,
    required this.plan,
    required this.showPlan,
    required this.showNumbers,
    required this.showPlace,
    required this.people,
    required this.taggedCount,
  });

  factory ClassStoryTag.fromMap(String id, Map<String, Object?> map) {
    String s(String key) {
      final v = map[key];
      return v is String ? v.trim() : '';
    }

    final show = map['show'];
    bool flag(String key) => show is! Map || show[key] != false;
    final rawPlan = map['plan'];
    final rawPeople = map['people'];
    final count = map['presentCount'];
    final tagged = map['taggedCount'];
    final people = [
      if (rawPeople is List)
        for (final p in rawPeople.whereType<Map>())
          BookingStoryPerson(
            firstName: p['firstName'] is String ? p['firstName'] as String : '',
            initials: p['initials'] is String ? p['initials'] as String : '?',
            avatarUrl: p['photoUrl'] is String &&
                    (p['photoUrl'] as String).trim().isNotEmpty
                ? p['photoUrl'] as String
                : null,
          ),
    ];
    return ClassStoryTag(
      id: id,
      className: s('className'),
      classType: s('classType').isEmpty ? 'turma' : s('classType'),
      arenaName: s('arenaName'),
      courtName: s('courtName'),
      date: s('date'),
      startTime: s('startTime'),
      endTime: s('endTime'),
      teacherName: s('teacherName'),
      teacherHandle: s('teacherHandle'),
      presentCount: count is num ? count.toInt() : 0,
      plan: [
        if (rawPlan is List)
          for (final b in rawPlan.whereType<Map>())
            if (b['minutes'] is num && b['label'] is String)
              ClassStoryPlanBlock(
                minutes: (b['minutes'] as num).toInt(),
                label: (b['label'] as String).trim(),
              ),
      ],
      showPlan: flag('plan'),
      showNumbers: flag('numbers'),
      showPlace: flag('place'),
      people: people,
      taggedCount: tagged is num ? tagged.toInt() : people.length,
    );
  }

  final String id;
  final String className;
  final String classType;
  final String arenaName;
  final String courtName;
  final String date;
  final String startTime;
  final String endTime;
  final String teacherName;

  /// `@prof.thiago` ou vazio (professor sem apelido).
  final String teacherHandle;
  final int presentCount;
  final List<ClassStoryPlanBlock> plan;
  final bool showPlan;
  final bool showNumbers;
  final bool showPlace;

  /// Os marcados (só quem liberou a marcação), até 6.
  final List<BookingStoryPerson> people;
  final int taggedCount;

  String get teacherFirstName {
    final t = teacherName.trim();
    return t.isEmpty ? '' : t.split(RegExp(r'\s+')).first;
  }

  /// O que o professor ligou na arte dele vale para o repost.
  Set<ClassStoryInfo> get infos => {
        if (showPlan) ClassStoryInfo.plan,
        if (showNumbers) ClassStoryInfo.numbers,
        if (showPlace) ClassStoryInfo.place,
        ClassStoryInfo.people,
      };
}

/// `KICKER` + números + local, iguais nas duas artes (professor e repost).
({String kicker, List<(String, String)> stats, String placeLine, String when})
    _classStoryCommon({
  required String className,
  required String courtName,
  required String date,
  required String startTime,
  required String endTime,
  required int presentCount,
  required int planBlocks,
}) {
  final name = className.trim();
  final weekday = classWeekdayShort(date);
  final start = startTime.length >= 5 ? startTime.substring(0, 5) : startTime;
  final minutes = classMinutesBetween(startTime, endTime);
  return (
    kicker: name.isEmpty ? 'AULA' : 'AULA · ${name.toUpperCase()}',
    stats: [
      if (minutes != null) ('$minutes', 'MIN'),
      if (presentCount > 0)
        ('$presentCount', presentCount == 1 ? 'ALUNO' : 'ALUNOS'),
      if (planBlocks > 0) ('$planBlocks', planBlocks == 1 ? 'BLOCO' : 'BLOCOS'),
    ],
    placeLine: [
      if (courtName.trim().isNotEmpty) courtName.trim(),
      [weekday, start].where((s) => s.isNotEmpty).join(' '),
    ].where((s) => s.isNotEmpty).map((s) => ' · $s').join(),
    when: [weekday, start].where((s) => s.isNotEmpty).join(' '),
  );
}

/// `com Marina, Elisa e +3`.
String classStoryWithLine(List<BookingStoryPerson> people, {int? total}) {
  final names = [
    for (final p in people)
      if (p.firstName.trim().isNotEmpty) p.firstName.trim(),
  ];
  final count = total ?? names.length;
  if (names.isEmpty) return '';
  if (count <= 2) return 'com ${names.join(' e ')}';
  return 'com ${names.take(2).join(', ')} e +${count - 2}';
}

/// G2 — a arte do PROFESSOR: o @ dele, os alunos marcados nos avatares.
ClassStoryData professorClassStoryData({
  required String className,
  required String arenaName,
  required String courtName,
  required String date,
  required String startTime,
  required String endTime,
  required int presentCount,
  required List<ClassStoryPlanBlock> plan,
  required List<BookingStoryPerson> tagged,
  required String teacherName,
  String? teacherNickname,
}) {
  final common = _classStoryCommon(
    className: className,
    courtName: courtName,
    date: date,
    startTime: startTime,
    endTime: endTime,
    presentCount: presentCount,
    planBlocks: plan.length,
  );
  final nickname = teacherNickname?.trim() ?? '';
  final first = teacherName.trim().isEmpty
      ? ''
      : teacherName.trim().split(RegExp(r'\s+')).first;
  return ClassStoryData(
    kicker: common.kicker,
    stats: common.stats,
    arenaName: arenaName.trim(),
    placeLine: common.placeLine,
    handle: nickname.isNotEmpty
        ? '@$nickname'
        : (first.isEmpty ? '' : 'Prof. $first'),
    withLine: classStoryWithLine(tagged),
    noPeopleLine:
        [className.trim(), common.when].where((s) => s.isNotEmpty).join(' · '),
    people: tagged.take(6).toList(),
    plan: [for (final b in plan) b.artLine],
    footer: 'TREINE COMIGO · ${AppDomains.siteHost.toUpperCase()}',
  );
}

/// G3 — o repost do ALUNO marcado: o mesmo treino com o @ dele na assinatura.
ClassStoryData taggedClassStoryData({
  required ClassStoryTag tag,
  required String athleteName,
  String? athleteNickname,
}) {
  final common = _classStoryCommon(
    className: tag.className,
    courtName: tag.courtName,
    date: tag.date,
    startTime: tag.startTime,
    endTime: tag.endTime,
    presentCount: tag.presentCount,
    planBlocks: tag.showPlan ? tag.plan.length : 0,
  );
  final nickname = athleteNickname?.trim() ?? '';
  final name = athleteName.trim();
  final firstName = name.isEmpty ? '' : name.split(RegExp(r'\s+')).first;
  final teacher = tag.teacherFirstName;
  final withParts = [
    if (teacher.isNotEmpty) 'Prof. $teacher',
    if (tag.classType == 'turma') 'a turma',
  ];
  return ClassStoryData(
    kicker: common.kicker,
    stats: common.stats,
    arenaName: tag.arenaName,
    placeLine: common.placeLine,
    handle: nickname.isNotEmpty ? '@$nickname' : firstName,
    withLine: withParts.isEmpty ? '' : 'com ${withParts.join(' e ')}',
    noPeopleLine:
        [tag.className, common.when].where((s) => s.isNotEmpty).join(' · '),
    people: tag.people,
    plan: [for (final b in tag.plan) b.artLine],
    footer: 'TREINE TAMBÉM · ${AppDomains.siteHost.toUpperCase()}',
  );
}
