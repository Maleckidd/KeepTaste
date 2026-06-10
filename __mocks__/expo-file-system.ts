export const cacheDirectory = 'file:///mock-cache/';
export const documentDirectory = 'file:///mock-documents/';
export const EncodingType = { UTF8: 'utf8' };
export const writeAsStringAsync = jest.fn(async () => undefined);
export const copyAsync = jest.fn(async () => undefined);
export const deleteAsync = jest.fn(async () => undefined);
export const getInfoAsync = jest.fn(async () => ({ exists: true }));
