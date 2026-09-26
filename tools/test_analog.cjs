// 《午夜放映员 · 模拟恐怖网站版》行为测试：真机 Edge + CDP
// 覆盖：素材内联、VHS/OSD 外观、女鬼换成真实图像、值班台开关与暂停、
//       异常识别循环（漏报 / 误报 / 难度递增 / 假异常陷阱）、四格推进致死、
//       通关双条件、隐藏档案页、手机端布局、无报错无 404。
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = __dirname, GAME = path.join(ROOT, 'outputs', 'midnight-projectionist'), PROBE = path.join(ROOT, '_probe_analog');
fs.mkdirSync(PROBE, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9394, WEB = 8924;
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
const VK = { KeyQ: 81, KeyW: 87, KeyE: 69, KeyF: 70, KeyC: 67, Space: 32, Escape: 27, Digit1: 49, Digit3: 51 };
async function keyTap(code) {
  const p = { code, key: code === 'Space' ? ' ' : code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code], nativeVirtualKeyCode: VK[code] };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}
async function boot() {
  await navigate();
  await until(() => ev('!!window.__MP'), 10000);
  await click('#enter');
  await until(() => ev('window.__MP && __MP.state.running===true'), 10000);
  await ev('__MP.pause()');
}
const C = () => ev('__MP.cctv');

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

    // ================= A. 素材全部内联 =================
    console.log('\n===== A. 恐怖素材内联 =====');
    await boot();
    const art = await ev('__MP.art');
    ok(art.length === 15, '内联素材共 15 张（含 4 张突脸变体 + 2 个新房间）', art.map(a => a.k));
    ok(art.every(a => a.data === 'data:image/'), '每张都是 data: URI（file:// 下也能显示）', art.filter(a => a.data !== 'data:image/'));
    ok(art.every(a => a.n > 2000), '每张都有实际内容（>2KB base64）', art.map(a => a.k + ':' + a.n));
    ok(art.find(a => a.k === 'face') && art.find(a => a.k === 'face').n > 100000, 'jumpscare 大图已内联', art.find(a => a.k === 'face'));

    // ================= B. 模拟恐怖外观 =================
    console.log('\n===== B. VHS / CRT 外观 =====');
    const look = await ev(`(()=>{const g=document.getElementById('game');
      return { filt:getComputedStyle(document.getElementById('app')).filter,
        band:!!document.querySelector('.band'), scan:getComputedStyle(document.querySelector('.scanline')).opacity,
        osdInGame:!!document.querySelector('#game .osd'), osdHiddenBefore:__MP.osd.gameHidden,
        tc:__MP.osd.tc, grainAnim:getComputedStyle(document.querySelector('.grain')).animationName };})()`);
    ok(/saturate/.test(look.filt) && /contrast/.test(look.filt), '画面被压成监控色调（saturate + contrast）', look.filt);
    ok(look.band && look.scan, 'VHS 磁带条与 CRT 扫描线都在', { band: look.band, scan: look.scan });
    ok(look.osdInGame, 'OSD 时间码属于游戏界面，不在开始页外泄');
    ok(/^1996-11-04 \d\d:\d\d:\d\d$/.test(look.tc), 'OSD 显示 1996-11-04 磁带时间码', look.tc);
    const tc2 = await until(async () => { const t = await ev('__MP.osd.tc'); return t !== look.tc ? t : false; }, 4000);
    ok(tc2 !== look.tc, '时间码在真的走', { a: look.tc, b: tc2 });
    ok(await ev(`!!document.querySelector('.osd .rec i')`), 'REC 指示灯存在');

    // ================= C. 女鬼换成真实图像 =================
    console.log('\n===== C. 女鬼：从几何体换成真实照片 =====');
    const gv = await until(async () => { const v = await ev('__MP.ghostVisual(0)'); return v && v.texW > 0 ? v : false; }, 10000);
    ok(gv && gv.isSprite === true, '女鬼是 Sprite（billboard），不是几何体拼的', gv);
    ok(gv.matType === 'SpriteMaterial', '材质换成 SpriteMaterial', gv.matType);
    ok(gv.hasMap && gv.texW > 0 && gv.texH > 0, '真实贴图已解码', { w: gv.texW, h: gv.texH });
    ok(Math.abs(gv.scaleY - 2.3) < 0.05 && gv.scaleX > 1.2 && gv.scaleX < 1.8, '贴图比例正确（身高 2.3 米，未拉伸变形）', { sx: gv.scaleX, sy: gv.scaleY });
    // 距离越远越暗（贴图是自发光材质，必须手动压暗）
    const bright = await ev(`(()=>{const S=__MP.CFG;
      __MP.clearGhosts(); __MP.addGhost(0, -6); __MP.setBattery(100); __MP.torch(true);
      __MP.teleport(0, -6+3); __MP.aim(0,0); __MP.setBattery(100); __MP.sim(0.4);
      const near=__MP.ghostVisual(0).color;
      __MP.teleport(0, -6+11); __MP.setBattery(100); __MP.sim(0.4);
      const far=__MP.ghostVisual(0).color;
      return {near, far};})()`);
    ok(bright.near > bright.far, '近处亮、远处退成灰影（手动按距离压暗）', bright);

    // ================= D. 值班台：开关与暂停 =================
    console.log('\n===== D. 值班台 =====');
    const c0 = await C();
    ok(c0.open === false, '一开始值班台是关着的');
    const opened = await ev('__MP.openCctv()');
    ok(opened === true, '可以打开值班台', opened);
    ok((await C()).open === true, '状态记为已打开');
    ok(await ev('document.getElementById("cctv").hidden===false'), '值班台界面显示出来了');
    ok((await ev('__MP.state.running')) === false, '打开值班台时走廊暂停（坐在台前，她不动）');
    const cams = await until(async () => { const d = await ev('__MP.camDom()'); return d.length === 6 && d.every(x => x.bgW > 0) ? d : false; }, 10000);
    ok(cams.length === 6, '六路监控画面都在', cams.map(c => c.bg));
    ok(cams.every(c => c.bg === 'data:image/'), '每路画面用的是内联实拍/生成素材');
    ok(cams.every(c => /^\d\d:\d\d:\d\d$/.test(c.tc)), '每路画面带自己的磁带时间码', cams[0].tc);
    const cn = await ev('__MP.cams()');
    ok(cn.length === 6 && cn.every(c => c.has), '六个房间各有各的背景素材', cn.map(c => c.n + ' ' + c.t));
    await ev('__MP.cctvSel(2)');
    ok((await C()).sel === 2, '点击可以选中某一路画面');
    await keyTap('Digit1');
    ok((await C()).sel === 0, '数字键 1-6 也能选画面');
    await keyTap('Digit6');
    ok((await C()).sel === 5, '第六路（新增的片库）也能选中');
    await keyTap('KeyC');
    ok((await C()).open === false, 'C 键关掉值班台');
    ok(await ev('document.getElementById("cctv").hidden===true'), '值班台界面收起来了');
    ok((await ev('__MP.state.running')) === true, '关掉后走廊恢复运行');
    await ev('__MP.openCctv()');
    const batDrop = await ev(`(()=>{const a=__MP.state.battery; __MP.cctvAdvance(0.1); __MP.cctvAdvance(0.1);
      __MP.cctvAdvance(0.1); __MP.cctvAdvance(0.1); return +(a-__MP.state.battery).toFixed(2)})()`);
    ok(batDrop > 0, '待在值班台要掉电（不是免费的避风港）', batDrop);

    // ================= E. 异常识别循环 =================
    console.log('\n===== E. 异常识别 =====');
    const f1 = await ev('__MP.cctvReport()');
    ok(f1.falseAlarms === 1 && f1.reports === 0, '画面上没异常却上报 -> 误报', { f: f1.falseAlarms, r: f1.reports });
    ok(f1.trackG === 1, '误报一次她就推进一格（与画面上的文案一致）', { trackG: f1.trackG });

    await ev('__MP.setTrack(0)');
    const forced = await ev('__MP.cctvForce(1,"her")');
    ok(forced.anom && forced.anom.real === true, '真异常：走廊尽头出现人形', forced.anom);
    const dom1 = await ev('__MP.camDom()');
    ok(dom1[1].her > 0.2 && dom1[0].her === 0, '只有出问题的那一路画面上出现人形', dom1.map(d => d.her));

    // 选错路 = 误报。四路画面必须真的看，不能闭眼按空格
    await ev('__MP.cctvSel(2)');
    const wrongCam = await ev('__MP.cctvReport()');
    ok(wrongCam.falseAlarms === 2 && wrongCam.reports === 0 && wrongCam.anom !== null,
      '选中没有异常的那一路上报 -> 误报，且异常还在（不白送）',
      { f: wrongCam.falseAlarms, r: wrongCam.reports, anomStill: !!wrongCam.anom });
    ok(wrongCam.trackG === 1, '选错路也推进一格（判断力才是这一层的玩法）', { trackG: wrongCam.trackG });
    await ev('__MP.setTrack(0)');

    await ev('__MP.cctvSel(1)');
    const bat0 = await ev('__MP.state.battery');
    const rep = await ev('__MP.cctvReport()');
    ok(rep.reports === 1 && rep.anom === null, '报对了：记一条，异常清空', { r: rep.reports });
    const bat1 = await ev('__MP.state.battery');
    ok(bat1 > bat0, '报对了还给电量奖励（值班 = 回电）', { before: bat0, after: bat1 });
    ok((await ev('__MP.camDom()'))[1].her === 0, '报完之后画面恢复正常');

    await ev('__MP.cctvForce(2,"black")');
    const dom2 = await ev('__MP.camDom()');
    ok(/dark/.test(dom2[2].cls), '真异常：某一路断电黑屏', dom2[2].cls);
    const m1 = await ev('__MP.cctvAdvance(61)');
    ok(m1.misses === 1 && m1.trackG === 1, '放着不管 -> 漏报一次、她推进一格', { misses: m1.misses, trackG: m1.trackG });
    ok(await ev('document.querySelectorAll("#wall .cam")[2].classList.contains("dark")===false'), '漏报后画面也恢复');

    await ev('__MP.setTrack(0)');
    await ev('__MP.cctvForce(0,"blast"); __MP.cctvSel(0)');
    const f2 = await ev('__MP.cctvReport()');
    ok(f2.reports === 1 && f2.falseAlarms === 3, '磁带噪点是假的，报上去算误报，不算记录', { r: f2.reports, f: f2.falseAlarms });
    await ev('__MP.setTrack(0)');
    await ev('__MP.cctvForce(0,"track")');
    const m2 = await ev('__MP.cctvAdvance(61)');
    ok(m2.trackG === 0 && m2.misses === 1, '磁带失真相不报 -> 不罚（不该报的没报，是对的）', { t: m2.trackG, m: m2.misses });

    // 难度递增：窗口越来越短、人形越来越淡
    const spawnAt = async (reports) => ev(`(()=>{__MP.setReports(${reports}); __MP.setTrack(-50); __MP.setMisses(0);
      return __MP.cctvSpawn().anom})()`);
    const early = await spawnAt(0);
    const late = await spawnAt(5);
    ok(early.real === true && early.total > 6, '开局只会给真异常，窗口也最长', early);
    ok(late.total < early.total - 1.5, '记录越多窗口越短（越来越难辨认）', { early: early.total, late: late.total });
    ok(late.op < early.op - 0.2, '人形也越淡，越难看出来', { early: early.op, late: late.op });

    // 低难度池子里没有陷阱；高难度才有
    const poolLow = await ev(`(()=>{const t=[];for(let i=0;i<40;i++){__MP.setReports(0);__MP.setMisses(0);__MP.setTrack(-50);
      t.push(__MP.cctvSpawn().anom.real)}return t.filter(x=>!x).length})()`);
    const poolHigh = await ev(`(()=>{const t=[];for(let i=0;i<80;i++){__MP.setReports(5);__MP.setTrack(-50);
      t.push(__MP.cctvSpawn().anom.real)}return t.filter(x=>!x).length})()`);
    ok(poolLow === 0, '低难度里不会出现"磁带干扰"陷阱（先教会你什么是异常）', poolLow);
    ok(poolHigh > 0, '高难度里混进"磁带干扰"陷阱（不能见异常就报）', { 假异常: poolHigh, 共: 80 });

    // ================= F. 隐藏档案页 =================
    console.log('\n===== F. 多页面与隐藏内容 =====');
    await click('.ctTab[data-tab="log"]');
    await sleep(200);
    const tabbed = await ev(`({log:document.getElementById('logPage').hidden, wall:document.getElementById('wall').hidden,
      rows:document.getElementById('logList').innerHTML.length})`);
    ok(tabbed.log === false && tabbed.wall === true, '值班日志是独立一页', tabbed);
    ok(tabbed.rows > 60, '日志里记了条目', tabbed.rows);
    await click('#fileLink');
    await sleep(300);
    const fileImg = await until(async () => { const w = await ev('document.getElementById("fileImg").naturalWidth'); return w > 0 ? w : false; }, 8000);
    const fp = await ev(`({hidden:document.getElementById('filePage').hidden, w:document.getElementById('fileImg').naturalWidth})`);
    ok(fp.hidden === false && fileImg > 0, '隐藏档案 07 能调阅出真实影像', fp);
    await click('.ctTab[data-tab="wall"]'); await sleep(150);
    ok(await ev(`document.getElementById('filePage').hidden===true && document.getElementById('wall').hidden===false`), '切回监控墙时档案页收起来');

    // ================= G. 四格推进 -> 她进值班室 =================
    console.log('\n===== G. 四格：她进值班室 =====');
    await ev('__MP.revive(); __MP.setReports(1)');
    await ev('if(!__MP.cctv.open && !__MP.openCctv()) throw new Error("值班台打不开"); true');
    await ev('__MP.setTrack(3); __MP.cctvForce(3,"her")');
    const dg = await ev('__MP.cctvAdvance(61)');
    ok(dg.trackG >= 4, '第四格满了', { trackG: dg.trackG });
    const g1 = await ev('__MP.san');
    ok(g1.siegeT >= 0, '满格不立刻黑屏：她得自己从门外走进来', { siegeT: g1.siegeT });
    ok(g1.inCtrl === true, '这最后一段发生在值班室里，不是走廊');
    ok(await ev('document.getElementById("cctv").hidden===true'), '她进门时值班台自动收起（你得抬头看她）');
    await ev('__MP.sim(1.0)');
    const g2 = await ev('__MP.ctrl');
    ok(Math.abs(g2.doorL - g2.doorLClosed) > 0.9, '值班室的门被她撞开了', g2);
    await ev('__MP.sim(2.0)');
    const g3 = await ev('__MP.san');
    ok(g3.fearOn === true, '她走到你面前 = 突脸（不是黑屏了事）', { phase: g3.phase, fearOn: g3.fearOn });
    ok(g3.fearImgLen > 2000, '突脸铺的是真实特写，不是文字提示', g3.fearImgLen);
    await shot('g-siege');
    await ev('__MP.sim(1.8)');
    ok((await ev('__MP.state.dead')) === true, '贴完脸 = 结束（不是扣点血）');
    const over = await ev(`(()=>{const c=document.getElementById('overCard');const im=c.querySelector('img.ocimg');
      return {title:(c.querySelector('h2')||{}).textContent||'', img: im? im.src.slice(0,22):'', hidden:document.getElementById('over').hidden};})()`);
    ok(over.title.indexOf('值班室') >= 0, '结局文案是"她进了值班室"', over.title);
    ok(over.img === 'data:image/jpeg;base64', '结局用了高潮画面（监控室里的她）', over.img);
    await shot('g-death-by-door');

    // 低惊吓模式下不做 jumpscare
    await click('#overCard button');
    await sleep(400);
    await ev('__MP.revive(); __MP.pause(); __MP.setCalm(true)');
    await ev('if(!__MP.cctv.open) __MP.openCctv(); true');
    await ev('__MP.setTrack(3); __MP.cctvForce(3,"her")');
    await ev('__MP.cctvAdvance(61)');
    await ev('__MP.sim(0.9); __MP.sim(2.0)');
    const calmFace = await ev('!document.getElementById("fear").classList.contains("on")');
    ok(calmFace === true, '低惊吓模式不弹全屏脸（当众演示用）', calmFace);
    await ev('__MP.sim(1.8)');
    await ev('__MP.setCalm(false)');
    await click('#overCard button');
    await sleep(400);

    // ================= H. 通关要两条都满足 =================
    console.log('\n===== H. 通关双条件 =====');
    await ev('__MP.pause(); __MP.clearGhosts(); __MP.setReports(0); __MP.startAllStations(); __MP.teleport(0, __MP.DOOR_Z-1)');
    await ev('__MP.sim(0.2)');
    const h1 = await ev('({won:__MP.state.won, prompt:__MP.ui.promptTxt, stat:__MP.ui.statTxt})');
    ok(h1.won === false, '五台全开但异常记录不够 -> 大门不给开', h1);
    ok(/还差/.test(h1.prompt), '会明确告诉你还差几条', h1.prompt);
    ok(/异常记录 0 \/ 5/.test(h1.stat), 'HUD 上能看到异常记录进度', h1.stat);
    await ev('__MP.setReports(5)');
    await ev('__MP.sim(0.3)');
    const h2 = await ev('({won:__MP.state.won, title:(document.querySelector("#overCard h2")||{}).textContent||""})');
    ok(h2.won === true, '五条异常记录 + 五台放映机 -> 通关', h2);

    // ================= I. 手机端 =================
    console.log('\n===== I. 手机端 =====================');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(400);
    await ev('__MP.revive(); __MP.setReports(1)');
    await ev('if(!__MP.cctv.open && !__MP.openCctv()) throw new Error("值班台打不开"); true');
    await sleep(500);
    const mob = await ev(`(()=>{const r=document.getElementById('reportBtn').getBoundingClientRect();
      const c=document.getElementById('cctvClose').getBoundingClientRect();
      const cam=document.querySelector('#wall .cam').getBoundingClientRect();
      return {xOver:document.documentElement.scrollWidth>innerWidth, rep:Math.round(r.height), close:Math.round(c.height),
              camW:Math.round(cam.width), camH:Math.round(cam.height), vis:r.top>=0&&r.bottom<=innerHeight};})()`);
    ok(!mob.xOver, '值班台在 390x844 下不横向溢出', mob);
    ok(mob.rep >= 40 && mob.close >= 40, '按钮触摸目标够大', mob);
    ok(mob.camW > 78 && mob.camH > 44, '六路画面在小屏上仍然看得见', mob);
    await shot('i-phone-cctv');

    // ================= J. 收尾 =================
    console.log('\n===== J. 收尾 =====');
    ok(errors.length === 0, '无 JS 报错', errors.slice(0, 4));
    ok(bad.length === 0, '无 404 / 资源加载失败', bad.slice(0, 4));

    // file:// 双击打开也要能用
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await navigate('file:///' + GAME.replace(/\\/g, '/') + '/index.html');
    const fOK = await until(async () => { const v = await ev('window.__MP ? __MP.art.length : 0'); return v === 15 ? v : false; }, 12000).catch(() => 0);
    ok(fOK === 15, 'file:// 双击打开素材照样全部加载（CORS 绕开成功）', fOK);
    if (fOK === 15) { await click('#enter'); await until(() => ev('__MP.state.running===true'), 8000); await ev('__MP.pause(); __MP.openCctv()'); await sleep(600); await shot('j-file-protocol'); }

    console.log('\n' + '='.repeat(42));
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
