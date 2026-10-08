import {
  appendVaryAccept,
  isRoomPath,
  isStaticAssetPath,
  markdownPath,
  NOT_FOUND_MARKDOWN,
  preferredType,
} from './lib/negotiate';

const PRODUCES = ['text/html', 'text/markdown'] as const;

function markdownResponse(body: string, status = 200): Response {
  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': status === 404 ? 'no-store' : 'public, max-age=300',
  });
  appendVaryAccept(headers);
  return new Response(body, { status, headers });
}

async function loadMarkdown(env: { ASSETS: { fetch: typeof fetch } }, origin: string, path: string): Promise<string | null> {
  const res = await env.ASSETS.fetch(new URL(path, origin));
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (/html/i.test(type)) return null;
  const text = await res.text();
  return text.trim() ? text : null;
}

function notAcceptable(): Response {
  const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  appendVaryAccept(headers);
  return new Response('Not Acceptable\n\nAvailable: text/html, text/markdown\n', { status: 406, headers });
}

type MiddlewareContext = {
  request: Request;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: { ASSETS: { fetch: typeof fetch } };
};

export const onRequest = async (context: MiddlewareContext): Promise<Response> => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return next();
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  if (isStaticAssetPath(url.pathname)) return next();

  // Direct .md URLs: correct Content-Type for agents that fetch mirrors by convention.
  if (url.pathname.endsWith('.md')) {
    const body = await loadMarkdown(env, url.origin, url.pathname);
    if (body) return markdownResponse(body);
    return markdownResponse(NOT_FOUND_MARKDOWN, 404);
  }

  // Live table codes stay an SPA shell; agents should use the public pages instead.
  if (isRoomPath(url.pathname)) {
    const spa = await env.ASSETS.fetch(new Request(new URL('/', url), request));
    const out = new Response(spa.body, spa);
    appendVaryAccept(out.headers);
    return out;
  }

  const accept = request.headers.get('accept');
  const chosen = preferredType(accept, [...PRODUCES]);

  if (chosen === null && accept) return notAcceptable();

  if (chosen === 'text/markdown') {
    const twin = markdownPath(url.pathname);
    const body = await loadMarkdown(env, url.origin, twin);
    if (body) return markdownResponse(body);
    // Prefer authored 404.md when present.
    const fallback = (await loadMarkdown(env, url.origin, '/404.md')) ?? NOT_FOUND_MARKDOWN;
    return markdownResponse(fallback, 404);
  }

  const html = await next();
  const out = new Response(html.body, html);
  appendVaryAccept(out.headers);

  if (out.headers.get('content-type')?.includes('text/html') && out.status === 200) {
    const twin = markdownPath(url.pathname);
    const hasMd = await loadMarkdown(env, url.origin, twin);
    if (hasMd) {
      const link = `<${twin}>; rel="alternate"; type="text/markdown"`;
      const existing = out.headers.get('Link');
      out.headers.set('Link', existing ? `${existing}, ${link}` : link);
    }
    const described = '</llms.txt>; rel="describedby"';
    const existing = out.headers.get('Link');
    out.headers.set('Link', existing ? `${existing}, ${described}` : described);
  }

  // HTML 404s: when the client preferred markdown but we fell through, already handled above.
  if (out.status === 404 && preferredType(accept, ['text/markdown']) === 'text/markdown') {
    const fallback = (await loadMarkdown(env, url.origin, '/404.md')) ?? NOT_FOUND_MARKDOWN;
    return markdownResponse(fallback, 404);
  }

  return out;
};
