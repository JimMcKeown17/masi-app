export const createSupabaseMock = ({ upsertResults = {}, updateResults = {}, rpcResults = {} } = {}) => {
  const calls = [];
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async (payload, options) => {
        calls.push({ type: 'upsert', tableName, payload, options });
        const resultKey = Array.isArray(payload)
          ? `${tableName}:batch`
          : `${tableName}:${payload.id}`;
        const result = upsertResults[resultKey] || upsertResults[tableName];
        if (typeof result === 'function') {
          return result({ tableName, payload, options, calls });
        }
        return result || { error: null };
      }),
      update: jest.fn((payload) => ({
        eq: jest.fn((column, value) => ({
          select: jest.fn(async () => {
            calls.push({ type: 'update', tableName, payload, column, value });
            const result = updateResults[`${tableName}:${value}`] || updateResults[tableName];
            if (typeof result === 'function') {
              return result({ tableName, payload, column, value, calls });
            }
            return result || { data: [{ id: value }], error: null };
          }),
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(async (column, value) => {
          calls.push({ type: 'delete', tableName, column, value });
          return { error: null };
        }),
      })),
    })),
    rpc: jest.fn(async (functionName, args) => {
      calls.push({ type: 'rpc', functionName, args });
      return rpcResults[functionName] || { data: true, error: null };
    }),
  };

  return { supabaseClient, calls };
};
