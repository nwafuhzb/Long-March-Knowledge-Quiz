export const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>长征知识竞赛</title><link rel="stylesheet" href="/style.css"><script src="/client.js" defer></script></head>
<body><div class="terrain" aria-hidden="true"></div><main class="shell">
<header><span class="mark" aria-hidden="true">★</span><div><h1>长征知识竞赛</h1><span id="role-label"></span></div><span id="connection" role="status"></span></header>
<section id="login" class="panel" hidden><h2>主持人入口</h2><form id="login-form"><label for="password">主持口令</label><input id="password" type="password" required autocomplete="current-password"><button>进入比赛</button></form></section>
<p id="message" role="status"></p>
<div id="contest" hidden><section id="stage" class="panel"></section><section id="controls"></section><section id="scores" aria-label="四队积分"></section><details id="sharing" hidden><summary>投屏与队伍入口</summary><div id="links"></div></details></div>
</main></body></html>`;

export const css = `
:root{color-scheme:dark;--ink:#fff0d4;--gold:#efb965;--red:#642222;--line:#efb96545;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;background:#231112;color:var(--ink)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 80% 6%,#73332b,#351717 54%,#211112 90%)}[hidden]{display:none!important}
.terrain{position:fixed;inset:0;pointer-events:none;overflow:hidden;opacity:.35}.terrain:before,.terrain:after{content:"";position:absolute;inset:35% -5% 0;background:#a05c45;clip-path:polygon(0 65%,9% 52%,16% 58%,26% 31%,32% 47%,40% 27%,48% 44%,54% 37%,62% 57%,75% 20%,87% 48%,93% 36%,100% 56%,100% 100%,0 100%)}.terrain:after{background:#271213;transform:translateY(10%) scaleX(-1)}
.shell{position:relative;width:min(1240px,94%);margin:auto;padding:clamp(18px,4vw,48px) 0}
header{display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--line);padding-bottom:18px}h1{font-family:"Songti SC","SimSun",serif;font-size:clamp(26px,5vw,54px);letter-spacing:.08em;margin:0;color:var(--ink)}.mark{color:var(--gold);font-size:clamp(27px,4vw,46px)}#role-label,#connection,.meta{color:var(--gold);font-size:clamp(14px,1.6vw,20px)}#connection{margin-left:auto;text-align:right}#message{min-height:1.4em;margin:10px 0;color:#ffd59a}
.panel{background:#391b1bef;border:1px solid var(--line);border-radius:22px;padding:clamp(18px,4vw,46px);box-shadow:0 18px 50px #1b0a0b66}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.timer{font-variant-numeric:tabular-nums;font-weight:800;font-size:clamp(32px,6vw,80px);line-height:1;color:var(--gold)}
h2{font-size:clamp(22px,3.4vw,50px);line-height:1.45;margin:14px 0 22px;overflow-wrap:anywhere}.options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.option{background:#ffffff08;border:1px solid var(--line);padding:12px 18px;border-radius:10px;font-size:clamp(16px,2.2vw,32px)}.option b{color:var(--gold);margin-right:.6em}.answer{margin-top:18px;padding:12px 16px;border-left:4px solid var(--gold);background:#efb96518;font-size:clamp(18px,2.4vw,30px)}
#controls:not(:empty),#scores,details{margin-top:16px}.row,form{display:flex;flex-wrap:wrap;align-items:center;gap:10px}form{margin-top:12px}button,input,select,a.link{font:inherit;border-radius:9px;padding:10px 14px;min-height:44px}button,a.link{color:#261314;background:var(--gold);border:1px solid transparent;font-weight:700;cursor:pointer;text-decoration:none}button.secondary{background:#512929;color:var(--ink);border-color:var(--line)}button:disabled{opacity:.45;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #fff0d4;outline-offset:2px}input,select{background:#291616;color:var(--ink);border:1px solid var(--line);max-width:100%}input[type=number]{width:90px}.blank{width:min(180px,100%)}
#scores{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.score{min-width:0;background:#391b1bef;border:1px solid var(--line);border-radius:12px;padding:12px}.score div{display:flex;justify-content:space-between;gap:4px}.score strong{color:var(--gold);font-size:1.2em}progress{width:100%;height:10px;accent-color:var(--gold)}summary{cursor:pointer;color:var(--gold);padding:10px 0}#links{display:flex;gap:10px;flex-wrap:wrap}.team{text-align:center}.team h2{margin:12px auto}.team .timer{margin:14px 0}.buzz{width:min(100%,340px);min-height:100px;border-radius:24px;margin:16px auto 0;font-size:32px}.buzz:enabled{box-shadow:0 0 28px #efb96555}.screen #stage{min-height:44vh}
@media(max-width:600px){.options,#scores{grid-template-columns:repeat(2,minmax(0,1fr))}.option{padding:8px}.shell{width:92%}}
`;

function startClient() {
  const $ = id => document.getElementById(id);
  const labels = { ready: '等待主持人开始', countdown: '读题时间', open: '抢答开始', won: '已抢到答题权', closed: '本题已锁定' };
  const kinds = { choice: '单选题', boolean: '判断题', fill: '填空题' };
  const [linkRole, linkToken] = location.hash.slice(1).split(':');
  const role = location.pathname === '/screen' ? 'screen' : location.pathname === '/team' ? linkRole : 'host';
  const host = role === 'host';
  const team = ['1', '2', '3', '4'].includes(role);
  let credential = host ? sessionStorage.getItem('host-secret') || '' : linkToken;
  let state, signature, offset = 0, busy = false, fresh = false, sequence = 0;
  $('role-label').textContent = host ? '主持台' : team ? ['一队', '二队', '三队', '四队'][Number(role) - 1] : '比赛大屏';
  document.body.classList.toggle('screen', role === 'screen');

  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const button = (action, label, disabled = false) => '<button class="secondary" data-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  const options = (question, format) => question.options?.map((text, index) => format(escape(text), String.fromCharCode(65 + index))).join('') || '';

  function tick() {
    if (!state) return;
    const left = state.phase === 'countdown' ? Math.max(0, Math.ceil((state.deadline - Date.now() - offset) / 1000)) : null;
    const timer = $('timer');
    if (timer) timer.textContent = left === null ? '—' : String(left).padStart(2, '0');
    const buzz = $('buzz');
    if (buzz) buzz.disabled = busy || !fresh || !['open', 'countdown'].includes(state.phase) || (left !== null && left > 0);
  }

  function render() {
    const { current, total, phase, winner, question, correct, answer, seconds, started, revealed, scores, finished } = state;
    $('login').hidden = true;
    $('contest').hidden = false;
    const status = winner === null ? labels[phase] : scores[winner].name + '抢答成功' + (correct === null ? '' : correct ? ' · 答对 +2.5 分' : ' · 答错');
    const timer = '<span class="timer" id="timer">—</span>';
    const round = '第 ' + (current + 1) + ' / ' + total + ' 题';
    if (team) {
      $('stage').classList.add('team');
      $('stage').innerHTML = '<div class="meta">' + round + '</div><h2>' + escape(finished ? '比赛结束' : status) + '</h2>' + timer +
        '<div><button class="buzz" id="buzz" data-action="buzz" disabled>抢答</button></div>';
    } else {
      $('stage').innerHTML = '<div class="top"><div class="meta">' + round + ' · ' + kinds[question.type] + '<br>' + escape(finished ? '比赛结束 · ' + status : status) + '</div>' + timer +
        '</div><h2>' + escape(question.prompt).replace(/_+/g, '＿＿＿') + '</h2><div class="options">' +
        options(question, (text, letter) => '<div class="option"><b>' + letter + '</b>' + text + '</div>') + '</div>' +
        (revealed ? '<div class="answer">正确答案　' + escape(answer) + '</div>' : '');
    }
    if (host) {
      const active = ['countdown', 'open', 'won'].includes(phase);
      let controls = '<div class="row">' + button('prev', '上一题', current === 0 || active) + button('next', '下一题', current + 1 === total || active) +
        button('start', '开始倒计时', phase !== 'ready') + button('reveal', '显示正确答案', revealed || !['open', 'closed'].includes(phase)) + '</div>';
      if (!started) controls += '<form id="settings"><label for="seconds">每题读题时间（秒）</label><input id="seconds" type="number" value="' + seconds + '" min="1" max="120" required><button>保存</button></form>';
      if (phase === 'won') {
        const fields = question.type === 'fill'
          ? Array.from({ length: question.blanks }, (_, i) => '<input class="blank" aria-label="第 ' + (i + 1) + ' 空" placeholder="第 ' + (i + 1) + ' 空" maxlength="100" required>').join('')
          : '<select aria-label="队伍答案" required><option value="">选择队伍答案</option>' +
            options(question, (text, letter) => '<option value="' + letter + '">' + letter + '　' + text + '</option>') + '</select>';
        controls += '<form id="answer-form">' + fields + '<button>提交并判分</button></form>';
      }
      $('controls').innerHTML = controls;
      if (state.links && !$('links').children.length) {
        $('sharing').hidden = false;
        for (const [id, link] of Object.entries(state.links)) {
          const address = new URL(link, location.origin).href;
          const label = id === 'screen' ? '大屏' : scores[Number(id) - 1].name;
          const a = document.createElement('a');
          a.className = 'link'; a.href = address; a.textContent = '打开' + label; a.target = '_blank'; a.rel = 'noopener noreferrer';
          const copy = document.createElement('button');
          copy.className = 'secondary'; copy.textContent = '复制' + label + '链接';
          copy.onclick = async () => {
            try { await navigator.clipboard.writeText(address); $('message').textContent = '已复制' + label + '链接'; }
            catch { window.prompt(label + '链接', address); }
          };
          $('links').append(a, copy);
        }
      }
    }
    $('scores').hidden = team;
    if (!team) $('scores').innerHTML = scores.map(({name, score}) => '<div class="score"><div><span>' + escape(name) +
      '</span><strong>' + score + '</strong></div><progress aria-label="' + escape(name) + '积分" max="100" value="' + score + '"></progress></div>').join('');
    tick();
  }

  async function request(action) {
    if (!credential) return;
    const version = ++sequence;
    const before = Date.now();
    try {
      const response = await fetch('/api/state', {
        headers: { 'x-quiz-role': role, authorization: 'Bearer ' + credential, 'content-type': 'application/json' },
        method: action ? 'POST' : 'GET', body: action ? JSON.stringify({ ...action, visit: state.visit }) : undefined,
        signal: AbortSignal.timeout(4500)
      });
      const data = await response.json();
      if (version !== sequence) return;
      if (host && response.status === 401) {
        sessionStorage.removeItem('host-secret'); credential = ''; $('login').hidden = false; $('contest').hidden = true;
      }
      if (!response.ok) throw new Error(data.error);
      offset = data.now - (Date.now() + before) / 2;
      state = { ...data, links: data.links || state?.links };
      fresh = true;
      $('connection').textContent = '已连接';
      if (!action && $('message').dataset.network === 'true') $('message').textContent = '';
      $('message').dataset.network = 'false';
      const { now, ...view } = state;
      const next = JSON.stringify(view);
      if (next !== signature) { signature = next; render(); }
      else tick();
    } catch (error) {
      if (version !== sequence) return;
      if (!action) { fresh = false; $('connection').textContent = '连接中断'; }
      $('message').textContent = error.name === 'TimeoutError' || error.name === 'TypeError' ? '连接比赛服务失败，正在尝试重新连接' : error.message;
      $('message').dataset.network = String(!action);
      tick();
    }
  }

  async function act(data) {
    if (!state || busy) return;
    busy = true;
    $('message').textContent = '';
    tick();
    try { await request(data); } finally { busy = false; tick(); }
  }

  $('login-form').onsubmit = event => {
    event.preventDefault(); credential = $('password').value;
    sessionStorage.setItem('host-secret', credential); $('password').value = ''; request();
  };
  document.addEventListener('click', event => {
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'prev' || action === 'next') act({ action: 'navigate', direction: action === 'prev' ? -1 : 1 });
    else act({ action });
  });
  $('controls').addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.id === 'settings') act({ action: 'settings', seconds: Number($('seconds').value) });
    else if (event.target.id === 'answer-form') {
      const select = event.target.querySelector('select');
      const answer = select ? select.value : Array.from(event.target.querySelectorAll('input'), input => input.value.trim());
      act({ action: 'submit', answer });
    }
  });

  if (host && !credential) $('login').hidden = false;
  else if (!credential || (!team && role !== 'screen')) $('message').textContent = '请使用主持人发给你的专属入口链接';
  let polling = false;
  async function poll() {
    if (polling || busy) return;
    polling = true;
    try { await request(); } finally { polling = false; }
  }
  poll();
  setInterval(poll, 500);
  setInterval(tick, 80);
}

export const client = '(' + startClient.toString() + ')();';
