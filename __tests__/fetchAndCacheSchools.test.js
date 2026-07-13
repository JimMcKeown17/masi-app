import { schoolsRepository } from '../src/db/repositories/referenceDataRepository';
import { fetchAndCacheSchools } from '../src/services/offlineSync';
import { enqueueSupabaseRequest } from '../src/services/supabaseRequestQueue';

jest.mock('../src/services/supabaseRequestQueue', () => ({
  enqueueSupabaseRequest: jest.fn(),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/referenceDataRepository', () => ({
  schoolsRepository: {
    replaceFromServer: jest.fn(),
  },
}));

test('fetchAndCacheSchools replaces the repository cache and returns server rows', async () => {
  const schools = [
    { id: 'school-1', name: 'Masi Primary' },
    { id: 'school-2', name: 'Sakhingomso Primary' },
  ];
  enqueueSupabaseRequest.mockResolvedValue({ data: schools, error: null });
  schoolsRepository.replaceFromServer.mockResolvedValue(true);

  await expect(fetchAndCacheSchools()).resolves.toEqual(schools);
  expect(schoolsRepository.replaceFromServer).toHaveBeenCalledWith(schools);
});
