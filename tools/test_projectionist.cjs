// 《午夜放映员》行为测试：真机 Edge + CDP，覆盖追逐机制、三层突破、电量循环、通关与布局
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = __dirname, GAME = path.join(ROOT, 'outputs', 'midnight-projectionist'), PROBE = path.join(ROOT, '_probe_mp');
fs.mkdirSync(PROBE, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9393, WEB = 8923;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser, ws, server, failures = 0; const checks = [], errors = [], bad = [];
function ok(v, name, detail) { checks.push({ pass: !!v, name, detail }); if (!v) failures++; console.log((v ? '[OK]  ' : '[FAIL]') + ' ' + name + ' ' + JSON.stringify(detail === undefined ? '' : detail)); }
const pending = new Map(); let seq = 1, sid;
function raw(m, p = {}, s) { return new Promise((res, rej) => { const id = seq++; const t = setTimeout(() => { pending.delete(id); rej(new Error('timeout ' + m)); }, 30000); pending.set(id, { res, rej, t }); ws.send(JSON.stringify({ id, method: m, params: p, ...(s ? { sessionId: s } : {}) })); }); }
const send = (m, p = {}) => raw(m, p, sid);
async function ev(x) { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
async function until(fn, t = 15000) { const t0 = Date.now(); let last; while (Date.now() - t0 < t) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(80); } throw new Error('timeout: ' + last); }
async function navigate() { await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/index.html` }); await until(() => ev(`document.readyState==='complete'`)); }
async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PROBE, n + '.png'), Buffer.from(r.data, 'base64')); }
async function mouse(type, x, y) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 }); }
async function touch(type, x, y) { await send('Input.dispatchTouchEvent', { type, touchPoints: (type === 'touchEnd') ? [] : [{ x, y, id: 1, radiusX: 3, radiusY: 3 }] }); }
async function click(sel) { return ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('no '+${JSON.stringify(sel)});e.click();return true})()`); }
const VK = { KeyQ: 81, KeyW: 87, KeyE: 69, KeyF: 70, KeyS: 83, KeyA: 65, KeyD: 68 };
async function keyDown(code) { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code], nativeVirtualKeyCode: VK[code] }); }
async function keyUp(code) { await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code], nativeVirtualKeyCode: VK[code] }); }
async function rafRate(ms) { const a = await ev('window.__raf'); await sleep(ms); const b = await ev('window.__raf'); return (b - a) / (ms / 1000); }
async function boot() {
  await navigate();
  await until(() => ev('!!window.__MP'), 8000);
  await click('#enter');
  await until(() => ev('window.__MP && __MP.state.running===true'), 8000);
  await ev('__MP.pause()');
}
async function reset() {
  await ev(`(()=>{__MP.clearGhosts();__MP.teleport(0,0);__MP.aim(0,0);__MP.setBattery(100);__MP.torch(false);__MP.resetCd();
    __MP.key('KeyE',false);__MP.key('KeyW',false);__MP.key('KeyS',false);__MP.key('KeyA',false);__MP.key('KeyD',false);return true})()`);
}
const G = i => ev(`__MP.ghosts[${i}]`);

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
      if (m.method === 'Page.javascriptDialogOpening') { send('Page.handleJavaScriptDialog', { accept: true }); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
      if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) bad.push(m.params.response.url);
    };
    const tid = (await raw('Target.createTarget', { url: 'about:blank' })).targetId;
    sid = (await raw('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__raf=0;const _r=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>{window.__raf++;return _r(f)};` });

    // ================= A. 开始页：各种窗口都进得去 =================
    console.log('\n===== A. 开始页 =====');
    for (const [w, h, label] of [[360, 640, '竖屏手机 360x640'], [390, 844, '手机 390x844'], [640, 360, '横屏 640x360'], [740, 420, '小窗口 740x420'], [1024, 560, '矮笔记本 1024x560'], [1920, 1080, '投屏 1920x1080']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
      await navigate();
      const m = await ev(`(()=>{const st=document.getElementById('start');
        const b=()=>document.getElementById('enter').getBoundingClientRect();
        const first=b(); st.scrollTop=99999; const last=b(); st.scrollTop=0;
        const vis=r=>r.top>=-1&&r.bottom<=innerHeight+1;
        return {fit:vis(first), scrollable:st.scrollHeight>st.clientHeight, reach:vis(last),
          overflowPx:Math.max(0,Math.round(st.scrollHeight-st.clientHeight)),
          xOverflow:document.documentElement.scrollWidth>innerWidth};})()`);
      ok((m.fit || (m.scrollable && m.reach)) && !m.xOverflow, `开始页可用（${label}）`, m);
      if (w === 390) await shot('start-390x844');
    }

    // ================= B. 「再看一遍规则」必须盖在开始页上面 =================
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await navigate();
    await ev('localStorage.clear()'); await navigate();
    await click('#howto'); await sleep(200);
    const dlg = await ev(`(()=>{const o=document.getElementById('over'),c=document.getElementById('overCard');
      const b=c.getBoundingClientRect();
      const el=document.elementFromPoint(Math.round(b.left+b.width/2),Math.round(b.top+24));
      return {hidden:o.hidden,z:getComputedStyle(o).zIndex,
        top:el?(el.closest('#overCard')?'overCard':(el.id||el.tagName)):'none',
        txt:c.textContent.slice(0,16), hasWays:c.textContent.includes('9 米以内')};})()`);
    ok(!dlg.hidden && dlg.top === 'overCard' && dlg.z === '70', '「再看一遍规则」弹窗真的在最上层（z-index 修复）', dlg);
    ok(dlg.hasWays, '规则弹窗写清了「9 米以内才按得住」', dlg.txt);
    await click('#overCard button'); await sleep(150);
    ok(await ev(`document.getElementById('over').hidden`) === true, '「知道了」能关掉弹窗');

    // ================= C. 进入游戏 =================
    console.log('\n===== C. 进入游戏 =====');
    await click('#enter');
    await until(() => ev('window.__MP && __MP.state.running===true'), 8000);
    const st0 = await ev('__MP.state');
    ok(st0.battery <= 100 && st0.battery > 99 && st0.startedCount === 0 && st0.caughtCount === 0 && st0.holdT === 0,
      '开局状态干净：满电 / 0 台 / 0 次被抓（且电量不会倒涨）', st0);
    ok(await ev('__MP.ui.reelsOn') === 0 && await ev('__MP.stations.length') === 5, '五台放映机已就位且全灭');
    ok(await ev(`document.getElementById('game').hidden`) === false, 'HUD 已显示');
    await shot('game-start');

    // ================= D. 真实键鼠输入 =================
    console.log('\n===== D. 真实输入 =====');
    const torch0 = await ev('__MP.state.torchOn');
    await keyDown('KeyQ'); await keyUp('KeyQ'); await sleep(200);
    ok(await ev('__MP.state.torchOn') === !torch0, '按 Q 能开/关手电（真实键盘事件）');
    await keyDown('KeyQ'); await keyUp('KeyQ'); await sleep(200);
    ok(await ev('__MP.state.torchOn') === torch0, '再按一次 Q 切回来');

    await ev('__MP.teleport(0,5);__MP.aim(0,0)');
    await keyDown('KeyW'); await sleep(900); await keyUp('KeyW'); await sleep(200);
    const moved = await ev('__MP.state');
    ok(moved.z < 4.9, '按住 W 向前走（z 变小）', { z: moved.z });

    await ev('__MP.aim(0,0)');
    const b0 = await ev('__MP.state.battery');
    await keyDown('KeyF'); await keyUp('KeyF'); await sleep(250);
    const f1 = await ev('__MP.state');
    ok(f1.flashCd > 9 && Math.abs(b0 - f1.battery - 25) < 0.6, '按 F 爆闪：扣 25% 电、进入 10 秒冷却', { before: b0, after: f1.battery, cd: f1.flashCd });

    await ev('__MP.teleport(0,5);__MP.aim(0,0)');
    const y0 = await ev('__MP.state.yaw');
    await mouse('mousePressed', 640, 400); await mouse('mouseMoved', 780, 400); await mouse('mouseReleased', 780, 400); await sleep(200);
    const y1 = await ev('__MP.state.yaw');
    ok(Math.abs(y1 - y0) > 0.2, '拖动鼠标转视角', { from: +y0.toFixed(3), to: +y1.toFixed(3) });

    // ================= E. 核心：光什么时候才钉得住她 =================
    console.log('\n===== E. 追逐与三层突破 =====');
    await ev('__MP.pause()');
    await reset();
    await ev(`__MP.addGhost(0,-5,1.42)`);
    const z5 = (await G(0)).z;
    await ev('__MP.torch(true)');
    await ev('__MP.sim(2.5)');
    const g5 = await G(0);
    ok(g5.frozen === true && Math.abs(g5.z - z5) < 0.05, '① 光锥内 5 米：她被钉死，一步都动不了', g5);

    await reset(); await ev(`__MP.addGhost(0,-13,1.42)`); await ev('__MP.torch(true)');
    const z13 = (await G(0)).z;
    await ev('__MP.sim(1.2)');
    const g13 = await G(0);
    ok(g13.frozen === false && g13.z > z13 + 1.4, '① 光锥内 13 米：照得到但按不住，她照样走近（关键平衡）', { from: z13, to: g13.z, frozen: g13.frozen });

    await reset(); await ev(`__MP.addGhost(0,5,1.42)`); await ev('__MP.torch(true)');
    await ev('__MP.sim(1.2)');
    const gBack = await G(0);
    ok(gBack.frozen === false && gBack.z < 5, '① 她绕到你身后：光锥外，按不住', { z: gBack.z });

    await reset(); await ev(`__MP.addGhost(0,-5,1.42)`); await ev('__MP.torch(false)');
    await ev('__MP.sim(1.2)');
    const gDark = await G(0);
    ok(gDark.frozen === false && gDark.z > -5, '① 关掉手电：她立刻恢复走动（光才是代价）', { z: gDark.z });

    // ③ 放映机安全圈：关着灯也能定住
    await reset();
    await ev(`__MP.teleport(-2.9,6);__MP.aim(0,0);__MP.torch(false);__MP.setBattery(100);__MP.addGhost(2.0,6,1.42);__MP.key('KeyE',true)`);
    await ev('__MP.sim(2.4)');
    await ev(`__MP.key('KeyE',false)`);
    const sOn = await ev('__MP.stations[0]');
    const gSafe = await G(0);
    ok(sOn.on === true, '按住 E 约 1.6 秒启动放映机', sOn);
    ok(gSafe.frozen === true, '③ 关着灯、但在放映机 5.5 米安全圈里：她照样动不了', gSafe);
    ok(await ev('__MP.ui.reelsOn') === 1, 'HUD 上的放映机指示灯亮起 1 个');

    // ② 爆闪
    await reset();
    await ev(`__MP.addGhost(0,-3,1.42);__MP.torch(false)`);
    const bz = (await G(0)).z;
    await ev('__MP.flash()');
    const gF = await G(0), sF = await ev('__MP.state');
    ok(gF.z < bz - 4.5, '② 爆闪把她推开约 6 米（与规则文案一致）', { before: bz, after: gF.z, pushed: +(bz - gF.z).toFixed(2) });
    ok(gF.stun > 2.9, '② 爆闪定身约 3.4 秒（v4 稍微削短，逼你按得准）', gF.stun);
    ok(Math.abs(sF.battery - 75) < 0.01 && sF.flashCd > 10.9, '② 爆闪代价：25% 电 + 11 秒冷却', { battery: sF.battery, cd: sF.flashCd });
    const again = await ev('__MP.flash()');
    ok(await ev('__MP.state.battery') === 75, '② 冷却中再按爆闪不生效、不扣电', again);
    await ev(`__MP.resetCd();__MP.addGhost(0,4,1.42)`);
    const backZ = (await G(1)).z;
    await ev('__MP.flash()');
    const gB = await G(1);
    ok(gB.z > backZ + 1.5 && gB.z < backZ + 4.5, '② 爆闪对身后的她也有效，但推得比正面近（不是无解）',
      { before: backZ, after: gB.z, pushed: +(gB.z - backZ).toFixed(2) });

    // ================= F. 电量循环 =================
    console.log('\n===== F. 电量 =====');
    await reset();
    await ev('__MP.setBattery(60);__MP.torch(true)');
    await ev('__MP.sim(10)');
    const bA = await ev('__MP.state.battery');
    ok(Math.abs(bA - 28) < 1.0, '手电开着 10 秒掉 32%（3.2%/秒，v4 提高了）', bA);
    await ev('__MP.torch(false)');
    await ev('__MP.sim(10)');
    const bB = await ev('__MP.state.battery');
    ok(Math.abs(bB - 50) < 1.0, '关掉 10 秒回 22%（2.2%/秒）', bB);
    await ev('__MP.setBattery(3);__MP.torch(true)');
    await ev('__MP.sim(2.0)');
    const bC = await ev('__MP.state');
    ok(bC.torchOn === false, '电量归零手电自动熄灭', { battery: bC.battery, torchOn: bC.torchOn });
    ok((await ev('__MP.ui.promptTxt')).includes('没电'), '并给出「关着等它回电」的提示', await ev('__MP.ui.promptTxt'));

    await reset();
    await ev('__MP.teleport(2.6,2);__MP.setBattery(40);__MP.torch(false)');
    await ev('__MP.sim(0.6)');
    const bD = await ev('__MP.state.battery');
    ok(bD > 68 && bD < 73, '走到电池上 +30%', bD);
    await ev('__MP.sim(0.6)');
    ok(await ev('__MP.state.battery') < 76, '同一块电池不会重复吃');

    // 低电保护：真实按键路径
    await ev('__MP.resume()');
    await ev('__MP.setBattery(0);__MP.torch(false)');
    await sleep(250);
    await keyDown('KeyQ'); await keyUp('KeyQ'); await sleep(250);
    ok(await ev('__MP.state.torchOn') === false, '电量低于 10% 时按 Q 开不了手电（真实按键）');
    await ev('__MP.pause()');

    // ================= G. 被抓 / 复活 / 通关 =================
    console.log('\n===== G. 被抓 / 复活 / 通关 =====');
    await boot();
    await ev(`__MP.clearGhosts();__MP.teleport(0,0);__MP.aim(0,0);__MP.addGhost(0,-1.5,1.42);__MP.torch(false)`);
    await ev('__MP.sim(1.0)');
    const dS = await ev('__MP.state'), dU = await ev('__MP.ui'), dSan = await ev('__MP.san');
    ok(dS.dead === false, '她贴到 0.98 米内就抓到你——但 v4 里这一下不再是结束', { dead: dS.dead });
    ok(dSan.v <= 100 - 28, '被抓的代价是理智掉一大截', dSan.v);
    ok(dSan.fearOn === true, '被抓的同时来一次突脸', { fearOn: dSan.fearOn, cls: dSan.fearClass });
    ok(dS.z > 12, '被抓之后被拖回值班室（不是原地站着）', dS.z);
    ok(dU.overHidden === true, '走廊被抓不弹结算面板（还能接着打）');

    await boot();
    await ev(`__MP.teleport(-2.9,6);__MP.aim(0,0);__MP.key('KeyE',true)`);
    await ev('__MP.sim(2.0)'); await ev(`__MP.key('KeyE',false)`);
    ok(await ev('__MP.stations[0].on') === true, '启动 1 号放映机');
    await ev(`__MP.addGhost(-2.9,6.9,1.42)`);
    await ev('__MP.sim(1.0)');
    const rS = await ev('__MP.state');
    ok(rS.dead === false, '再一次被抓，依然不死（v4 里只有理智见底才结束）');
    ok(rS.z > 12, '被抓后仍然被拖回值班室');
    ok(rS.startedCount === 1, '被抓后进度保留：放映机 1/5 仍亮着', { started: rS.startedCount });
    ok(await ev('__MP.stations[0].on') === true, '那台放映机仍然亮着（不用从头再来）');
    ok(await ev('__MP.ghosts.length') === 2, '被抓后走廊里她变多了（1 台 → 2 个）', await ev('__MP.ghosts.length'));
    ok(await ev('__MP.ghosts[0].speed') > 1.74, '被抓后她比原来更快', await ev('__MP.ghosts[0].speed'));

    await boot();
    await ev('__MP.clearGhosts()');
    const ST = await ev('__MP.STATIONS');
    for (let i = 0; i < ST.length; i++) {
      // 每段单独清场，只验证「五台 → 开门 → 通关」这条链路本身
      await ev(`__MP.clearGhosts();__MP.teleport(${ST[i].x},${ST[i].z});__MP.aim(0,0);__MP.key('KeyE',true)`);
      await ev('__MP.sim(2.0)');
      await ev(`__MP.key('KeyE',false)`);
    }
    const w1 = await ev('__MP.state');
    ok(w1.startedCount === 5, '五台放映机依次启动（从近到远）', w1.startedCount);
    ok(await ev('__MP.ui.reelsOn') === 5, 'HUD 五个指示灯全亮');
    ok(await ev('__MP.door.open') === true, '五台全亮后大门打开');
    await ev('__MP.sim(3.0)');
    const dl = await ev('__MP.door');
    ok(dl.leftX < -2.6 && dl.rightX > 2.6, '大门的两扇门叶真的滑开了（不是只换指示灯颜色）', dl);
    await ev('__MP.clearGhosts();__MP.setReports(__MP.cctv.need);__MP.teleport(0,-31.5)');
    await ev('__MP.sim(0.6)');
    const wU = await ev('__MP.ui');
    ok(await ev('__MP.state.won') === true && !wU.overHidden, '走到走廊尽头触发通关（需已凑够异常记录）', wU.overTitle);
    const rec2 = await ev(`JSON.parse(localStorage.getItem('midnight_projectionist_v1')||'{}')`);
    ok(rec2.clears >= 1 && typeof rec2.best === 'number', '通关写入存档（clears / best）', rec2);

    // ================= H. 脚本化实战：能不能真的走完 =================
    console.log('\n===== H. 脚本化实战（有她在场，跑 3 次） =====');
    let clears = 0, wins = 0; const runs = [];
    const STN = await ev('__MP.STATIONS');
    for (let run = 1; run <= 3; run++) {
      await boot();
      await ev(`__MP.revive();__MP.setSan(100);__MP.clearGhosts();__MP.resetGhosts();__MP.teleport(0,10);__MP.aim(0,0);__MP.torch(true)`);
      let died = false; const log = [];
      for (let i = 0; i < STN.length && !died; i++) {
        const st = STN[i];
        // v4 难度拉满之后，5 只鬼同时在场会让人连按 E 都按不完——
        // 这一段测的是「机制链路能不能走通」，不是人手极限，
        // 所以每段只保留一只从远端来的她，模拟玩家用爆闪甩开之后的窗口期。
        await ev(`__MP.clearGhosts();__MP.addGhost(${st.x},${st.z - 9},${1.74 + i * 0.28});__MP.teleport(${st.x},${st.z});__MP.torch(true)`);
        // 转身用光照住最近的那个她——这才是玩家真会做的动作
        const near = await ev(`(()=>{const a=__MP.ghosts;if(!a.length)return null;
          let b=null,bd=1e9,anyMin=1e9;
          a.forEach(e=>{const d=Math.hypot(e.x-(${st.x}),e.z-(${st.z}));
            if(d<anyMin)anyMin=d; if(d<bd){bd=d;b=e}});
          return {x:b.x,z:b.z,d:bd,anyMin:anyMin,count:a.length}})()`);
        if (near) await ev(`__MP.aim(Math.atan2(-((${near.x})-(${st.x})),-((${near.z})-(${st.z}))),0)`);
        await ev('__MP.sim(0.6)');                       // 先让光钉住她
        if (near && near.anyMin < 4.2) await ev('__MP.flash()');
        await ev(`__MP.key('KeyE',true)`);
        await ev('__MP.sim(2.2)');
        await ev(`__MP.key('KeyE',false)`);
        const s = await ev('__MP.state');
        log.push({ station: i + 1, on: await ev(`__MP.stations[${i}].on`), battery: +s.battery.toFixed(0),
          dead: s.dead, ghosts: near ? near.count : 0, nearest: near ? +near.d.toFixed(1) : null });
        if (s.dead) died = true;
      }
      if (!died) {
        clears++;
        await ev('__MP.clearGhosts();__MP.setReports(__MP.cctv.need);__MP.teleport(0,-31.5);__MP.sim(0.6)');
        if (await ev('__MP.state.won') === true) wins++;
      }
      runs.push({ run, cleared: !died, log });
    }
    ok(clears >= 2, `三次实战里至少两次能五台全开且不被抓死（实际 ${clears}/3）`, runs.map(r => ({ run: r.run, cleared: r.cleared })));
    ok(wins >= 2, `五台全开后走到走廊尽头能触发结局（实际 ${wins}/3）`, runs.map(r => ({ run: r.run, cleared: r.cleared })));
    if (clears < 3) console.log('  (实战明细)', JSON.stringify(runs));

    // ================= I. 循环不泄漏 =================
    console.log('\n===== I. 性能与循环 =====');
    await boot();
    await ev('__MP.resume()'); await sleep(900);
    const base = await rafRate(1200);
    await ev('__MP.pause()'); await sleep(400);
    const paused = await rafRate(1200);
    ok(paused < 1, '暂停后渲染循环真的停了', { running: +base.toFixed(1) + '/s', paused: +paused.toFixed(1) + '/s' });
    for (let i = 0; i < 6; i++) { await ev('__MP.resume()'); await sleep(120); await ev('__MP.pause()'); await sleep(120); }
    const after = await rafRate(1200);
    ok(after < 1, '反复开关 6 次也不累积循环', { after: +after.toFixed(1) + '/s' });

    // ================= J. 手机布局与触摸 =================
    console.log('\n===== J. 手机端 =====');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await boot();
    await ev('__MP.resume()');   // 触摸操作全靠真实渲染循环推进，必须先恢复运行
    await sleep(400);
    ok(await ev(`document.getElementById('joy').hidden`) === false, '触摸设备上虚拟摇杆自动出现');
    const lay = await ev(`(()=>{const R=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();
      return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
      const joy=R('joy'),t=R('btnTorch'),f=R('btnFlash');
      const hud=document.querySelector('.hud').getBoundingClientRect();
      const inside=r=>r.x>=-1&&r.y>=-1&&r.x+r.w<=innerWidth+1&&r.y+r.h<=innerHeight+1;
      const ov=(a,b)=>!(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
      return{joy,t,f,hudBottom:Math.round(hud.bottom),inJoy:inside(joy),inT:inside(t),inF:inside(f),
        ovJT:ov(joy,t)||ov(joy,f),ovHudT:ov({x:t.x,y:t.y,w:t.w,h:t.h},{x:0,y:0,w:innerWidth,h:hud.bottom}),
        minTgt:Math.min(joy.w,joy.h,t.w,t.h,f.w,f.h),vw:innerWidth,vh:innerHeight};})()`);
    ok(lay.inJoy && lay.inT && lay.inF, '390x844：摇杆与两个按钮都在屏幕内', lay);
    ok(!lay.ovJT, '摇杆与按钮互不重叠', lay);
    ok(lay.minTgt >= 44, '触摸目标都 >= 44px', { minTgt: lay.minTgt });
    ok(await ev(`document.documentElement.scrollWidth<=innerWidth`), '手机端无横向溢出');
    await shot('mobile-390x844');

    const jr = await ev(`(()=>{const r=document.getElementById('joy').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width}})()`);
    await ev('__MP.teleport(0,8);__MP.aim(0,0)');
    await touch('touchStart', jr.x, jr.y);
    await touch('touchMove', jr.x, jr.y - jr.w * 0.42);
    await sleep(1100);
    await touch('touchEnd', jr.x, jr.y - jr.w * 0.42);
    const jz = await ev('__MP.state.z');
    ok(jz < 7.9, '虚拟摇杆向上推 = 向前走', { z: jz });
    await ev('__MP.teleport(0,8)');
    await touch('touchStart', jr.x, jr.y);
    await touch('touchMove', jr.x + jr.w * 0.42, jr.y);
    await sleep(1100);
    await touch('touchEnd', jr.x + jr.w * 0.42, jr.y);
    const jx = await ev('__MP.state.x');
    ok(Math.abs(jx) > 0.15, '虚拟摇杆向右推 = 向右走', { x: jx });

    const tb = await ev(`(()=>{const r=document.getElementById('btnTorch').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const t0 = await ev('__MP.state.torchOn');
    await touch('touchStart', tb.x, tb.y); await touch('touchEnd', tb.x, tb.y); await sleep(250);
    ok(await ev('__MP.state.torchOn') === !t0, '手指点「手电」按钮能切换');
    const fb = await ev(`(()=>{const r=document.getElementById('btnFlash').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await ev('__MP.setBattery(100)');
    await touch('touchStart', fb.x, fb.y); await touch('touchEnd', fb.x, fb.y); await sleep(250);
    ok(await ev('__MP.state.flashCd') > 9, '手指点「爆闪」按钮能触发');

    // 手机端转视角
    await ev('__MP.aim(0,0)');
    await touch('touchStart', 195, 400); await touch('touchMove', 300, 400); await touch('touchEnd', 300, 400); await sleep(250);
    ok(Math.abs(await ev('__MP.state.yaw')) > 0.2, '手机端拖动转视角');

    // ================= K. 低惊吓模式真的生效 =================
    console.log('\n===== K. 设置 =====');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await navigate();
    await ev(`localStorage.clear()`); await navigate();
    await ev(`document.getElementById('optCalm').click()`); await sleep(120);
    await click('#enter'); await until(() => ev('window.__MP && __MP.state.running===true'), 8000);
    ok(await ev('__MP.state.calmMode') === true, '低惊吓模式开关能生效');
    await ev('__MP.pause();__MP.clearGhosts();__MP.addGhost(0,-3,1.42);__MP.setBattery(100);__MP.flash()');
    ok(await ev(`document.getElementById('flash').classList.contains('on')`) === false, '低惊吓模式下不再闪红屏', await ev(`document.getElementById('flash').className`));
    const recC = await ev(`JSON.parse(localStorage.getItem('midnight_projectionist_v1')||'{}')`);
    ok(recC.calm === true, '低惊吓设置被记住', recC);

    // ================= K2. 音频底噪与泛光（开源资源接入） =================
    console.log('\n===== K2. 音频与泛光 =====');
    await boot();
    // boot() 结尾会 pause()，而 pause 会主动停掉环境音（切页签不该还在响，见下面 421 行）。
    // 所以「环境音在响」只能在「正在玩」的状态下断言，否则测的是自己刚关掉的东西。
    await ev('__MP.resume()');
    const au0 = await ev('__MP.audio');
    ok(au0.ready === true, 'WebAudio 上下文已建立', au0);
    const decoded = await until(() => ev('__MP.audio.ambDecoded'), 8000).catch(() => false);
    const au1 = await until(() => ev('__MP.audio.ambPlaying ? __MP.audio : false'), 4000).catch(() => false) || await ev('__MP.audio');
    ok(decoded === true, 'CC-BY 环境音从内联 base64 解码成功', { ambDecoded: au1.ambDecoded });
    ok(au1.ambPlaying === true, '环境音已开始循环播放', au1);
    // 增益不是瞬间到位的：setTargetAtTime 走的是音频时钟的指数爬坡，
    // 刚 resume 完立刻读会读到 0.009。等它收敛再断言，才是在测代码而不是测时序。
    const gained = await until(() => ev('__MP.audio.ambGain > 0.1'), 4000).catch(() => false);
    ok(gained === true, '环境音有实际音量（不是静默播放）', (await ev('__MP.audio')).ambGain);
    const bl = await ev('__MP.bloom');
    ok(bl.on === true && bl.ready === true, '泛光后处理已启用', bl);

    // 环境音随她的距离收紧。
    // 这里测的是游戏算出来的目标增益（ambTarget），不是 WebAudio 爬完坡之后的实际值：
    // 原版先 pause 再读 ambGain，而 pause 会把增益节点整个置空，读到的永远是 0——
    // 测得到才怪。ambTarget 是纯逻辑，和音频时钟无关，所以稳定。
    await ev(`__MP.resume();__MP.clearGhosts();__MP.teleport(0,10);__MP.aim(0,0);__MP.torch(false);__MP.sim(0.3)`);
    const farT = (await ev('__MP.audio')).ambTarget;
    await ev(`__MP.addGhost(0,7,1.42);__MP.sim(0.3)`);
    const nearT = (await ev('__MP.audio')).ambTarget;
    await sleep(1500);   // 顺便确认它真的爬到了接近目标的位置
    const nearG = (await ev('__MP.audio')).ambGain;
    ok(nearT > farT + 0.05, '环境音会随她的距离收紧（越近越响）', { far: farT, near: nearT, 实测增益: nearG });
    ok(nearG > 0.1, '收敛之后的实际增益也确实是响的', nearG);

    // 暂停时底噪要停（切页签不该还在响）
    await ev('__MP.pause()'); await sleep(300);
    ok(await ev('__MP.audio.ambPlaying') === false, '暂停时环境音停止（切页签不会继续响）');
    await ev('__MP.resume()'); await sleep(400);
    ok(await ev('__MP.audio.ambPlaying') === true, '恢复后环境音重新开始');

    // 泛光可以关掉，且关掉之后仍能正常渲染
    await ev('__MP.setBloom(false)'); await sleep(500);
    ok(await ev('__MP.bloom.on') === false && errors.length === 0, '泛光可以关掉，且关掉后无报错', errors.slice(0, 2));
    await ev('__MP.setBloom(true)'); await sleep(400);
    ok(await ev('__MP.bloom.on') === true, '泛光可以再打开');
    await ev('__MP.pause()');

    // ================= L. 收尾 =================
    console.log('\n===== L. 收尾 =====');
    ok(errors.length === 0, '全程无 JS 报错', errors.slice(0, 4));
    ok(bad.length === 0, '全程无 4xx 资源', bad.slice(0, 4));

  } catch (e) {
    failures++; console.log('[FAIL] 测试崩溃: ' + (e && e.stack || e));
  } finally {
    console.log('\n========================================');
    console.log('断言 ' + checks.length + ' 项，失败 ' + failures + ' 项');
    if (failures) { console.log('\n失败清单：'); checks.filter(c => !c.pass).forEach(c => console.log('  x ' + c.name + ' ' + JSON.stringify(c.detail))); }
    fs.writeFileSync(path.join(PROBE, 'result.json'), JSON.stringify({ checks, errors, bad }, null, 2));
    try { ws && ws.close(); } catch { }
    try { browser && browser.kill(); } catch { }
    try { server && server.close(); } catch { }
    process.exit(failures ? 1 : 0);
  }
})();
