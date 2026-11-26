# -*- coding: utf-8 -*-
"""ROI Simulator を手元の PC で動かす確認用サーバー（Python 標準ライブラリだけ）。

実行:  python tools/serve.py            → http://roi-simulator.localhost:8957/
       python tools/serve.py 8960       （番号を変えるとき）

他のアプリとぶつからないための決まり:
- 自分の PC の中（127.0.0.1）だけで待ち受ける。外からはつながらない。
- 番号を独占する。使用中なら二重に待ち受けず、メッセージを出して止まる（収支アプリの 8765 などを横取りしない）。
- ブラウザでは「roi-simulator.localhost」という専用の名前で開く。保存データとオフライン用のキャッシュが
  127.0.0.1 や localhost で動く他のアプリと混ざらない。
"""
import os
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "127.0.0.1"
DEFAULT_PORT = 8957
NAME = "roi-simulator.localhost"


class ExclusiveServer(ThreadingHTTPServer):
    """使用中の番号に重ねて待ち受けない（Windows の標準動作は重ねてしまう）"""
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".svg": "image/svg+xml",
    })

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")   # 直したらすぐ反映されるように
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  " + (fmt % args) + "\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    try:
        srv = ExclusiveServer((HOST, port), partial(Handler, directory=ROOT))
    except OSError:
        print(f"ポート {port} は別のソフトが使っています。番号を変えて起動してください（例: python tools/serve.py {port + 1}）。")
        sys.exit(1)
    print("ROI Simulator を起動しました。ブラウザで次を開いてください（Chrome / Edge）:")
    print(f"  http://{NAME}:{port}/")
    print("終わるときは Ctrl+C を押すか、この画面を閉じてください。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
