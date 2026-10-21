/// Cancelar aula pelo professor (E5a–E5d): motivos que os alunos veem e o
/// que o servidor devolve para a confirmação.

/// Motivo do cancelamento — os ids são os do servidor
/// (`CANCEL_REASON_LABELS` em `functions/src/arena-class.ts`).
enum ProfessorCancelReason {
  rain('rain', 'Chuva / clima'),
  personal('personal', 'Imprevisto pessoal'),
  health('health', 'Saúde'),
  court('maintenance', 'Quadra indisponível'),
  other('other', 'Outro');

  const ProfessorCancelReason(this.id, this.label);

  final String id;
  final String label;
}

/// Resposta de `cancelArenaClassSession` (E5d). Servidor antigo não manda os
/// números novos: ficam nulos e a tela não mostra a linha.
class ProfessorSessionCancelResult {
  const ProfessorSessionCancelResult({
    required this.notified,
    required this.credited,
    this.recipients,
    this.creditValidityDays,
    this.managerNotified = false,
  });

  factory ProfessorSessionCancelResult.fromMap(Map<String, Object?> map) {
    int? n(String key) => map[key] is num ? (map[key]! as num).toInt() : null;
    return ProfessorSessionCancelResult(
      notified: n('notified') ?? 0,
      credited: n('credited') ?? 0,
      recipients: n('recipients'),
      creditValidityDays: n('creditValidityDays'),
      managerNotified: map['managerNotified'] == true,
    );
  }

  final int notified;
  final int credited;

  /// Alunos com conta na aula (o "6" de "6/6").
  final int? recipients;
  final int? creditValidityDays;
  final bool managerNotified;
}

/// "começa em 2h" / "começa em 40 min" / "já começou".
String professorStartsInLabel(DateTime start, DateTime now) {
  final d = start.difference(now);
  if (d.isNegative) return 'já começou';
  if (d.inMinutes < 60) return 'começa em ${d.inMinutes} min';
  if (d.inHours < 24) return 'começa em ${d.inHours}h';
  final days = d.inDays;
  return 'começa em $days dia${days == 1 ? '' : 's'}';
}

/// Tom do valor de uma linha de impacto.
enum ProfessorCancelTone { normal, win, live }

/// Uma linha do quadro "o que acontece" (E5a–E5c).
class ProfessorCancelImpact {
  const ProfessorCancelImpact({
    required this.title,
    required this.sub,
    required this.value,
    this.tone = ProfessorCancelTone.normal,
  });

  final String title;
  final String sub;
  final String value;
  final ProfessorCancelTone tone;
}

/// E5d — a frase de cima: "Intermediário B · hoje 19:00. Os 6 alunos foram
/// avisados e receberam 1 crédito."
String professorSessionCanceledMessage({
  required String className,
  required String when,
  required ProfessorSessionCancelResult result,
}) {
  final n = result.notified;
  final who = n == 0
      ? 'Nenhum aluno com conta foi avisado'
      : n == 1
          ? 'O aluno foi avisado'
          : 'Os $n alunos foram avisados';
  final credit = result.credited > 0
      ? ' e ${n == 1 ? 'recebeu' : 'receberam'} 1 crédito de reposição'
      : '';
  return '$className · $when. $who$credit.';
}

/// E5d — o quadro: avisados (n/total), créditos com a validade da arena e a
/// quadra liberada.
List<ProfessorCancelImpact> professorSessionCanceledRows({
  required String court,
  required ProfessorSessionCancelResult result,
}) {
  final total = result.recipients;
  final days = result.creditValidityDays;
  return [
    ProfessorCancelImpact(
      title: 'Avisados',
      sub: 'Push para cada aluno com conta',
      value: total == null ? '${result.notified}' : '${result.notified}/$total',
      tone: total != null && result.notified >= total
          ? ProfessorCancelTone.win
          : ProfessorCancelTone.normal,
    ),
    if (result.credited > 0)
      ProfessorCancelImpact(
        title: 'Créditos de reposição',
        sub: days == null ? 'No prazo da arena' : 'Valem $days dias',
        value: '${result.credited}',
      ),
    ProfessorCancelImpact(
      title: court,
      sub: result.managerNotified
          ? 'Gestão da arena avisada'
          : 'Volta para a agenda da arena',
      value: 'Liberada',
    ),
  ];
}
