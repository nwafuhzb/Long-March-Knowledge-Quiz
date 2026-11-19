import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { grade, redrawPendingContest } from './src/worker.mjs';
import { database } from './local.mjs';
import bank from './src/questions.mjs';
import questionBank from './src/question-bank.mjs';

test('题库、授权、计时、并发抢答、重复提交和满分', async () => {
  assert.deepEqual(['choice', 'boolean', 'fill'].map(type => bank.filter(item => item.type === type).length), [20, 10, 10]);
  assert.equal(grade(bank[3], ['１９３４ 年', '１０月']), true);
  assert.equal(grade(bank[3], ['1934']), false);
  assert.equal(grade(bank.find(q => q.type === 'fill' && q.source === 44), ['党和人民利益']), true);
  const env = { DB: database(), QUIZ_SECRET: 'local-test-only' };
  const credentials = { host: env.QUIZ_SECRET };
  async function call(role, input) {
    const response = await worker.fetch(new Request('http://localhost/api/state', {
      method: input ? 'POST' : 'GET', body: input && JSON.stringify(input),
      headers: { 'x-quiz-role': role, authorization: 'Bearer ' + credentials[role] }
    }), env);
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await call('screen')).status, 401);
  const first = (await call('host')).data;
  assert.deepEqual(first.questionCounts, { choice: 20, boolean: 10, fill: 10 });
  const draw = JSON.parse((await env.DB.prepare('SELECT state FROM contest WHERE id = 1').first()).state).questionIds;
  assert.equal(new Set(draw).size, 40);
  const drawnQuestions = draw.map(id => questionBank.find(question => question.type + ':' + question.source === id));
  assert.deepEqual(['choice', 'boolean', 'fill'].map(type => drawnQuestions.filter(item => item.type === type).length), [20, 10, 10]);
  for (const [id, link] of Object.entries(first.links)) credentials[id] = link.split(':').at(-1);
  assert.equal((await call('host', { action: 'settings', seconds: 1, visit: 0 })).status, 200);
  let now = Date.now();
  const clock = Date.now;
  Date.now = () => now;
  try {
    let winningRole = '1';
    for (const [visit, question] of drawnQuestions.entries()) {
      const post = (role, action, payload) => call(role, { action, visit, ...payload });
      assert.equal((await post('host', 'start')).status, 200);
      assert.equal((await post('1', 'buzz')).status, 409);
      assert.equal((await call('screen')).data.answer, undefined);
      assert.equal((await call('2')).data.question, undefined);
      now += 1000;
      const contenders = visit === 0 ? ['1', '2', '3', '4'] : [winningRole];
      const results = await Promise.all(contenders.map(role => post(role, 'buzz')));
      assert.equal(results.filter(result => result.status === 200).length, 1);
      winningRole = contenders[results.findIndex(result => result.status === 200)];
      assert.equal((await call('host')).data.winner, Number(winningRole) - 1);
      const answer = question.type === 'fill' ? question.answer.map(values => values[0]) : question.answer;
      if (question.type === 'fill') {
        const otherRole = winningRole === '1' ? '2' : '1';
        const entry = (await call(winningRole)).data;
        assert.equal(entry.fillEntry, undefined);
        assert.equal(entry.answer, undefined);
        assert.equal((await call(otherRole)).data.fillEntry, undefined);
        assert.equal((await post(otherRole, 'submit', { answer })).status, 409);
        assert.equal((await post(winningRole, 'submit', { answer })).status, 409);
        assert.equal((await post('host', 'submit', { answer: [] })).status, 409);
      }
      assert.equal((await post('host', 'submit', { answer })).status, 200);
      assert.equal((await post('host', 'submit', { answer })).status, 409);
      assert.equal((await call(winningRole)).data.fillEntry, undefined);
      assert.equal((await post('host', 'reveal')).status, 200);
      assert.equal(typeof (await call('screen')).data.answer, 'string');
      if (visit < 39) {
        assert.equal((await post('host', 'navigate', { direction: 1 })).status, 200);
        assert.equal((await post('1', 'buzz')).status, 409);
      }
    }
    const { data } = await call('host');
    assert.equal(data.finished, true);
    assert.deepEqual(data.scores.map(team => team.score), ['1', '2', '3', '4'].map(role => role === winningRole ? 100 : 0));
    assert.equal((await call('host', { action: 'navigate', direction: -1, visit: 39 })).status, 200);
    assert.equal((await call('host', { action: 'start', visit: 40 })).status, 409);
  } finally { Date.now = clock; }
});

test('无人抢答可公布答案，答错不扣分', async () => {
  const env = { DB: database(), QUIZ_SECRET: 'test' };
  const now = Date.now;
  let time = now();
  Date.now = () => time;
  const send = async (role, credential, payload) => {
    const response = await worker.fetch(new Request('http://localhost/api/state', {
      method: payload ? 'POST' : 'GET', body: payload ? JSON.stringify(payload) : undefined,
      headers: { 'x-quiz-role': role, authorization: 'Bearer ' + credential }
    }), env);
    assert.equal(response.status, 200);
    return response.json();
  };
  const host = (action, visit, extra) => send('host', 'test', action && {action, visit, ...extra});
  try {
    const state = await host();
    await host('start', 0);
    time += 10000;
    assert.equal((await host('reveal', 0)).phase, 'closed');
    await host('navigate', 0, {direction: 1});
    await host('start', 1);
    time += 10000;
    await send('1', state.links['1'].split(':').at(-1), {action: 'buzz', visit: 1});
    const saved = JSON.parse((await env.DB.prepare('SELECT state FROM contest WHERE id = 1').first()).state);
    const question = questionBank.find(item => item.type + ':' + item.source === saved.questionIds[1]);
    const wrongAnswer = question.type === 'fill' ? question.answer.map(() => '无效答案') : (question.answer === 'A' ? 'B' : 'A');
    const result = await host('submit', 1, {answer: wrongAnswer});
    assert.equal(result.correct, false);
    assert.equal(result.scores[0].score, 0);
  } finally { Date.now = now; }
});

test('自定义题量在开赛前生效，重启保留数量和已开始的题序', async () => {
  const env = { DB: database(), QUIZ_SECRET: 'test' };
  async function host(payload) {
    return worker.fetch(new Request('http://localhost/api/state', {
      method: payload ? 'POST' : 'GET', body: payload && JSON.stringify(payload),
      headers: { 'x-quiz-role': 'host', authorization: 'Bearer test' }
    }), env);
  }
  const saved = async () => JSON.parse((await env.DB.prepare('SELECT state FROM contest WHERE id = 1').first()).state);
  const first = await (await host()).json();
  const counts = { choice: 3, boolean: 0, fill: 2 };
  assert.equal((await host({ action: 'draw', counts: { ...counts, boolean: 81 }, total: 86, visit: first.visit })).status, 409);
  assert.equal((await host({ action: 'draw', counts, total: 6, visit: first.visit })).status, 409);
  assert.equal((await host({ action: 'draw', counts, total: 0, visit: first.visit })).status, 409);
  const draw = await host({ action: 'draw', counts, total: 5, visit: first.visit });
  assert.equal(draw.status, 200);
  assert.equal((await draw.json()).total, 5);
  await redrawPendingContest(env.DB);
  const pending = await saved();
  assert.deepEqual(pending.counts, counts);
  assert.equal(new Set(pending.questionIds).size, 5);
  assert.equal(pending.questionIds.filter(id => id.startsWith('choice:')).length, 3);
  assert.equal(pending.questionIds.filter(id => id.startsWith('fill:')).length, 2);
  assert.equal((await host({ action: 'start', visit: pending.visit })).status, 200);
  assert.equal((await host({ action: 'draw', counts, visit: pending.visit })).status, 409);
  await redrawPendingContest(env.DB);
  assert.deepEqual((await saved()).questionIds, pending.questionIds);
});


test('新版题库完整导入并可抽取全部 220 道', async () => {
  const env = { DB: database(), QUIZ_SECRET: 'test' };
  const request = payload => worker.fetch(new Request('http://localhost/api/state', {
    method: payload ? 'POST' : 'GET', body: payload && JSON.stringify(payload),
    headers: { 'x-quiz-role': 'host', authorization: 'Bearer test' }
  }), env);
  const first = await (await request()).json();
  assert.equal(first.bankTotal, 220);
  assert.deepEqual(first.questionLimits, { choice: 80, boolean: 80, fill: 60 });
  for (const [type, count] of Object.entries(first.questionLimits)) {
    const rows = questionBank.filter(question => question.type === type);
    assert.deepEqual(rows.map(question => question.source), Array.from({length:count}, (_, index) => index + 1));
    for (const row of rows) {
      assert.ok(row.prompt);
      if (type === 'fill') assert.equal(row.answer.length, row.prompt.match(/_+/g).length);
      else assert.equal(row.options.length, type === 'choice' ? 4 : 2);
    }
  }
  const response = await request({ action: 'draw', total: 220, counts: first.questionLimits, visit: first.visit });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 220);
  const saved = JSON.parse((await env.DB.prepare('SELECT state FROM contest WHERE id = 1').first()).state);
  assert.equal(new Set(saved.questionIds).size, 220);
  const tooMany = await request({ action: 'draw', total: 221, counts: first.questionLimits, visit: saved.visit });
  assert.equal(tooMany.status, 409);
});

test('赛前一次提交设置进入比赛，尚未倒计时的题序也可恢复', async () => {
  const env = { DB: database(), QUIZ_SECRET: 'test' };
  const request = payload => worker.fetch(new Request('http://localhost/api/state', {
    method: payload ? 'POST' : 'GET', body: payload && JSON.stringify(payload),
    headers: { 'x-quiz-role': 'host', authorization: 'Bearer test' }
  }), env);
  const first = await (await request()).json();
  const setup = { action: 'begin', counts: { choice: 2, boolean: 1, fill: 1 }, total: 4, seconds: 15, visit: first.visit };
  assert.equal((await request({...setup, seconds: 0})).status, 409);
  assert.equal((await request({...setup, total: 5})).status, 409);
  const response = await request(setup);
  assert.equal(response.status, 200);
  const ready = await response.json();
  assert.equal(ready.prepared, true);
  assert.equal(ready.seconds, 15);
  assert.equal(ready.total, 4);
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.deadline, null);
  const before = (await env.DB.prepare('SELECT state FROM contest WHERE id = 1').first()).state;
  await redrawPendingContest(env.DB);
  assert.equal((await env.DB.prepare('SELECT state FROM contest WHERE id = 1').first()).state, before);
  assert.equal((await request({...setup, visit: ready.visit})).status, 409);
  assert.equal((await request({action:'settings', seconds:20, visit:ready.visit})).status, 409);
  assert.equal((await request({action:'start', visit:ready.visit})).status, 200);
});


