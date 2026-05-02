/**
 * BT Locations — Cloudflare Worker Proxy
 * 
 * Architecture: Browser → Worker (adds GitHub token) → GitHub API
 * Token is stored in Worker environment variable (secret), never exposed to client.
 * 
 * Endpoints:
 *   GET  /api/file?path=<path>         → get file content + SHA from GitHub
 *   PUT  /api/file                     → create/update file on GitHub  
 *   GET  /api/raw?path=<path>          → get raw file content (no auth needed fallback)
 *   GET  /health                       → health check
 * 
 * Environment Variables (Secrets):
 *   GITHUB_TOKEN  — GitHub Personal Access Token with repo scope
 *   REPO_OWNER    — GitHub username (default: valrinx)
 *   REPO_NAME     — GitHub repo name (default: bt-locations)
 *   API_SECRET    — Optional shared secret for extra auth (header: X-API-Key)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Optional API key check
    if (env.API_SECRET) {
      const key = request.headers.get('X-API-Key');
      if (key !== env.API_SECRET) {
        return errorResponse('Unauthorized', 401);
      }
    }

    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    const REPO_OWNER = env.REPO_OWNER || 'valrinx';
    const REPO_NAME = env.REPO_NAME || 'bt-locations';

    if (!GITHUB_TOKEN) {
      return errorResponse('Server misconfigured: missing GITHUB_TOKEN', 500);
    }

    const ghHeaders = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'bt-locations-worker',
    };

    try {
      // ── Health check ──
      if (path === '/health') {
        return jsonResponse({ status: 'ok', repo: `${REPO_OWNER}/${REPO_NAME}` });
      }

      // ── GET /api/file?path=<path> — Get file content + SHA ──
      if (path === '/api/file' && request.method === 'GET') {
        const filePath = url.searchParams.get('path');
        if (!filePath) return errorResponse('Missing ?path= parameter');

        const ghUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
        const res = await fetch(ghUrl, { headers: ghHeaders });

        if (res.status === 404) {
          return jsonResponse({ sha: null, content: null }, 200);
        }
        if (!res.ok) {
          const body = await res.text();
          return errorResponse(`GitHub API error: ${res.status} ${body}`, res.status);
        }

        const data = await res.json();
        return jsonResponse({
          sha: data.sha,
          content: data.content,
          size: data.size,
          path: data.path,
        });
      }

      // ── PUT /api/file — Create/Update file ──
      if (path === '/api/file' && request.method === 'PUT') {
        const body = await request.json();
        const { path: filePath, content, sha, message } = body;

        if (!filePath || !content) {
          return errorResponse('Missing path or content');
        }

        const ghUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
        const ghBody = {
          message: message || 'Sync from web',
          content: content, // already base64 from client
        };
        if (sha) ghBody.sha = sha;

        const res = await fetch(ghUrl, {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(ghBody),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return errorResponse(err.message || `GitHub ${res.status}`, res.status);
        }

        const data = await res.json();
        return jsonResponse({
          sha: data.content?.sha,
          path: data.content?.path,
        });
      }

      // ── GET /api/raw?path=<path> — Raw file (no auth, cache-bust) ──
      if (path === '/api/raw' && request.method === 'GET') {
        const filePath = url.searchParams.get('path');
        if (!filePath) return errorResponse('Missing ?path= parameter');

        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${filePath}?t=${Date.now()}`;
        const res = await fetch(rawUrl);

        if (!res.ok) {
          return errorResponse(`Raw fetch failed: ${res.status}`, res.status);
        }

        const text = await res.text();
        return new Response(text, {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      return errorResponse('Not found', 404);

    } catch (err) {
      return errorResponse(`Internal error: ${err.message}`, 500);
    }
  },
};
