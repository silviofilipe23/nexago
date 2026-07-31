import { resolveStaffArenaDocs } from './arena-staff-docs';

describe('resolveStaffArenaDocs', () => {
  it('resolve todas as arenas quando todas as leituras têm sucesso', async () => {
    const load = (id: string) => Promise.resolve({ name: `Arena ${id}` });

    const docs = await resolveStaffArenaDocs(['a1', 'a2'], load);

    expect(docs.size).toBe(2);
    expect(docs.get('a1')).toEqual({ name: 'Arena a1' });
    expect(docs.get('a2')).toEqual({ name: 'Arena a2' });
  });

  it('mantém as arenas que resolveram quando uma leitura rejeita', async () => {
    const load = (id: string) =>
      id === 'a2' ? Promise.reject(new Error('network')) : Promise.resolve({ name: `Arena ${id}` });

    const docs = await resolveStaffArenaDocs(['a1', 'a2', 'a3'], load);

    expect(docs.size).toBe(2);
    expect(docs.has('a1')).toBe(true);
    expect(docs.has('a2')).toBe(false);
    expect(docs.has('a3')).toBe(true);
  });

  it('resolve para um Map vazio (sem lançar) quando todas as leituras rejeitam', async () => {
    const load = () => Promise.reject(new Error('network'));

    const docs = await resolveStaffArenaDocs(['a1', 'a2'], load);

    expect(docs.size).toBe(0);
  });

  it('ignora arena inexistente (load resolve null) sem contar como erro', async () => {
    const load = (id: string) => Promise.resolve(id === 'a1' ? { name: 'Arena a1' } : null);

    const docs = await resolveStaffArenaDocs(['a1', 'a2'], load);

    expect(docs.size).toBe(1);
    expect(docs.has('a1')).toBe(true);
  });

  it('lista vazia de ids resolve para Map vazio sem chamar load', async () => {
    const load = jasmine.createSpy('load');

    const docs = await resolveStaffArenaDocs([], load);

    expect(docs.size).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });
});
