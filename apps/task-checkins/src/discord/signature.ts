const MAX_INTERACTION_BYTES = 128 * 1024;

function bytesFromHex(value: string, length: number): Uint8Array | null {
  if (value.length !== length * 2 || !/^[0-9a-f]+$/i.test(value)) return null;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function readBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INTERACTION_BYTES) return null;
  const stream = request.body as ReadableStream<Uint8Array> | null;
  if (!stream) return '';
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = stream.getReader();
  } catch {
    return '';
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    let next = await reader.read();
    while (!next.done) {
      length += next.value.byteLength;
      if (length > MAX_INTERACTION_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
      next = await reader.read();
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

export async function signatureIsValid(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  const keyBytes = bytesFromHex(publicKey, 32);
  const signatureBytes = bytesFromHex(signature, 64);
  if (!keyBytes || !signatureBytes || !/^\d{1,20}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey('raw', arrayBuffer(keyBytes), 'Ed25519', false, [
      'verify',
    ]);
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      arrayBuffer(signatureBytes),
      arrayBuffer(new TextEncoder().encode(timestamp + body)),
    );
  } catch {
    return false;
  }
}
