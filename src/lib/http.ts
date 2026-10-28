import { ApiError } from './errors';
export async function readJson(req: Request, limit = 150000): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length') ?? 0) > limit)
    throw new ApiError(413, 'Слишком большой запрос');
  if (!req.body) throw new ApiError(400, 'Пустой запрос');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, 'Слишком большой запрос');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Object required');
    return data as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'Нужен корректный JSON-объект');
  }
}
