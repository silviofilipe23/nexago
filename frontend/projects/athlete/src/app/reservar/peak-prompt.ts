import {
  minimumChainContaining,
  peakCheckForSelection,
  type ArenaPeakRule,
  type ArenaSlot,
} from '@nexago/arena-discovery';

/** Conteúdo do modal da regra de pico: a regra que restringe o slot clicado e
 *  a cadeia mínima que o botão primário aplica. */
export interface PeakPrompt {
  readonly rule: ArenaPeakRule;
  readonly chain: ArenaSlot[];
  readonly minSlots: number;
}

/** Decide se o clique num slot deve abrir o modal da regra de pico.
 *
 *  `null` quando não deve: slot fora de faixa de pico, regra já liberada
 *  (janela de antecedência aberta ou cadeia impossível), ou mínimo de 1 slot.
 *  Mantido fora do componente para ser testável sem TestBed. */
export function peakPromptFor(params: {
  rules: ArenaPeakRule[];
  courtId: string;
  date: Date;
  /** Slots do dia da mesma quadra, ordenados por startTime. */
  courtDaySlots: ArenaSlot[];
  slot: ArenaSlot;
  slotDurationMinutes: number;
  now?: Date;
}): PeakPrompt | null {
  const initialCheck = peakCheckForSelection({
    rules: params.rules,
    courtId: params.courtId,
    date: params.date,
    courtDaySlots: params.courtDaySlots,
    selection: [params.slot],
    slotDurationMinutes: params.slotDurationMinutes,
    now: params.now,
  });
  let rule = initialCheck.rule;
  if (initialCheck.minSlots <= 1 || rule == null) return null;

  let chain = minimumChainContaining({
    courtDaySlots: params.courtDaySlots,
    targetStartTime: params.slot.startTime,
    minSlots: initialCheck.minSlots,
    date: params.date,
    now: params.now,
  });
  // Defensivo: o predicado só exige o mínimo quando existe cadeia, então
  // `chain` não deveria ser null aqui. Sem cadeia não há o que oferecer.
  if (chain == null) return null;

  // Fixpoint: a cadeia oferecida pode cair na faixa de OUTRA regra com mínimo
  // maior (ex.: regra A 20:00–21:00 mín 2h vizinha da regra B 21:00–22:00 mín
  // 3h — clicar 20:00 oferece 20:00–22:00, que a regra B ainda rejeita).
  // Reavalia a própria cadeia até que nenhuma regra exija mais do que ela já
  // cobre. Limitado por `courtDaySlots.length` como guarda contra loop
  // infinito — não deveria disparar na prática, já que cada iteração só
  // cresce a cadeia.
  for (let i = 0; i < params.courtDaySlots.length; i++) {
    const check = peakCheckForSelection({
      rules: params.rules,
      courtId: params.courtId,
      date: params.date,
      courtDaySlots: params.courtDaySlots,
      selection: chain,
      slotDurationMinutes: params.slotDurationMinutes,
      now: params.now,
    });
    if (check.minSlots <= chain.length) {
      return { rule, chain, minSlots: chain.length };
    }
    // check.minSlots > chain.length > 0 implica check.rule != null (ver
    // peakCheckForSelection: demandedRule só fica null quando demandedSlots
    // permanece no valor inicial 1).
    rule = check.rule ?? rule;
    const nextChain = minimumChainContaining({
      courtDaySlots: params.courtDaySlots,
      targetStartTime: params.slot.startTime,
      minSlots: check.minSlots,
      date: params.date,
      now: params.now,
    });
    if (nextChain == null) return null;
    chain = nextChain;
  }
  return null;
}
