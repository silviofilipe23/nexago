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
  const check = peakCheckForSelection({
    rules: params.rules,
    courtId: params.courtId,
    date: params.date,
    courtDaySlots: params.courtDaySlots,
    selection: [params.slot],
    slotDurationMinutes: params.slotDurationMinutes,
    now: params.now,
  });
  if (check.minSlots <= 1 || check.rule == null) return null;

  const chain = minimumChainContaining({
    courtDaySlots: params.courtDaySlots,
    targetStartTime: params.slot.startTime,
    minSlots: check.minSlots,
    date: params.date,
    now: params.now,
  });
  // Defensivo: o predicado só exige o mínimo quando existe cadeia, então
  // `chain` não deveria ser null aqui. Sem cadeia não há o que oferecer.
  if (chain == null) return null;

  return { rule: check.rule, chain, minSlots: check.minSlots };
}
