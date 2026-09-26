// 抓《午夜放映员》模拟恐怖版的实际画面：VHS 外观 / 真实女鬼 / 监控墙 / 异常识别
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = __dirname, GAME = path.join(ROOT, '..');
const OUT = path.join(GAME, 'screenshots'); fs.mkdirSync(OUT, { recursive: true });
const PROBE = path.join(ROOT, '_probe_analog'); fs.mkdirSync(PROBE, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9397, WEB = 8927;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser, ws, server;
const pending = new Map(); let seq = 1, sid;
function raw(m, p = {}, s) { return new Promise((res, rej) => { const id = seq++; const t = setTimeout(() => { pending.delete(id); rej(new Error('timeout ' + m)); }, 30000); pending.set(id, { res, rej, t }); ws.send(JSON.stringify({ id, method: m, params: p, ...(s ? { sessionId: s } : {}) })); }); }
const send = (m, p = {}) => raw(m, p, sid);
async function ev(x) { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text); return r.result && r.result.value; }
async function until(fn, t = 20000) { const t0 = Date.now(); let last; while (Date.now() - t0 < t) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(80); } throw new Error('timeout: ' + last); }
async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')); console.log('  ->', n + '.png'); }
async function click(sel) { return ev(`document.querySelector(${JSON.stringify(sel)}).click()`); }

(async () => {
  try {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      const f = path.resolve(GAME, '.' + p);
      if (!f.startsWith(GAME + path.sep) || !fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(WEB, '127.0.0.1', r));
    browser = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(PROBE, 'profile')}`,
      '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-http-cache', '--mute-audio', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    const ver = await until(async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return false; } });
    ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.t); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
    const tid = (await raw('Target.createTarget', { url: 'about:blank' })).targetId;
    sid = (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
    await send('Runtime.enable'); await send('Page.enable');

    const load = async (w, h, mobile) => {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
      await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/index.html` });
      await until(() => ev(`document.readyState==='complete' && !!window.__MP`));
      await ev('localStorage.clear()');
    };
    const live = async (ms) => { await ev('__MP.resume()'); await sleep(ms || 900); };

    await load(1440, 810, false);
    console.log('抓图中：');
    await shot('a01-start');

    // 走廊：VHS 时间码 + 扫描线 + 真实素材
    await click('#enter'); await until(() => ev('__MP.state.running===true'));
    await ev('__MP.pause();__MP.clearGhosts();__MP.teleport(0,7);__MP.aim(0,0);__MP.torch(true);__MP.setBattery(100)');
    await live(1200); await shot('a02-hall-vhs');

    // 真实照片女鬼（光锥内被钉住）
    await ev('__MP.pause();__MP.clearGhosts();__MP.teleport(0,2);__MP.aim(0,0);__MP.torch(true);__MP.addGhost(0,-3.4,1.42)');
    await live(1300); await shot('a03-ghost-real-image');

    // 值班台：四路监控墙
    await ev('__MP.pause();__MP.closeCctv(true);__MP.setReports(1);__MP.openCctv()');
    await sleep(900); await shot('a04-cctv-wall');

    // 某一路出现人形（真异常）
    await ev('__MP.cctvForce(1,"her")'); await sleep(500);
    await shot('a05-cctv-anomaly-her');

    // 某一路断电黑屏（真异常）
    await ev('__MP.cctvForce(3,"black")'); await sleep(500);
    await shot('a06-cctv-anomaly-black');

    // 上报之后：日志多一条
    await ev('__MP.cctvSel(3);__MP.cctvReport()'); await sleep(400);
    await shot('a07-cctv-reported');

    // 值班日志页
    await ev('__MP.cctvSpawn();__MP.cctvForce(0,"her")');
    await ev('document.querySelector(".ctTab[data-tab=\'log\']").click()'); await sleep(600);
    await shot('a08-cctv-log');

    // 隐藏档案 07（日志页底部那条虚线）
    await ev('document.getElementById("fileLink").click()'); await sleep(600);
    await shot('a09-hidden-file');

    // 四次误报 → 四格满 → 她进值班室
    await ev('document.querySelector(".ctTab[data-tab=\'wall\']").click()');
    await ev('for(let i=0;i<4;i++){ __MP.cctvForce(0,"blast"); __MP.cctvReport(); }');
    await sleep(800);
    await shot('a10-death-by-door');

    // 手机端
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await load(390, 844, true);
    await shot('a11-mobile-start');
    await click('#enter'); await until(() => ev('__MP.state.running===true'));
    await ev('__MP.pause();__MP.clearGhosts();__MP.setReports(2);__MP.openCctv()');
    await ev('__MP.cctvForce(1,"her")'); await sleep(900);
    await shot('a12-mobile-cctv');
    console.log('完成。');
  } catch (e) { console.log('ERR', e && e.stack || e); }
  finally { try { ws && ws.close(); } catch { } try { browser && browser.kill(); } catch { } try { server && server.close(); } catch { } process.exit(0); }
})();
