import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { grade } from './src/worker.mjs';
import { database } from './local.mjs';
import bank from './src/questions.mjs';

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
  for (const [id, link] of Object.entries(first.links)) credentials[id] = link.split(':').at(-1);
  assert.equal((await call('host', { action: 'settings', seconds: 1, visit: 0 })).status, 200);
  let now = Date.now();
  const clock = Date.now;
  Date.now = () => now;
  try {
    let winningRole = '1';
    for (const [visit, question] of bank.entries()) {
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
      assert.equal((await post('host', 'submit', { answer })).status, 200);
      assert.equal((await post('host', 'submit', { answer })).status, 409);
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
    const result = await host('submit', 1, {answer: 'A'});
    assert.equal(result.correct, false);
    assert.equal(result.scores[0].score, 0);
  } finally { Date.now = now; }
});

