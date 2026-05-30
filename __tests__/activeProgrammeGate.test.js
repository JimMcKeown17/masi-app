jest.mock('../src/db/repositories/repositoryRuntime', () => ({
  resolveDatabase: jest.fn(async () => ({})),
}));
jest.mock('../src/db/repositories/domainRepositoryUtils', () => ({
  getActiveProgrammeId: jest.fn(),
}));
jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  programmesRepository: { getAll: jest.fn() },
}));

import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { getActiveProgrammeId } from '../src/db/repositories/domainRepositoryUtils';
import { programmesRepository } from '../src/db/repositories/referenceDataRepository';

describe('getActiveProgrammeGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('no active programme assignment → hasActiveProgramme false', async () => {
    getActiveProgrammeId.mockResolvedValue(null);

    const gate = await getActiveProgrammeGate({ userId: 'ea-1' });

    expect(gate).toEqual({ hasActiveProgramme: false, programme: null });
  });

  test('active assignment → hasActiveProgramme true with the resolved programme', async () => {
    getActiveProgrammeId.mockResolvedValue('prog-literacy');
    programmesRepository.getAll.mockResolvedValue([
      { id: 'prog-other', code: 'numeracy', name: 'Numeracy' },
      { id: 'prog-literacy', code: 'literacy', name: 'Core Literacy' },
    ]);

    const gate = await getActiveProgrammeGate({ userId: 'ea-1' });

    expect(gate.hasActiveProgramme).toBe(true);
    expect(gate.programme).toEqual({ id: 'prog-literacy', code: 'literacy', name: 'Core Literacy' });
  });

  test('no userId → hasActiveProgramme false without touching the database', async () => {
    const gate = await getActiveProgrammeGate({});

    expect(gate).toEqual({ hasActiveProgramme: false, programme: null });
    expect(getActiveProgrammeId).not.toHaveBeenCalled();
  });

  test('assignment present but programme record not cached → still allowed, programme null', async () => {
    // The data layer writes with just the assignment's programme id, so capture
    // must not be blocked merely because the programmes row is not cached locally.
    getActiveProgrammeId.mockResolvedValue('prog-ghost');
    programmesRepository.getAll.mockResolvedValue([
      { id: 'prog-other', code: 'numeracy', name: 'Numeracy' },
    ]);

    const gate = await getActiveProgrammeGate({ userId: 'ea-1' });

    expect(gate).toEqual({ hasActiveProgramme: true, programme: null });
  });
});
