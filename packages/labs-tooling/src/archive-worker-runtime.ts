export interface ArchiveAsset {
  asset: string;
  contentType: string;
}

export async function archiveFetch(
  request: Request,
  assets: { fetch(request: Request): Promise<Response> },
  routes: Record<string, ArchiveAsset>,
): Promise<Response> {
  if (request.headers.has('upgrade')) return new Response(null, { status: 400 });
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const entry = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : undefined;
  if (
    entry === undefined &&
    !url.pathname.endsWith('/') &&
    Object.hasOwn(routes, `${url.pathname}/`)
  ) {
    url.pathname += '/';
    return Response.redirect(url.href, 308);
  }
  if (entry === undefined) return new Response(null, { status: 404 });
  url.pathname = entry.asset;
  url.search = '';
  const response = await assets.fetch(new Request(url, { method: request.method }));
  const headers = new Headers(response.headers);
  headers.set('content-type', entry.contentType);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('x-frame-options', 'DENY');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers,
  });
}
