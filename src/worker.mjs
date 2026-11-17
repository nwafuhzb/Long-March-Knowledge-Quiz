import questions from './questions.mjs';
import { page, css, client } from './ui.mjs';

const teams = ['一队', '二队', '三队', '四队'];
const roles = ['host', 'screen', '1', '2', '3', '4'];
const encoder = new TextEncoder();
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
const json = (data, status = 200) => Response.json(data, { status, headers });

async function token(secret, role) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(role))), x => x.toString(16).padStart(2, '0')).join('');
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

const initial = () => ({
  current: 0, visit: 0, seconds: 10, started: false,
  rounds: questions.map(() => ({ deadline: null, winner: null, correct: null, revealed: false }))
});

function phase(round, now) {
  if (round.revealed || round.correct !== null) return 'closed';
  if (round.winner !== null) return 'won';
  if (round.deadline === null) return 'ready';
  return now < round.deadline ? 'countdown' : 'open';
}

export function grade(question, answer) {
  if (question.type !== 'fill') return question.answer === answer;
  if (!Array.isArray(answer) || answer.length !== question.answer.length) return false;
  const blanks = Array.from(question.prompt.matchAll(/_+([年月日省县镇山里])?/g));
  return question.answer.every((accepted, index) => {
    const unit = blanks[index][1];
    const normalize = value => {
      const clean = String(value).normalize('NFKC').trim();
      return unit && clean.endsWith(unit) ? clean.slice(0, -1).trimEnd() : clean;
    };
    return accepted.some(value => normalize(value) === normalize(answer[index]));
  });
}

function snapshot(state, role, now) {
  const round = state.rounds[state.current];
  const { prompt, type, options, answer } = questions[state.current];
  const counts = teams.map((_, index) => state.rounds.filter(item => item.winner === index && item.correct).length);
  return {
    current: state.current, visit: state.visit, total: questions.length, seconds: state.seconds,
    started: state.started, now, deadline: round.deadline, phase: phase(round, now),
    winner: round.winner, correct: round.correct, revealed: round.revealed,
    scores: teams.map((name, index) => ({ name, score: counts[index] * 2.5 })),
    finished: state.rounds.every(item => item.revealed || item.correct !== null),
    ...(role === 'host' || role === 'screen' ? {
      question: { prompt, type, options, blanks: (prompt.match(/_+/g) || []).length },
      ...(round.revealed ? { answer: type === 'fill' ? answer.map(values => values.join(' / ')).join('；') : options[answer.charCodeAt(0) - 65] } : {})
    } : {})
  };
}

function transition(state, role, body, now) {
  if (body.visit !== state.visit) return '题目已切换，请重试';
  const round = state.rounds[state.current];
  const status = phase(round, now);
  if (role !== 'host') {
    if (role === 'screen' || body.action !== 'buzz') return '此入口没有操作权限';
    if (status !== 'open') return '本题当前无法抢答';
    round.winner = Number(role) - 1;
    return;
  }
  switch (body.action) {
    case 'navigate': {
      const next = state.current + body.direction;
      if (![1, -1].includes(body.direction) || next < 0 || next >= questions.length) return '没有更多题目';
      if (status === 'countdown' || status === 'open' || status === 'won') return '请先完成本题或公布答案';
      state.current = next;
      state.visit++;
      return;
    }
    case 'settings':
      if (state.started || !Number.isInteger(body.seconds) || body.seconds < 1 || body.seconds > 120) return '开赛前可设置 1 至 120 秒';
      state.seconds = body.seconds;
      return;
    case 'start':
      if (status !== 'ready') return '本题已开始';
      state.started = true;
      round.deadline = now + state.seconds * 1000;
      return;
    case 'submit': {
      if (status !== 'won') return '请等待队伍抢到答题权';
      const question = questions[state.current];
      const valid = question.type === 'fill'
        ? Array.isArray(body.answer) && body.answer.length === question.answer.length && body.answer.every(value => typeof value === 'string' && value.trim() && value.length <= 100)
        : typeof body.answer === 'string' && question.options.some((_, index) => String.fromCharCode(65 + index) === body.answer);
      if (!valid) return '请完整录入队伍答案';
      round.correct = grade(question, body.answer);
      return;
    }
    case 'reveal':
      if (round.revealed || !['open', 'closed'].includes(status)) return '请在判分后或无人抢答时公布答案';
      round.revealed = true;
      return;
    default:
      return '无效操作';
  }
}

async function read(db) {
  const select = db.prepare('SELECT revision, state FROM contest WHERE id = 1');
  let record = await select.first();
  if (!record) {
    await db.prepare('INSERT OR IGNORE INTO contest (id, revision, state) VALUES (1, 0, ?)').bind(JSON.stringify(initial())).run();
    record = await select.first();
  }
  return record;
}

export default {
  async fetch(request, env) {
    try {
      const { pathname } = new URL(request.url);
      if (request.method === 'GET' && ['/', '/host', '/screen', '/team'].includes(pathname)) {
        return new Response(page, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'" } });
      }
      if (request.method === 'GET' && ['/style.css', '/client.js'].includes(pathname)) {
        return new Response(pathname === '/style.css' ? css : client, { headers: { ...headers,
          'content-type': pathname === '/style.css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' } });
      }
      if (pathname !== '/api/state') return json({ error: '页面不存在' }, 404);
      const role = request.headers.get('x-quiz-role');
      const credential = request.headers.get('authorization')?.slice(7) || '';
      if (!env.QUIZ_SECRET || !env.DB) return json({ error: '比赛服务尚未配置' }, 503);
      if (!roles.includes(role) || !equal(credential, role === 'host' ? env.QUIZ_SECRET : await token(env.QUIZ_SECRET, role))) {
        return json({ error: '入口无效，请向主持人获取比赛链接' }, 401);
      }
      const db = env.DB.withSession?.('first-primary') || env.DB;
      if (request.method === 'GET') {
        const record = await read(db);
        const links = role === 'host' ? Object.fromEntries(await Promise.all(roles.slice(1).map(async id => [
          id, (id === 'screen' ? '/screen' : '/team') + '#' + id + ':' + await token(env.QUIZ_SECRET, id)
        ]))) : undefined;
        return json({ ...snapshot(JSON.parse(record.state), role, Date.now()), links });
      }
      if (request.method !== 'POST') return json({ error: '无效请求' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: '无效请求' }, 400); }
      if (!body || typeof body !== 'object') return json({ error: '无效请求' }, 400);

      for (let attempt = 0; attempt < 5; attempt++) {
        const record = await read(db);
        const state = JSON.parse(record.state);
        const error = transition(state, role, body, Date.now());
        if (error) return json({ error }, 409);
        const result = await db.prepare('UPDATE contest SET revision = revision + 1, state = ? WHERE id = 1 AND revision = ?')
          .bind(JSON.stringify(state), record.revision).run();
        if (result.meta.changes === 1) return json(snapshot(state, role, Date.now()));
      }
      return json({ error: '比赛状态刚刚更新，请重试' }, 409);
    } catch (error) {
      console.error(error);
      return json({ error: '比赛服务暂时不可用' }, 500);
    }
  }
};
