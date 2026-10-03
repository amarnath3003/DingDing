"""Standalone bell contact tester: ESP32 serial -> live web page. No hub needed.

    .venv/bin/python bell_esp32/contact_test.py [port]     then open http://127.0.0.1:8001

Shows CONTACT / OPEN live, one row per contact (gap before, length, press/hold/blip),
and every raw serial line, so you can see whether the ESP32 is sending anything at all.
Stop the DING hub first: only one program should read the port.
"""
import glob
import json
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else (sorted(glob.glob("/dev/cu.usbserial-*")) or ["/dev/cu.usbserial-0001"])[0]
HTTP_PORT = 8001
listeners: list = []
status = {"serial": "connecting"}


def broadcast(msg: dict) -> None:
    for q in list(listeners):
        q.put(msg)


def reader() -> None:
    while True:
        try:
            p = serial.Serial(None, 115200, timeout=0.2)
            p.port, p.dtr, p.rts = PORT, False, False
            p.open()
            status["serial"] = f"connected ({PORT})"
            broadcast({"type": "status", **status})
            print("serial connected on", PORT)
            while True:
                raw = p.readline()
                if not raw:
                    continue
                line = raw.decode(errors="ignore").strip()
                t = time.time() * 1000
                print(f"{time.strftime('%H:%M:%S')}  {line}")
                broadcast({"type": "line", "line": line, "t": t})
        except Exception as e:
            status["serial"] = f"not connected: {e}"
            broadcast({"type": "status", **status})
            print("serial:", e, "(retrying)")
            time.sleep(2)


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>Bell contact test</title><style>
body{margin:0;font:18px/1.4 -apple-system,system-ui,sans-serif;background:#111;color:#eee}
#lamp{height:45vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#2a2a2a}
#lamp.on{background:#1fa64a}#state{font-size:13vh;font-weight:800}#live{font-size:4vh;opacity:.85;font-variant-numeric:tabular-nums}
#bar{display:flex;gap:2em;padding:.7em 1.2em;background:#1a1a1a}#cols{display:flex;gap:1em;padding:0 1em}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:.25em .8em;text-align:left;border-bottom:1px solid #222}
th{color:#888;font-weight:500}.press{color:#7fd1ff}.hold{color:#ffd166}.blip{color:#888}
#raw{font:14px ui-monospace,Menlo,monospace;white-space:pre;color:#aaa;max-height:50vh;overflow:auto;flex:0 0 32%}
button{font:inherit;background:#333;color:#eee;border:0;padding:.2em .8em;border-radius:6px}
</style></head><body>
<div id="lamp"><div id="state">OPEN</div><div id="live">waiting for the bell…</div></div>
<div id="bar"><span id="conn">page: connecting…</span><span>ESP32: <b id="esp">?</b></span>
<span>contacts: <b id="count">0</b></span><button id="clear">Clear</button></div>
<div id="cols"><table><thead><tr><th>#</th><th>time</th><th>gap before</th><th>length</th><th>reads as</th></tr></thead>
<tbody id="log"></tbody></table><div id="raw"></div></div>
<script>
const $=id=>document.getElementById(id);let downAt=null,lastUp=null,n=0;
const kind=ms=>ms<30?'blip':ms>=1000?'hold':'press';
(function tick(){if(downAt!==null)$('live').textContent='closed for '+Math.round(Date.now()-downAt)+' ms';requestAnimationFrame(tick)})();
function edge(down,t){
 if(down&&downAt===null){downAt=t;$('lamp').classList.add('on');$('state').textContent='CONTACT'}
 else if(!down&&downAt!==null){const len=Math.round(t-downAt),gap=lastUp===null?null:Math.round(downAt-lastUp),k=kind(len);
  n++;$('count').textContent=n;const r=document.createElement('tr');
  r.innerHTML=`<td>${n}</td><td>${new Date(t).toLocaleTimeString()}</td><td>${gap===null?'–':gap+' ms'+(gap<=500?' (same burst)':'')}</td><td class=${k}><b>${len} ms</b></td><td class=${k}>${k}</td>`;
  $('log').prepend(r);downAt=null;lastUp=t;$('lamp').classList.remove('on');$('state').textContent='OPEN';$('live').textContent=`last contact ${len} ms (${k})`}}
$('clear').onclick=()=>{$('log').innerHTML='';$('raw').textContent='';n=0;$('count').textContent=0;lastUp=null};
const es=new EventSource('/events');
es.onopen=()=>$('conn').textContent='page: live';es.onerror=()=>$('conn').textContent='page: reconnecting…';
es.onmessage=ev=>{const m=JSON.parse(ev.data);
 if(m.type==='status')$('esp').textContent=m.serial;
 else if(m.type==='line'){$('raw').textContent=new Date(m.t).toLocaleTimeString()+'  '+m.line+'\n'+$('raw').textContent.slice(0,20000);
  if(m.line==='DOWN')edge(true,m.t);else if(m.line==='UP')edge(false,m.t);
  else if(m.line.startsWith('READY')){$('esp').textContent='ready, '+(m.line.endsWith('0')?'contact CLOSED at boot':'contact open at boot')}}};
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/events":
            q: queue.Queue = queue.Queue()
            listeners.append(q)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            try:
                q.put({"type": "status", **status})
                while True:
                    self.wfile.write(f"data: {json.dumps(q.get())}\n\n".encode())
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                listeners.remove(q)
        else:
            body = PAGE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


if __name__ == "__main__":
    threading.Thread(target=reader, daemon=True).start()
    print(f"open http://127.0.0.1:{HTTP_PORT}")
    ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler).serve_forever()
