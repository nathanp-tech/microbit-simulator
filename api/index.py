"""micro:bit Simulator API for Vercel (serverless). The logic is in _core.py (shared with server.py).

Environment variables (Vercel project settings):
  KV_REST_API_URL / KV_REST_API_TOKEN   added when an Upstash Redis database is connected
                                        (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN also work)
  TEACHER_CODE                          teacher password (optional: prof2026 when not set)
"""
from http.server import BaseHTTPRequestHandler
import json, os, sys
from urllib.parse import unquote_plus

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import Api, RedisStore  # noqa: E402

_api = None


def api():
    global _api
    if _api is None:
        url = os.environ.get('KV_REST_API_URL') or os.environ.get('UPSTASH_REDIS_REST_URL')
        token = os.environ.get('KV_REST_API_TOKEN') or os.environ.get('UPSTASH_REDIS_REST_TOKEN')
        if not url or not token:
            raise RuntimeError('No database: connect an Upstash Redis database to this Vercel project.')
        _api = Api(RedisStore(url, token), os.environ.get('TEACHER_CODE', '').strip() or 'prof2026', hosted=True)
    return _api


class handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle(self, method):
        path, _, query = self.path.partition('?')
        params = {k: unquote_plus(v) for k, v in (p.split('=', 1) for p in query.split('&') if '=' in p)}
        # vercel.json rewrites /api/xyz to /api/index?route=xyz
        if path.rstrip('/') in ('/api/index', '/api/index.py') and 'route' in params:
            path = '/api/' + params.pop('route')
        path = path.rstrip('/') or '/'
        body = {}
        if method == 'POST':
            n = int(self.headers.get('Content-Length') or 0)
            if n > 4_000_000:
                return self._json({'error': 'too large'}, 413)
            try:
                body = json.loads(self.rfile.read(n) or b'{}')
            except ValueError:
                return self._json({'error': 'bad request'}, 400)
        if path == '/api/ping':
            return self._json({'ok': True})
        try:
            a = api()
        except RuntimeError as e:
            return self._json({'error': str(e)}, 500)
        if path == '/api/cron/backup':
            # Vercel cron job (vercel.json), once a day. Harmless if called by anyone: one backup per day at most.
            try:
                return self._json({'ok': True, 'backup': a.make_backup()})
            except Exception as e:  # noqa: BLE001
                return self._json({'error': str(e)}, 500)
        host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host') or ''
        ctx = {'headers': self.headers, 'local': False, 'info': {'ips': [], 'host': None, 'port': None, 'publicUrl': f'https://{host}/' if host else None}}
        code, obj = a.handle(method, path, params, body, ctx)
        return self._json(obj, code)

    def do_GET(self):
        self._handle('GET')

    def do_POST(self):
        self._handle('POST')
