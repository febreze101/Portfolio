"""Static server for the prototypes — like `python -m http.server`, but sends no-cache headers.

Plain http.server sends no Cache-Control, so Chrome guesses a freshness window and keeps serving
stale ES modules (case-carousel.js, dripnav.js) after they change, even on a normal reload.

    python prototypes/serve.py [port]      (serves the repo root, default port 5178)
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCacheHandler, directory=root)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
