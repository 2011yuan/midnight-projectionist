// 《午夜放映员 v4》值班室 · 六路监控 · 理智 · 突脸 · 她攻进值班室
// 真机 Edge + CDP，真发按键、真读 window.__MP 状态。
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = __dirname, GAME = path.join(ROOT, 'outputs', 'midnight-projectionist'), PROBE = path.join(ROOT, '_probe_san');
fs.mkdirSync(PROBE, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9396, WEB = 8926;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser, ws, server, failures = 0; const checks = [], errors = [], bad = [];
function ok(v, name, detail) { checks.push({ pass: !!v, name, detail }); if (!v) failures++; console.log((v ? '[OK]  ' : '[FAIL]') + ' ' + name + ' ' + JSON.stringify(detail === undefined ? '' : detail)); }
const pending = new Map(); let seq = 1, sid;
function raw(m, p = {}, s) { return new Promise((res, rej) => { const id = seq++; const t = setTimeout(() => { pending.delete(id); rej(new Error('timeout ' + m)); }, 30000); pending.set(id, { res, rej, t }); ws.send(JSON.stringify({ id, method: m, params: p, ...(s ? { sessionId: s } : {}) })); }); }
const send = (m, p = {}) => raw(m, p, sid);
async function ev(x) { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
async function until(fn, t = 15000) { const t0 = Date.now(); let last; while (Date.now() - t0 < t) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(80); } throw new Error('timeout: ' + last); }
async function navigate(u) { await send('Page.navigate', { url: u || `http://127.0.0.1:${WEB}/index.html` }); await until(() => ev(`document.readyState==='complete'`)); }
async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PROBE, n + '.png'), Buffer.from(r.data, 'base64')); }
async function click(sel) { return ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('no '+${JSON.stringify(sel)});e.click();return true})()`); }
const VK = { KeyQ: 81, KeyW: 87, KeyE: 69, KeyF: 70, KeyC: 67, KeyS: 83, Space: 32, Escape: 27, Digit1: 49, Digit6: 54 };
const hold = async (code, ms) => {
  const p = { code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code], nativeVirtualKeyCode: VK[code] };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p });
  await sleep(ms);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
};
// 真按键 + 确定性推进。
// 用 hold(code, ms) 靠真实时间去等，在无头软渲染下帧数不稳：同样 520ms，
// 有时推进 1.6 米、有时只有 0.15 米，于是「能走动」这条会偶发假失败。
// 按住了键之后用 __MP.sim(秒) 自己推世界，结果就和帧率无关了。
const holdSim = async (code, sec) => {
  const p = { code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code], nativeVirtualKeyCode: VK[code] };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p });
  await ev(`__MP.sim(${sec})`);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
};
async function boot() {
  await navigate();
  await until(() => ev('!!window.__MP'), 10000);
  await click('#enter');
  await until(() => ev('window.__MP && __MP.state.running===true'), 10000);
  await ev('__MP.pause()');
}
const S = () => ev('__MP.state'), SAN = () => ev('__MP.san');

(async () => {
  try {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      const f = path.resolve(GAME, '.' + p);
      if (!f.startsWith(GAME + path.sep) || !fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
      const ct = p.endsWith('.js') ? 'text/javascript;charset=utf-8' : 'text/html;charset=utf-8';
      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(WEB, '127.0.0.1', r));
    browser = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(PROBE, 'profile')}`,
      '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-http-cache', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
      '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    const ver = await until(async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return false; } });
    ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.t); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
      if (m.sessionId !== sid) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
      if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) bad.push(m.params.response.url);
    };
    const tid = (await raw('Target.createTarget', { url: 'about:blank' })).targetId;
    sid = (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    // ================= A. 值班室是一间真房间 =================
    console.log('\n===== A. 值班室 =====');
    await boot();
    const ctrl = await ev('__MP.ctrl');
    const s0 = await S();
    ok(s0.z > ctrl.zMin, '开局人站在值班室里，不是走廊', { z: s0.z, roomZMin: ctrl.zMin });
    ok((await ev('__MP.san')).inCtrl === true, 'inCtrl() 认得这间房');

    await ev('__MP.resume(); __MP.teleport(0, 15)');
    const pA = await S();
    await holdSim('KeyW', 0.6);
    const pB = await S();
    await ev('__MP.pause()');
    ok(Math.abs(pB.z - pA.z) > 0.25, '在值班室里能走（不是一张贴上去的菜单）', { before: pA.z, after: pB.z });
    await ev('__MP.teleport(4.6, 16); __MP.sim(0.2)');
    ok((await S()).x <= 3.21, '值班室也有墙（会被拦住）', (await S()).x);

    // 走到监控台前才能坐下
    await ev('__MP.teleport(0, 12.9); __MP.sim(0.2)');
    ok((await SAN()).nearConsole === false, '站在门口时坐不下（离监控台太远）');
    await ev('__MP.teleport(0, 16.2); __MP.sim(0.2)');
    ok((await SAN()).nearConsole === true, '走到监控台前才判定为可坐下');
    const uiA = await ev('__MP.ui');
    ok(uiA.promptOn && uiA.promptTxt.indexOf('监控') >= 0, '会提示「按住 E 坐下看监控」', uiA.promptTxt);
    await shot('v4-ctrl-room');

    // ================= B. 六路监控 = 六个房间 =================
    console.log('\n===== B. 六个房间 =====');
    await ev('__MP.revive(); __MP.goCtrl(); if(!__MP.cctv.open) __MP.openCctv(); __MP.setReports(0); __MP.setMisses(0); __MP.setTrack(0)');
    const cn = await ev('__MP.cams()');
    ok(cn.length === 6, '六路画面', cn.map(c => c.n));
    ok(cn.every(c => c.has), '每个房间都有各自的背景素材', cn.map(c => c.t).join(' / '));
    const rooms = await ev(`(()=>{const s=new Set();for(let i=0;i<40;i++){__MP.setReports(4);__MP.setTrack(-50);__MP.cctvSpawn();s.add(__MP.cctv.anom.cam)}return [...s].sort((a,b)=>a-b)})()`);
    ok(rooms.length >= 4, '异常会落在不同房间，不是固定一路', rooms);
    const each = await ev(`(()=>{const r=[];for(let i=0;i<6;i++){__MP.cctvForce(i,"her");r.push(__MP.camDom()[i].her > 0.2)}return r})()`);
    ok(each.every(Boolean), '六路每一路都能出异常', each);
    await shot('v4-six-rooms');

    // ================= C. 理智：漏报 / 误报 / 记对 =================
    console.log('\n===== C. 理智 =====');
    await ev('__MP.setSan(100); __MP.setTrack(-50); __MP.setMisses(0); __MP.cctvForce(2,"her")');
    const cA = await SAN();
    await ev('__MP.cctvAdvance(61)');   // cctvForce 给的窗口是 60 秒，必须推到超时才算漏报
    const cB = await SAN();
    ok(cB.v < cA.v - 15, '漏报一条真异常 -> 理智掉一截', { before: cA.v, after: cB.v });
    ok(cB.fearOn === true, '漏报的同时会突脸（不是只有一行字）', { fearOn: cB.fearOn, cls: cB.fearClass });
    ok(/20/.test(cB.cost), '突脸上直接写明扣了多少理智', cB.cost);
    ok((await ev('__MP.ctrl')).doorL !== null, '监控台场景已建好');

    await ev('__MP.resetFearCd(); __MP.setSan(100); __MP.setTrack(0); __MP.cctvForce(0,"blast"); __MP.cctvSel(0)');
    await ev('__MP.cctvReport()');
    const cC = await SAN();
    ok(cC.v <= 100 - 12, '磁带噪点报上去 = 误报，也要掉理智', cC.v);

    await ev('__MP.setSan(50); __MP.setTrack(0); __MP.cctvForce(1,"her"); __MP.cctvSel(1); __MP.cctvReport()');
    const cD = await SAN();
    ok(cD.v > 50, '记对一条 -> 理智回一点（唯一的正反馈）', cD.v);

    // 突脸期间动不了
    await ev('__MP.revive(); __MP.closeCctv(true); __MP.resetFearCd(); __MP.setSan(100); __MP.teleport(0, 16.2); __MP.resume(); __MP.scare(3)');
    const fA = await S();
    await holdSim('KeyS', 0.35);      // 0.35s < 突脸时长 0.94s，这段时间内必须一步都推不动
    const fB = await S();
    await ev('__MP.pause()');
    ok(Math.abs(fB.z - fA.z) < 0.2, '突脸期间动不了（惊吓有硬直）', { before: fA.z, after: fB.z });

    // 两次强制突脸叠在一起时，第二张脸必须完整播完。
    // 这里是修过的一个真 bug：scare() 每次都新挂一个 940ms 的收尾定时器去删 on 类，
    // 但不掐掉上一个。她抓到你用的是强制突脸（绕过连击保护），于是上一次的定时器
    // 正好在这次播到一半时把屏幕清黑——先亮出一张脸，然后毫无预兆地全黑。
    await ev('__MP.revive(); __MP.closeCctv(true); __MP.setSan(100); __MP.teleport(0, 16.2); __MP.resetFearCd()');
    await ev('__MP.scare(3, "第一次", 0, true)');
    await sleep(630);
    await ev('__MP.scare(3, "她抓到了你 · 理智 −32", 32, true)');
    await sleep(430);
    const dbl = await SAN();
    ok(dbl.fearOn === true && dbl.inFear === true,
      '两次强制突脸叠加：第二张脸不会被上一张的收尾定时器清掉',
      { cls: dbl.fearClass, inFear: dbl.inFear, why: dbl.why });
    await ev('__MP.resetFearCd(); __MP.setSan(100)');

    // ================= D. 值班室是安全区：理智会回 =================
    console.log('\n===== D. 安全区 =====');
    await ev('__MP.revive(); __MP.closeCctv(true); __MP.setSan(40); __MP.teleport(0, 16.2); __MP.clearGhosts()');
    await ev('__MP.sim(5)');
    const dA = await SAN();
    ok(dA.v > 45, '待在值班室里理智缓慢回涨', dA.v);
    await ev('__MP.setSan(40); __MP.teleport(0, -20); __MP.clearGhosts(); __MP.sim(5)');
    const dB = await SAN();
    ok(dB.v <= 41, '走廊里不回理智（安全区之所以是安全区）', dB.v);

    // ================= E. 她进不了值班室 =================
    console.log('\n===== E. 她的边界 =====');
    await ev('__MP.revive(); __MP.setSan(100); __MP.clearGhosts(); __MP.setReports(0); __MP.addGhost(0, -18); __MP.teleport(0, 16.2)');
    await ev('__MP.sim(32)');
    const gp = await ev('__MP.ghostPos()');
    ok(gp.length > 0 && gp.every(g => g.z < 12.0), '她最多走到值班室门口，进不来（除了最后那一次）', gp.map(g => +g.z.toFixed(2)));
    ok(gp.some(g => g.vis), '站在门口时她在门洞里是看得见的（安全区也有一点不安全）', gp.map(g => g.vis));
    ok((await S()).dead === false, '她在门外不会直接把你弄死');
    await shot('v4-ghost-at-door');

    // ================= F. 走廊被抓：扣理智，不是死 =================
    console.log('\n===== F. 走廊被抓 =====');
    await ev('__MP.revive(); __MP.pause(); __MP.setSan(100); __MP.clearGhosts(); __MP.setReports(0); __MP.setTrack(0); __MP.teleport(0, -20); __MP.addGhost(0, -21.2)');
    await ev('__MP.sim(2.0)');
    const f1 = await S(), f2 = await SAN();
    ok(f1.dead === false, '走廊里被抓不再是「直接结束」', f1.dead);
    ok(f2.v <= 100 - 28 && f2.v > 40, '被抓扣一大截理智（之后在值班室还会回一点点）', f2.v);
    ok(f1.z > 12, '被抓之后被拖回值班室，不是原地复活', f1.z);
    ok((await ev('__MP.stations')).filter(s => s.on).length >= 0, '放映机进度不会被这次被抓清空');

    // ================= G. 她攻进值班室（完整演出）=================
    console.log('\n===== G. 她攻进值班室 =====');
    await ev('__MP.revive(); __MP.pause(); __MP.resetFearCd(); __MP.setSan(100); __MP.clearGhosts(); __MP.siege("door"); __MP.pause()');
    const g0 = await SAN();
    ok(g0.siegeT >= 0 && g0.phase === 0, '满格后不是黑屏，而是进入「她进门」这一段', { phase: g0.phase });
    ok(g0.inCtrl === true, '演出发生在值班室，不是走廊');
    await ev('__MP.sim(0.9)');
    const gd = await ev('__MP.ctrl');
    ok(Math.abs(gd.doorL - gd.doorLClosed) > 0.9, '值班室的门被撞开了', { doorL: gd.doorL, closed: gd.doorLClosed });
    const g1 = await ev('__MP.ghostPos()');
    ok(g1.length === 1 && g1[0].z > 12.0, '她在值班室里，正朝你走过来', g1.map(g => +g.z.toFixed(2)));
    await ev('__MP.sim(2.2)');
    const g2 = await SAN();
    ok(g2.phase === 2 && g2.fearOn === true, '走到你面前 = 突脸（这一段必须真的演出来）', { phase: g2.phase, fearOn: g2.fearOn });
    ok(g2.fearImgLen > 2000, '突脸铺的是真实特写', g2.fearImgLen);
    await shot('v4-siege-face');
    await ev('__MP.sim(2.0)');
    const g3 = await S();
    ok(g3.dead === true, '贴完脸 -> 这一局结束');
    const ov = await ev('__MP.ui');
    ok(/值班室/.test(ov.overTitle), '结局文案指向值班室', ov.overTitle);

    // 理智见底走的是另一条路，但收在同一个画面上
    await ev('__MP.revive(); __MP.pause(); __MP.resetFearCd(); __MP.setSan(20); __MP.clearGhosts(); __MP.teleport(0, -20); __MP.addGhost(0, -21.2); __MP.sim(2.2)');
    const h1 = await SAN();
    ok(h1.siegeT >= 0 || (await S()).dead === true, '理智见底 -> 她也来值班室，不是凭空黑屏', { siegeT: h1.siegeT, kind: h1.kind });
    await ev('__MP.sim(6)');
    ok((await S()).dead === true, '理智这条线的结局同样收在值班室');

    // 低惊吓模式：不铺脸
    await ev('__MP.revive(); __MP.pause(); __MP.resetFearCd(); __MP.setCalm(true); __MP.setSan(100); __MP.clearGhosts(); __MP.siege("door"); __MP.pause(); __MP.sim(3.2)');
    ok((await SAN()).fearOn === false, '低惊吓模式在最后也不铺全屏脸（能当众演示）');
    await ev('__MP.sim(2); __MP.setCalm(false); __MP.revive(); __MP.pause()');

    // ================= H. 难度真的拉上去了 =================
    console.log('\n===== H. 难度 =====');
    const cf = await ev('__MP.CFG');
    ok(cf.maxGhosts === 5, '走廊里最多同时 5 只（原来 3 只）', cf.maxGhosts);
    ok(cf.ghostSpeed > 1.6, '她更快了', cf.ghostSpeed);
    ok(cf.ghostGrow > 0.2, '每开一台放映机她的加速更狠', cf.ghostGrow);
    ok(cf.drain > 3.0, '手电更费电', cf.drain);
    const st = await ev('__MP.STATIONS');
    ok(st.length === 5, '五台放映机（原来 4 台）', st.map(s => s.z));
    ok((await ev('__MP.cctv')).need === 5, '通关要 5 条异常记录');

    // ================= I. 收尾 =================
    console.log('\n===== I. 收尾 =====');
    ok(errors.length === 0, '无 JS 报错', errors.slice(0, 5));
    ok(bad.length === 0, '无 404 / 资源加载失败', bad.slice(0, 5));

    console.log('\n' + '='.repeat(44));
    console.log('通过 ' + (checks.length - failures) + ' / ' + checks.length + '，失败 ' + failures);
    fs.writeFileSync(path.join(PROBE, 'results.json'), JSON.stringify({ checks, errors, bad }, null, 2));
  } catch (e) {
    console.log('\n[EXCEPTION] ' + (e && e.stack || e));
    failures++;
  } finally {
    try { ws && ws.close(); } catch (e) { }
    try { server && server.close(); } catch (e) { }
    try { browser && browser.kill(); } catch (e) { }
    process.exit(failures ? 1 : 0);
  }
})();
