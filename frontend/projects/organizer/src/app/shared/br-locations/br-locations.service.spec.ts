import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrLocationsService } from '@nexago/br-locations';

/**
 * O serviço vive em `frontend/shared/br-locations` (lib `@nexago/br-locations`),
 * mas o spec mora aqui: o builder do karma só descobre specs sob o `src/` do
 * projeto — `include` no tsconfig.spec.json não alcança `frontend/shared/`.
 * O organizer é o consumidor de referência da lib.
 */

describe('BrLocationsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    spyOn(globalThis, 'fetch').and.resolveTo({
      json: () => Promise.resolve({ GO: ['Goiânia', 'Anápolis'], SP: ['São Paulo', 'Campinas'] }),
    } as Response);
  });

  it('exposes the 27 Brazilian states', () => {
    const service = TestBed.inject(BrLocationsService);
    expect(service.states.length).toBe(27);
    expect(service.states.find((s) => s.sigla === 'GO')?.name).toBe('Goiás');
  });

  it('loads and caches the municipalities JSON', async () => {
    const service = TestBed.inject(BrLocationsService);
    expect(service.loaded()).toBe(false);
    await service.ready;
    expect(service.loaded()).toBe(true);
    expect(service.citiesFor('GO')).toEqual(['Goiânia', 'Anápolis']);
  });

  it('returns an empty array for an empty or unknown UF', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(service.citiesFor('')).toEqual([]);
    expect(service.citiesFor('XX')).toEqual([]);
  });

  it('normalizes a lowercase or untrimmed UF before lookup', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(service.citiesFor('go')).toEqual(['Goiânia', 'Anápolis']);
    expect(service.citiesFor(' GO ')).toEqual(['Goiânia', 'Anápolis']);
  });

  it('fetches the asset only once', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/br-municipalities-by-uf.json');
  });
});
