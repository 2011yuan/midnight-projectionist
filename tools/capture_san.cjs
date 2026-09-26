// 抓 san 层（值班室 · 理智 · 突脸）的画面：值班室 / 门缝里的她 / 六路监控 / 断电 / 突脸 / 她走进值班室 / 五台放映机
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = __dirname, GAME = path.join(ROOT, 'outputs', 'midnight-projectionist');
const OUT = path.join(GAME, 'screenshots'); fs.mkdirSync(OUT, { recursive: true });
const PROBE = path.join(ROOT, '_probe_san'); fs.mkdirSync(PROBE, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9398, WEB = 8928;
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/index.html` });
    await until(() => ev(`document.readyState==='complete' && !!window.__MP`));
    await ev('localStorage.clear()');
    await click('#enter');
    await until(() => ev('__MP.state.running===true'));
    console.log('抓图中：');

    // b01 值班室：站在房间里，背后是监控台
    await ev('__MP.pause();__MP.clearGhosts();__MP.teleport(0,13.2);__MP.aim(Math.PI,0);__MP.torch(false);__MP.setSan(100)');
    await ev('__MP.resume()'); await sleep(1100); await ev('__MP.pause()');
    await shot('b01-control-room');

    // b02 从值班室往外看：她站在门缝那一侧（门是虚掩的，留了 0.5m 的缝）
    await ev('__MP.clearGhosts();__MP.addGhost(0.08,11.15,0);__MP.teleport(0,13.9);__MP.aim(0,0)');
    await ev('__MP.resume()'); await sleep(900); await ev('__MP.pause()');
    await shot('b02-her-at-door');

    // b03 六路监控墙（某一路上出现真异常）
    await ev('__MP.goCtrl();if(!__MP.cctv.open)__MP.openCctv();__MP.setReports(2);__MP.setTrack(1)');
    await ev('__MP.cctvForce(4,"her");__MP.cctvSel(4)'); await sleep(900);
    await shot('b03-six-rooms');

    // b04 某一路断电黑屏 + 另一个房间出人形
    await ev('__MP.cctvForce(1,"black")'); await sleep(600);
    await shot('b04-six-rooms-black');

    // b05 突脸（占满屏幕的那种）
    // 抓这一张有个坑：Page.captureScreenshot 返回的是「最近一次提交的合成帧」，
    // 常常比此刻的 DOM 状态晚几百毫秒。突脸只亮 940ms，照直抓经常抓到上一帧——
    // 屏幕上什么都对（class 有 on、display:block、图解码完成），截出来却是一张没脸的黑图。
    // 做法：先让 scare 真跑一遍（拿到真的 why / 理智文案），再把这一层用内联
    // display:block 钉住，等合成帧追上来再截。截到的就是玩家在突脸期间看到的那一屏。
    await ev('__MP.closeCctv(true);__MP.teleport(0,16.2);__MP.aim(Math.PI,0);__MP.resetFearCd();__MP.resume()');
    await sleep(600);
    await ev('__MP.scare(3)'); await sleep(430);
    console.log('  [诊断]', JSON.stringify(await ev(`(()=>{const f=document.getElementById('fear'),i=document.getElementById('fearImg');
      const cs=getComputedStyle(f), is=getComputedStyle(i);
      return {cls:f.className, disp:cs.display, z:cs.zIndex, pos:cs.position, bg:cs.backgroundColor,
        imgLen:(i.src||'').length, nw:i.naturalWidth, nh:i.naturalHeight,
        iw:is.width, ih:is.height, iop:is.opacity, ifilt:(is.filter||'').slice(0,44),
        fw:Math.round(f.getBoundingClientRect().width), fh:Math.round(f.getBoundingClientRect().height),
        anim:is.animationName, why:__MP.san.why, calm:__MP.state.calmMode,
        inFear:__MP.san.inFear, fearClass:__MP.san.fearClass, cost:__MP.san.cost};})()`)));
    await ev(`(()=>{const f=document.getElementById('fear'); if(!f.classList.contains('on')) f.classList.add('on'); f.style.display='block'; return f.className;})()`);
    await sleep(700);
    await shot('b05-fear-closeup');
    await ev(`document.getElementById('fear').style.display=''`);
    await sleep(1000);

    // b06 她走进值班室：门被撞开，她在房间里
    await ev('__MP.revive();__MP.pause();__MP.resetFearCd();__MP.setSan(100);__MP.clearGhosts();__MP.siege("door");__MP.pause();__MP.sim(1.5)');
    await ev('__MP.resume()'); await sleep(420); await ev('__MP.pause()');
    await shot('b06-siege-in-room');

    // b07 走廊：五台放映机全开
    await ev('__MP.revive();__MP.pause();__MP.clearGhosts();__MP.startAllStations();__MP.teleport(0,6);__MP.aim(0,0);__MP.torch(true);__MP.setBattery(78)');
    await ev('__MP.resume()'); await sleep(900); await ev('__MP.pause()');
    await shot('b07-five-projectors');

    console.log('完成。');
  } catch (e) { console.log('ERR', e && e.stack || e); }
  finally { try { ws && ws.close(); } catch { } try { browser && browser.kill(); } catch { } try { server && server.close(); } catch { } process.exit(0); }
})();
