import type { PartnerSource, RegistrationPartner } from './registration.models';

export interface PartnerSuggestion {
  id: string;
  displayName: string;
  handle: string;
  level: string;
}

export const MOCK_PARTNER_SUGGESTIONS: PartnerSuggestion[] = [
  { id: 'p-ana', displayName: 'Ana Costa', handle: '@ana.costa', level: 'Avançado' },
  { id: 'p-bruno', displayName: 'Bruno Melo', handle: '@bmelo', level: 'Intermediário' },
  { id: 'p-carla', displayName: 'Carla Dias', handle: '@carlad', level: 'Avançado' },
  { id: 'p-diego', displayName: 'Diego Rocha', handle: '@drocha', level: 'Iniciante' },
  { id: 'p-elisa', displayName: 'Elisa Nunes', handle: '@elisan', level: 'Intermediário' },
  { id: 'p-felipe', displayName: 'Felipe Araújo', handle: '@faraujo', level: 'Avançado' },
];

export function suggestionToPartner(s: PartnerSuggestion, source: PartnerSource): RegistrationPartner {
  return {
    id: s.id,
    displayName: s.displayName,
    handle: s.handle,
    status: 'confirmed',
    source,
  };
}
