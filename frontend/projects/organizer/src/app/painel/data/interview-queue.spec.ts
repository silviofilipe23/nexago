import {
  EMPTY_INTERVIEW_QUEUE,
  INTERVIEW_QUEUE_MAX,
  currentItem,
  currentQuestion,
  interviewQueueFromRaw,
  queueAdd,
  queueGoTo,
  queueMove,
  queueRemove,
  queueReplaceItem,
  queueSetQuestions,
  queueSetReporter,
  queueSetShow,
  queueStepQuestion,
  questionsFromText,
  reporterOnAir,
  type InterviewQueue,
  type InterviewQueueItem,
} from './interview-queue';

function item(id: string, questions: string[] = []): InterviewQueueItem {
  return { id, kind: 'atleta', teamId: `t-${id}`, uid: `u-${id}`, label: id.toUpperCase(), photoUrl: null, questions };
}

function fila(over: Partial<InterviewQueue> = {}): InterviewQueue {
  return { ...EMPTY_INTERVIEW_QUEUE, items: [item('a', ['P1', 'P2', 'P3']), item('b', ['Q1']), item('c')], ...over };
}

describe('interviewQueueFromRaw', () => {
  it('doc ausente vira fila vazia, repórter em branco e tudo ligado', () => {
    expect(interviewQueueFromRaw(null)).toEqual(EMPTY_INTERVIEW_QUEUE);
    expect(EMPTY_INTERVIEW_QUEUE.show).toEqual({ question: true, reporter: true, campaign: true });
    expect(EMPTY_INTERVIEW_QUEUE.reporter).toEqual({ role: 'Repórter', name: '' });
  });

  it('lê itens válidos e descarta lixo sem derrubar a fila', () => {
    const q = interviewQueueFromRaw({
      items: [
        { id: 'a', kind: 'dupla', teamId: 't1', uid: null, label: 'Ana / Bia', photoUrl: 'x.jpg', questions: ['Como foi?', '', 7] },
        { id: '', kind: 'atleta', teamId: 't2' },
        { id: 'b', kind: 'trio', teamId: 't3', label: 'B' },
        'lixo',
      ],
      current: 0,
      questionIndex: 0,
      reporter: { role: '  ', name: ' Carla ' },
      show: { question: false },
    });
    expect(q.items).toEqual([
      { id: 'a', kind: 'dupla', teamId: 't1', uid: null, label: 'Ana / Bia', photoUrl: 'x.jpg', questions: ['Como foi?'] },
      { id: 'b', kind: 'atleta', teamId: 't3', uid: null, label: 'B', photoUrl: null, questions: [] },
    ]);
    expect(q.reporter).toEqual({ role: 'Repórter', name: 'Carla' });
    expect(q.show).toEqual({ question: false, reporter: true, campaign: true });
  });

  it('cursor e pergunta fora do intervalo voltam pra dentro', () => {
    const raw = { items: [item('a', ['P1'])], current: 9, questionIndex: 5 };
    const q = interviewQueueFromRaw(raw);
    expect(q.current).toBe(0);
    expect(q.questionIndex).toBe(0);
  });
});

describe('queueAdd / queueRemove / queueMove', () => {
  it('adiciona no fim; o mesmo entrevistado não entra duas vezes', () => {
    const q = queueAdd(fila(), item('d'));
    expect(q.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(queueAdd(q, item('d')).items.length).toBe(4);
  });

  it('tem teto', () => {
    let q = EMPTY_INTERVIEW_QUEUE;
    for (let i = 0; i < INTERVIEW_QUEUE_MAX + 3; i++) q = queueAdd(q, item(`x${i}`));
    expect(q.items.length).toBe(INTERVIEW_QUEUE_MAX);
  });

  it('remover antes do cursor mantém o cursor no MESMO entrevistado', () => {
    const q = queueRemove(fila({ current: 2 }), 'a');
    expect(currentItem(q)?.id).toBe('c');
  });

  it('remover o atual passa pro seguinte (ou o último)', () => {
    expect(currentItem(queueRemove(fila({ current: 1 }), 'b'))?.id).toBe('c');
    expect(currentItem(queueRemove(fila({ current: 2 }), 'c'))?.id).toBe('b');
    expect(queueRemove(fila({ items: [item('a')] }), 'a')).toEqual(jasmine.objectContaining({ items: [], current: 0 }));
  });

  it('mover arrasta o cursor junto do entrevistado', () => {
    const q = queueMove(fila({ current: 0 }), 'a', 1);
    expect(q.items.map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(currentItem(q)?.id).toBe('a');
    expect(queueMove(fila(), 'a', -1).items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('queueReplaceItem (trocar atleta ↔ dupla depois de escalar)', () => {
  const dupla: InterviewQueueItem = { id: 'dupla:t-a', kind: 'dupla', teamId: 't-a', uid: null, label: 'A / A2', photoUrl: null, questions: [] };

  it('troca no lugar, mantendo a pauta e o cursor', () => {
    const q = queueReplaceItem(fila({ current: 0, questionIndex: 1 }), 'a', dupla);
    expect(q.items.map((i) => i.id)).toEqual(['dupla:t-a', 'b', 'c']);
    expect(q.items[0]?.questions).toEqual(['P1', 'P2', 'P3']);
    expect(q.items[0]?.kind).toBe('dupla');
    expect(q.current).toBe(0);
    expect(q.questionIndex).toBe(1);
  });

  it('formato que já está na fila: os dois viram um só, e o cursor vai junto', () => {
    const base = fila({ items: [item('a', ['P1']), item('b'), { ...dupla, questions: [] }], current: 0 });
    const q = queueReplaceItem(base, 'a', dupla);
    expect(q.items.map((i) => i.id)).toEqual(['b', 'dupla:t-a']);
    expect(currentItem(q)?.id).toBe('dupla:t-a');
    // A pauta escrita no item que sumiu não se perde quando o outro não tinha nenhuma.
    expect(currentItem(q)?.questions).toEqual(['P1']);
  });

  it('o mesmo formato ou item que não existe: nada muda', () => {
    const q = fila();
    expect(queueReplaceItem(q, 'a', item('a'))).toBe(q);
    expect(queueReplaceItem(q, 'zz', dupla)).toBe(q);
  });
});

describe('cursor e perguntas', () => {
  it('ir pra outro entrevistado começa na 1ª pergunta', () => {
    const q = queueGoTo(fila({ current: 0, questionIndex: 2 }), 1);
    expect(currentItem(q)?.id).toBe('b');
    expect(q.questionIndex).toBe(0);
    expect(queueGoTo(fila(), 9).current).toBe(2);
    expect(queueGoTo(fila(), -1).current).toBe(0);
  });

  it('próxima/anterior pergunta param nas pontas', () => {
    let q = queueStepQuestion(fila(), 1);
    expect(currentQuestion(q)).toBe('P2');
    q = queueStepQuestion(queueStepQuestion(q, 1), 1);
    expect(currentQuestion(q)).toBe('P3');
    expect(queueStepQuestion(fila(), -1).questionIndex).toBe(0);
  });

  it('pauta desligada ou sem pergunta não vai ao ar', () => {
    expect(currentQuestion(queueSetShow(fila(), { question: false }))).toBeNull();
    expect(currentQuestion(fila({ current: 2 }))).toBeNull();
    expect(currentQuestion(EMPTY_INTERVIEW_QUEUE)).toBeNull();
  });

  it('pauta é uma pergunta por linha, sem linhas vazias', () => {
    expect(questionsFromText('  Como foi?\n\n  E a final? \n')).toEqual(['Como foi?', 'E a final?']);
  });

  it('editar a pauta do atual mantém a pergunta dentro do intervalo', () => {
    const q = queueSetQuestions(fila({ questionIndex: 2 }), 'a', 'Só uma');
    expect(currentQuestion(q)).toBe('Só uma');
    expect(q.questionIndex).toBe(0);
  });
});

describe('repórter', () => {
  it('no ar só com nome e com a chave ligada', () => {
    const q = queueSetReporter(fila(), { role: 'Repórter', name: 'Carla Mendes' });
    expect(reporterOnAir(q)).toEqual({ role: 'Repórter', name: 'Carla Mendes' });
    expect(reporterOnAir(queueSetShow(q, { reporter: false }))).toBeNull();
    expect(reporterOnAir(fila())).toBeNull();
  });

  it('função em branco volta pra "Repórter"', () => {
    expect(queueSetReporter(fila(), { role: ' ', name: 'Carla' }).reporter.role).toBe('Repórter');
  });
});
