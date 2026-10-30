#!/usr/bin/env python3
"""micro:bit Simulator class server.

    python3 server.py [port] [--public] [--no-browser]

Serves the app and a small JSON API so the teacher can follow every student live.
With --public, it also opens a free Cloudflare tunnel: students can then open the app
from any network with a public https link (shown here and in the teacher dashboard).
Student work is kept in data/db/ on this computer (same API as online: api/_core.py).
"""
import atexit, http.server, json, os, platform, re, shutil, signal, socket, socketserver, stat, subprocess
import posixpath, sys, tarfile, threading, urllib.parse, urllib.request, webbrowser
from urllib.parse import unquote_plus

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
args = sys.argv[1:]
PORT = next((int(a) for a in args if a.isdigit()), 8100)
PUBLIC = '--public' in args
DATA_DIR = os.environ.get('MB_DATA_DIR') or os.path.join(ROOT, 'data')  # tests use their own folder
TOOLS_DIR = os.path.join(ROOT, 'tools')

public_url = None

# All the data (students, programs, history, exams, backups…) is kept in data/db/ (see api/_core.py).
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _core import Api, FileStore, migrate_legacy  # noqa: E402

store = FileStore(os.path.join(DATA_DIR, 'db'))
migrated = migrate_legacy(store, DATA_DIR)  # first start after the update: imports data/progress.json and data/work/
store.flush()
atexit.register(store.flush)

# Teacher password: protects the dashboard when it is opened from another computer (not needed on this one).
# Same as online: the TEACHER_CODE environment variable if set, otherwise prof2026.
TEACHER_CODE = os.environ.get('TEACHER_CODE', '').strip() or 'prof2026'
api = Api(store, TEACHER_CODE, hosted=False)


def local_hostname():
    name = socket.gethostname()
    return name if name.endswith('.local') else name + '.local'


def local_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.'))


# ---------- Public link (Cloudflare quick tunnel, free, no account) ----------
def cloudflared_path():
    local = os.path.join(TOOLS_DIR, 'cloudflared')
    if os.path.exists(local):
        return local
    found = shutil.which('cloudflared')
    if found:
        return found
    system, machine = platform.system().lower(), platform.machine().lower()
    arch = 'arm64' if machine in ('arm64', 'aarch64') else 'amd64'
    if system == 'darwin':
        url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-{arch}.tgz'
    elif system == 'linux':
        url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}'
    else:
        print('  Public link: please install cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)')
        return None
    print('  Downloading cloudflared (first time only, about 20 MB)…')
    os.makedirs(TOOLS_DIR, exist_ok=True)
    tmp = os.path.join(TOOLS_DIR, 'download.tmp')
    try:
        urllib.request.urlretrieve(url, tmp)
        if url.endswith('.tgz'):
            with tarfile.open(tmp) as t:
                member = next(m for m in t.getmembers() if m.name.endswith('cloudflared'))
                with t.extractfile(member) as src, open(local, 'wb') as dst:
                    shutil.copyfileobj(src, dst)
            os.remove(tmp)
        else:
            os.replace(tmp, local)
        os.chmod(local, os.stat(local).st_mode | stat.S_IEXEC)
        return local
    except Exception as e:  # noqa: BLE001 - show any download problem to the teacher
        print(f'  Could not download cloudflared: {e}')
        return None


def start_tunnel():
    global public_url
    exe = cloudflared_path()
    if not exe:
        return None
    proc = subprocess.Popen([exe, 'tunnel', '--no-autoupdate', '--url', f'http://localhost:{PORT}'],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    def read():
        global public_url
        for line in proc.stdout:
            m = re.search(r'https://[-a-z0-9]+\.trycloudflare\.com', line)
            if m and not public_url:
                public_url = m.group(0) + '/'
                print(f'\n  ✅ PUBLIC LINK for students (any network):  {public_url}\n')
    threading.Thread(target=read, daemon=True).start()
    # Close the public link whenever the server stops (Ctrl+C, window closed, kill).
    atexit.register(lambda: proc.poll() is None and proc.terminate())
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, lambda *_: sys.exit(0))
    return proc


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # always serve the latest version
        super().end_headers()

    def log_message(self, fmt, *a):
        pass  # keep the window readable

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _local(self):
        # Requests through the tunnel also come from 127.0.0.1, but carry Cloudflare headers.
        return self.client_address[0] in ('127.0.0.1', '::1') and not self.headers.get('Cf-Ray') and not self.headers.get('Cf-Connecting-Ip')

    def _api(self, method):
        path, _, query = self.path.partition('?')
        params = {k: unquote_plus(v) for k, v in (p.split('=', 1) for p in query.split('&') if '=' in p)}
        body = {}
        if method == 'POST':
            n = int(self.headers.get('Content-Length') or 0)
            if n > 5_000_000:
                return self._json({'error': 'too large'}, 413)
            try:
                body = json.loads(self.rfile.read(n) or b'{}')
            except ValueError:
                return self._json({'error': 'bad request'}, 400)
        ctx = {'headers': self.headers, 'local': self._local(),
               'info': {'ips': local_ips(), 'host': local_hostname(), 'port': PORT, 'publicUrl': public_url}}
        code, obj = api.handle(method, path.rstrip('/'), params, body, ctx)
        return self._json(obj, code)

    def _hidden(self, path):
        # Never serve student data, tools, server files or the answer key (the path is checked decoded and
        # case-insensitively: macOS finds /DATA or /%64ata too).
        p = posixpath.normpath(urllib.parse.unquote(path)).lower()
        parts = [x for x in p.split('/') if x]
        if any(x.startswith('.') for x in parts) or re.search(r'\.(py|command|txt|json)$', p) and not p.startswith('/lib/'):
            return True
        top = parts[0] if parts else ''
        return top in ('data', 'tools', 'api') or (top == 'tests' and not self._local())

    def do_GET(self):
        path = self.path.partition('?')[0]
        if path.startswith('/api/'):
            return self._api('GET')
        if self._hidden(path):
            return self._json({'error': 'not found'}, 404)
        return super().do_GET()

    def do_HEAD(self):
        if self._hidden(self.path.partition('?')[0]):
            return self._json({'error': 'not found'}, 404)
        return super().do_HEAD()

    def do_POST(self):
        if self.path.startswith('/api/'):
            return self._api('POST')
        return self._json({'error': 'not found'}, 404)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), Handler) as httpd:
    url = f'http://localhost:{PORT}/'
    print('micro:bit Simulator class server')
    if migrated:
        print(f'  Imported {migrated} student work files from the previous version into data/db/.')
    print(f'  Teacher dashboard on this computer:  {url}teacher.html')
    print(f'  Teacher password (dashboard on another computer):  {TEACHER_CODE}')
    for ip in local_ips():
        print(f'  Same Wi-Fi as this computer:  http://{ip}:{PORT}/')
    tunnel = start_tunnel() if PUBLIC else None
    if PUBLIC:
        print('  Opening the public link…')
    print('Keep this window open during the lesson. Press Ctrl+C to stop.')
    if '--no-browser' not in args:
        webbrowser.open(url + 'teacher.html')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if tunnel:
            tunnel.terminate()
