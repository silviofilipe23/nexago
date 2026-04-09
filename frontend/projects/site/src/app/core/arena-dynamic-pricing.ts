/** Entrada para motor de preço dinâmico (MVP — fatores podem vir da API depois). */
export interface ArenaPricingInput {
  basePrice: number;
  /** 0 → 1 */
  demandFactor: number;
  /** 0 → 1 (ocupação do horário) */
  occupancy: number;
  timeSlot: string;
}

export interface ArenaPricingResult {
  rounded: number;
  baseListed: number;
  isHighDemand: boolean;
}

export function calculateDynamicPrice(p: ArenaPricingInput): ArenaPricingResult {
  const baseListed = p.basePrice;
  let price = p.basePrice;

  const hour = Number.parseInt(p.timeSlot.split(':')[0] ?? '', 10);
  let premiumEvening = false;
  if (Number.isFinite(hour) && hour >= 18 && hour <= 22) {
    price *= 1.2;
    premiumEvening = true;
  }

  price *= 1 + p.demandFactor * 0.3;

  if (p.occupancy > 0.7) {
    price *= 1.15;
  }

  const rounded = Math.round(price);
  const isHighDemand =
    p.demandFactor > 0.55 ||
    p.occupancy > 0.72 ||
    (premiumEvening && p.demandFactor > 0.38);

  return { rounded, baseListed, isHighDemand };
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Demanda simulada estável por arena + data + horário (substituir por API). */
export function mockDemandFactor(arenaId: string, timeSlot: string, dateIso: string): number {
  const h = hash32(`demand|${arenaId}|${dateIso}|${timeSlot}`);
  return (h % 100) / 100;
}

/** Ocupação simulada 0.42–0.95 para exercitar faixa de surto (substituir por API). */
export function mockOccupancy(arenaId: string, timeSlot: string, dateIso: string): number {
  const h = hash32(`occ|${arenaId}|${dateIso}|${timeSlot}`);
  return 0.42 + (h % 54) / 100;
}
