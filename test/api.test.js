// API tests. The database is stubbed out, so these run without MongoDB:
//   npm test
process.env.JWT_SECRET = 'test-secret';
process.env.MONGO_URI = 'mongodb://unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const User = require('../models/User');
const Book = require('../models/Book');
const Request = require('../models/Request');
const Activity = require('../models/Activity');
const ActivityResponse = require('../models/ActivityResponse');
const StickyNote = require('../models/StickyNote');
const Media = require('../models/Media');
const PageItem = require('../models/PageItem');
const Recording = require('../models/Recording');

const oid = () => new mongoose.Types.ObjectId().toString();
const tokenFor = (role) => jwt.sign({ id: oid(), role, username: 'tester' }, process.env.JWT_SECRET);
const customer = tokenFor('customer');
const customerId = jwt.decode(customer).id;
const admin = tokenFor('admin');

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (method, path, { token, body, raw, contentType } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': contentType || 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data, headers: res.headers };
};

// ---------- auth ----------

test('register never lets a client choose its own role', async () => {
  let created;
  User.findOne = async () => null;
  User.create = async (doc) => ((created = doc), doc);

  const r = await call('POST', '/api/auth/register', {
    body: { username: 'Eve', email: 'Eve@Example.com', password: 'longenough', role: 'admin' },
  });
  assert.equal(r.status, 201);
  assert.equal(created.role, 'customer');
  assert.equal(created.email, 'eve@example.com');
  assert.notEqual(created.password, 'longenough');
});

test('register validates input and rejects duplicate emails', async () => {
  User.findOne = async () => null;
  const short = await call('POST', '/api/auth/register', {
    body: { username: 'Eve', email: 'eve@example.com', password: 'short' },
  });
  assert.equal(short.status, 400);

  const noBody = await call('POST', '/api/auth/register');
  assert.equal(noBody.status, 400);

  User.findOne = async () => ({ _id: oid() });
  const dup = await call('POST', '/api/auth/register', {
    body: { username: 'Eve', email: 'eve@example.com', password: 'longenough' },
  });
  assert.equal(dup.status, 409);
});

test('login: same error for unknown email and wrong password; token carries username', async () => {
  const user = { _id: oid(), username: 'Eve', role: 'customer', password: bcrypt.hashSync('rightpass1', 4) };

  User.findOne = async () => null;
  const unknown = await call('POST', '/api/auth/login', { body: { email: 'a1@x.com', password: 'whatever1' } });

  User.findOne = async () => user;
  const wrong = await call('POST', '/api/auth/login', { body: { email: 'a2@x.com', password: 'wrongpass1' } });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.data.msg, wrong.data.msg);

  const ok = await call('POST', '/api/auth/login', { body: { email: 'a3@x.com', password: 'rightpass1' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.role, 'customer');
  assert.equal(jwt.verify(ok.data.token, process.env.JWT_SECRET).username, 'Eve');
});

test('login is rate limited per email', async () => {
  User.findOne = async () => null;
  let last;
  for (let i = 0; i < 11; i++) {
    last = await call('POST', '/api/auth/login', { body: { email: 'limited@x.com', password: 'nope-nope' } });
  }
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('logout works (used to crash on an undefined variable)', async () => {
  const r = await call('POST', '/api/auth/logout', { token: customer });
  assert.equal(r.status, 200);
});

// ---------- authorization ----------

test('requests without a valid token get 401', async () => {
  assert.equal((await call('GET', '/api/books')).status, 401);
  assert.equal((await call('GET', '/api/books', { token: 'garbage' })).status, 401);
  const expired = jwt.sign({ id: oid(), role: 'customer' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const r = await call('GET', '/api/books', { token: expired });
  assert.equal(r.status, 401);
  assert.equal(r.data.msg, 'Session expired');
});

test('admin-only endpoints reject customers', async () => {
  const id = oid();
  const attempts = [
    ['POST', '/api/books', {}],
    ['PUT', `/api/books/${id}`, {}],
    ['DELETE', `/api/books/${id}`],
    ['GET', '/api/requests'],
    ['PATCH', `/api/requests/${id}/approve`],
    ['PATCH', `/api/requests/${id}/reject`],
    ['POST', '/api/activities', {}],
    ['PUT', `/api/activities/${id}`, {}],
    ['DELETE', `/api/activities/${id}`],
  ];
  for (const [method, path, body] of attempts) {
    const r = await call(method, path, { token: customer, body });
    assert.equal(r.status, 403, `${method} ${path} should be 403 for a customer`);
  }
});

// ---------- books ----------

const tinyPdf = Buffer.from('%PDF-1.4\n%fake\n').toString('base64');

test('book list leaves out the PDF payload', async () => {
  let selected;
  Book.find = () => ({
    select(s) { selected = s; return this; },
    sort() { return this; },
    lean: async () => [{ _id: oid(), title: 'T' }],
  });
  const r = await call('GET', '/api/books', { token: customer });
  assert.equal(r.status, 200);
  assert.equal(selected, '-file');
});

test('upload rejects non-PDFs and oversized PDFs, and never echoes the file back', async () => {
  const notPdf = await call('POST', '/api/books', {
    token: admin,
    body: { title: 'A', language: 'en', file: Buffer.from('hello world').toString('base64') },
  });
  assert.equal(notPdf.status, 400);

  const started = Date.now();
  const huge = await call('POST', '/api/books', {
    token: admin,
    body: { title: 'A', language: 'en', file: 'JVBER' + 'A'.repeat(14 * 1000 * 1000) },
  });
  assert.equal(huge.status, 400);
  assert.ok(Date.now() - started < 3000, 'validation of a large payload should be fast');

  const badCover = await call('POST', '/api/books', {
    token: admin,
    body: { title: 'A', language: 'en', file: tinyPdf, coverImage: 'data:text/html;base64,AAAA' },
  });
  assert.equal(badCover.status, 400);

  Book.create = async (doc) => ({ ...doc, _id: oid(), toObject() { return { ...doc, _id: this._id }; } });
  const ok = await call('POST', '/api/books', {
    token: admin,
    body: { title: ' Moby ', language: 'en', file: `data:application/pdf;base64,${tinyPdf}` },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.book.title, 'Moby');
  assert.equal(ok.data.book.file, undefined);
});

test('download and the download filename', async () => {
  const book = { _id: oid(), title: 'My: Book?', file: tinyPdf };
  Book.findById = () => ({ select: async () => book });
  User.updateOne = async () => ({});

  Request.exists = async () => ({ _id: oid() });
  const allowed = await call('GET', `/api/books/${book._id}/download`, { token: customer });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get('content-disposition'), /^attachment; filename="My_ Book_.pdf"/);

  const bad = await call('GET', '/api/books/not-an-id/file', { token: customer });
  assert.equal(bad.status, 400);
});

test('editing a title does not re-validate an unchanged (legacy) cover', async () => {
  const hugeLegacyCover = 'data:image/png;base64,' + 'A'.repeat(4 * 1000 * 1000); // > 2 MB, from before the limit
  const stored = {
    _id: oid(), title: 'Old', language: 'en', file: tinyPdf, coverImage: hugeLegacyCover, backCoverImage: '',
    toObject() { return { ...this }; },
    save: async function () { return this; },
  };
  Book.findById = async () => stored;

  const sameCover = await call('PUT', `/api/books/${stored._id}`, {
    token: admin, body: { title: 'New title', coverImage: hugeLegacyCover },
  });
  assert.equal(sameCover.status, 200);
  assert.equal(stored.title, 'New title');

  const newBigCover = await call('PUT', `/api/books/${stored._id}`, {
    token: admin, body: { coverImage: hugeLegacyCover + 'AAAA' },
  });
  assert.equal(newBigCover.status, 400);
});

test('covers saved without a data: prefix are recognised', async () => {
  const { parseImage } = require('../utils/files');
  assert.ok(parseImage('/9j/4AAQSkZJRg==', 'Cover').startsWith('data:image/jpeg;base64,'));
  assert.ok(parseImage('iVBORw0KGgoAAAANSUhEUg==', 'Cover').startsWith('data:image/png;base64,'));
  assert.throws(() => parseImage('hello', 'Cover'));
});

// ---------- activities ----------

const makeActivity = () => {
  const q1 = { _id: oid(), order: 1, type: 'multiple-choice', title: 'Q1', options: ['a', 'b'], correctAnswer: 'a', points: 10, hint: 'think', correctFeedback: 'yes', incorrectFeedback: 'no' };
  const q2 = { _id: oid(), order: 2, type: 'open-ended', title: 'Q2', correctAnswer: 'secret', points: 5, correctFeedback: 'ok', incorrectFeedback: 'no' };
  return { _id: oid(), bookId: oid(), pageIndex: 3, title: 'Act', description: 'd', questions: [q1, q2] };
};

test('students never receive the answer key; admins do', async () => {
  Request.exists = async () => ({ _id: oid() }); // approved readers
  const activity = makeActivity();
  Activity.find = () => ({ sort() { return this; }, lean: async () => [JSON.parse(JSON.stringify(activity))] });
  ActivityResponse.find = () => ({ lean: async () => [] });

  const student = await call('GET', `/api/activities/book/${activity.bookId}`, { token: customer });
  assert.equal(student.status, 200);
  assert.ok(!JSON.stringify(student.data).includes('correctAnswer'));
  assert.ok(!JSON.stringify(student.data).includes('secret'));
  assert.equal(student.data[0].userProgress.total, 2);
  assert.equal(student.data[0].isCompleted, false);

  const teacher = await call('GET', `/api/activities/book/${activity.bookId}`, { token: admin });
  assert.equal(teacher.data[0].questions[0].correctAnswer, 'a');

  Activity.findById = () => ({ lean: async () => JSON.parse(JSON.stringify(activity)) });
  const qs = await call('GET', `/api/activities/${activity._id}/questions`, { token: customer });
  assert.equal(qs.status, 200);
  assert.ok(!JSON.stringify(qs.data).includes('correctAnswer'));
});

test('submitting answers: scoring, feedback, no double answers', async () => {
  Request.exists = async () => ({ _id: oid() });
  const activity = makeActivity();
  const doc = {
    ...activity,
    questions: Object.assign([...activity.questions], {
      id: (qid) => activity.questions.find((q) => q._id === qid) || null,
    }),
  };
  Activity.findById = async () => doc;

  let existing = null;
  ActivityResponse.findOne = async () => existing;
  ActivityResponse.prototype.save = async function () { existing = this; return this; };

  const wrong = await call('POST', `/api/activities/${activity._id}/submit`, {
    token: customer,
    body: { questionId: activity.questions[0]._id, userAnswer: 'b' },
  });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.data.isCorrect, false);
  assert.equal(wrong.data.correctAnswer, 'a');
  assert.equal(wrong.data.hint, 'think');
  assert.equal(wrong.data.progress.answered, 1);
  assert.equal(wrong.data.progress.isCompleted, false);

  const again = await call('POST', `/api/activities/${activity._id}/submit`, {
    token: customer,
    body: { questionId: activity.questions[0]._id, userAnswer: 'a' },
  });
  assert.equal(again.status, 409);

  const open = await call('POST', `/api/activities/${activity._id}/submit`, {
    token: customer,
    body: { questionId: activity.questions[1]._id, userAnswer: 'my thoughts' },
  });
  assert.equal(open.data.isCorrect, true);
  assert.equal(open.data.pointsEarned, 5);
  assert.equal(open.data.progress.isCompleted, true);
  assert.equal(open.data.progress.totalPointsEarned, 5);

  const missing = await call('POST', `/api/activities/${activity._id}/submit`, {
    token: customer,
    body: { questionId: activity.questions[0]._id, userAnswer: '   ' },
  });
  assert.equal(missing.status, 400);

  const nope = await call('POST', `/api/activities/${activity._id}/submit`, {
    token: customer,
    body: { questionId: 'not-a-question', userAnswer: 'x' },
  });
  assert.equal(nope.status, 404);
});

// ---------- misc ----------

test('sticky note updates only touch whitelisted fields', async () => {
  let captured;
  StickyNote.findOneAndUpdate = async (filter, updates) => ((captured = { filter, updates }), { text: 'x' });
  const id = oid();
  const r = await call('PUT', `/api/stickynotes/${id}`, {
    token: customer,
    body: { text: 'hello', x: 5, userId: 'someone-else', bookId: 'other' },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(captured.updates, { text: 'hello', x: 5 });
  assert.ok(captured.filter.userId, 'update is scoped to the signed-in user');
});

test('reading progress: saves the page per book and reads it back', async () => {
  const bookId = oid();
  let update;
  Book.exists = async () => true;
  User.updateOne = async (filter, doc) => { update = { filter, doc }; return {}; };
  User.findById = () => ({ select: () => ({ lean: async () => ({ lastPages: { [bookId]: 7 } }) }) });

  const put = await call('PUT', `/api/users/progress/${bookId}`, { token: customer, body: { pageIndex: 7 } });
  assert.equal(put.status, 200);
  assert.deepEqual(update.doc, { $set: { [`lastPages.${bookId}`]: 7 } });

  const get = await call('GET', `/api/users/progress/${bookId}`, { token: customer });
  assert.equal(get.status, 200);
  assert.equal(get.data.pageIndex, 7);

  for (const bad of [-1, 1.5, 'x', null]) {
    const r = await call('PUT', `/api/users/progress/${bookId}`, { token: customer, body: { pageIndex: bad } });
    assert.equal(r.status, 400);
  }
  const anon = await call('PUT', `/api/users/progress/${bookId}`, { body: { pageIndex: 1 } });
  assert.equal(anon.status, 401);
});

test('peeking inside only shows the back cover, never the book', async () => {
  const id = oid();
  const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const chain = (v) => { const o = { select: () => o, sort: () => o, lean: async () => v }; return o; };
  Book.find = () => chain([{ _id: id, title: 'Sipho', language: 'isiZulu', level: 'B', coverImage: img }]);
  Book.findById = () => chain({ _id: id, title: 'Sipho', language: 'isiZulu', level: 'B', backCoverImage: img, coverImage: 'FRONT', file: 'SECRET' });

  const list = await call('GET', '/api/public/books');
  assert.equal(list.status, 200);
  assert.equal(list.data[0].level, 'B');
  assert.equal(JSON.stringify(list.data).includes('SECRET'), false);

  const prev = await call('GET', `/api/public/books/${id}/preview`);
  assert.equal(prev.status, 200);
  assert.equal(prev.data.backCoverImage, img);
  assert.equal(JSON.stringify(prev.data).includes('SECRET'), false);
  assert.equal(prev.data.coverImage, undefined);
  assert.equal(prev.data.pages, undefined);

  assert.equal((await call('GET', `/api/books/${id}/file`)).status, 401);
});

test('logging in is not enough: reading and downloading need an approved request', async () => {
  const id = oid();
  const book = { _id: id, title: 'Sipho', file: tinyPdf };
  Book.findById = () => ({ select: async () => book });
  let approved = false;
  Request.exists = async () => (approved ? { _id: oid() } : null);

  const denied = await call('GET', `/api/books/${id}/file`, { token: customer });
  assert.equal(denied.status, 403);
  assert.equal((await call('GET', `/api/books/${id}/download`, { token: customer })).status, 403);

  approved = true;
  User.updateOne = async () => ({});
  assert.equal((await call('GET', `/api/books/${id}/file`, { token: customer })).status, 200);

  approved = false; // a teacher can always open every book
  assert.equal((await call('GET', `/api/books/${id}/file`, { token: admin })).status, 200);
});

test('books have a level B, C or D (level A was removed)', async () => {
  let created;
  Book.create = async (doc) => { created = doc; return { toObject: () => ({ _id: oid(), ...doc }) }; };
  const base = { title: 'T', language: 'isiXhosa', file: tinyPdf };

  const ok = await call('POST', '/api/books', { token: admin, body: { ...base, level: 'c' } });
  assert.equal(ok.status, 201);
  assert.equal(created.level, 'C');
  assert.equal((await call('POST', '/api/books', { token: admin, body: { ...base, level: 'E' } })).status, 400);
  assert.equal((await call('POST', '/api/books', { token: admin, body: { ...base, level: 'A' } })).status, 400);
  await call('POST', '/api/books', { token: admin, body: base });
  assert.equal(created.level, 'B'); // default
  assert.equal((await call('POST', '/api/books', { token: customer, body: base })).status, 403);
});

// ---------- media: audio / pictures / videos placed on pages ----------

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40)]);
const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(40)]);

test('uploads are identified by their contents, not their name', async () => {
  let saved;
  Book.exists = async () => true;
  Media.create = async (doc) => { saved = doc; return { _id: oid() }; };
  const up = (kind, buf, who = admin) => call('POST', `/api/media?bookId=${oid()}&kind=${kind}`, { token: who, raw: buf, contentType: 'application/octet-stream' });

  const png = await up('image', PNG);
  assert.equal(png.status, 201);
  assert.equal(saved.mime, 'image/png');
  assert.equal((await up('audio', MP3)).data.mime, 'audio/mpeg');
  assert.equal((await up('video', MP4)).data.mime, 'video/mp4');
  assert.equal((await up('audio', MP4)).data.mime, 'audio/mp4'); // an m4a recording

  assert.equal((await up('audio', PNG)).status, 400);                       // a picture pretending to be a sound
  assert.equal((await up('image', Buffer.from('<script>alert(1)</script>'))).status, 400);
  assert.equal((await up('video', MP3)).status, 400);
  assert.equal((await up('image', Buffer.concat([PNG, Buffer.alloc(3.2 * 1024 * 1024)]))).status, 413);
  assert.equal((await up('banana', PNG)).status, 400);
  assert.equal((await up('image', PNG, customer)).status, 403);
  assert.equal((await call('POST', `/api/media?bookId=${oid()}&kind=image`, { raw: PNG, contentType: 'image/png' })).status, 401);
});

test('a file placed in a book can only be fetched by approved readers', async () => {
  const bookId = oid();
  const doc = { _id: oid(), bookId, mime: 'audio/mpeg', data: MP3 };
  Media.findById = () => ({ select: async () => doc });
  let approved = false;
  Request.exists = async () => (approved ? { _id: oid() } : null);

  assert.equal((await call('GET', `/api/media/${doc._id}`)).status, 401);
  assert.equal((await call('GET', `/api/media/${doc._id}`, { token: customer })).status, 403);
  approved = true;
  const ok = await call('GET', `/api/media/${doc._id}`, { token: customer });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'audio/mpeg');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  approved = false;
  assert.equal((await call('GET', `/api/media/${doc._id}`, { token: admin })).status, 200); // teachers always can
});

test('page items: placing sounds, pictures, videos and hotspots', async () => {
  const bookId = oid();
  let created;
  Book.exists = async () => true;
  Media.exists = async () => ({ _id: oid() });
  PageItem.create = async (doc) => { created = doc; return { _id: oid(), ...doc }; };
  const make = (body, token = admin) => call('POST', '/api/page-items', { token, body: { bookId, pageIndex: 2, ...body } });

  assert.equal((await make({ type: 'audio', x: 40.126, y: 20, mediaId: oid(), label: 'Listen' })).status, 201);
  assert.equal(created.x, 40.13);
  assert.equal((await make({ type: 'hotspot', shape: 'circle', x: 10, y: 10, w: 12, color: '#FF4FA3', label: 'sun', text: 'The sun is hot.' })).status, 201);
  assert.equal(created.color, '#ff4fa3');

  const yt = await make({ type: 'video', x: 50, y: 50, youtubeUrl: 'https://www.youtube.com/watch?v=rGz5Qbq-VaM', start: 2, end: 5 });
  assert.equal(yt.status, 201);
  assert.equal(created.youtubeId, 'rGz5Qbq-VaM');
  assert.equal(created.end, 5);
  assert.equal((await make({ type: 'video', youtubeUrl: 'https://youtu.be/rGz5Qbq-VaM' })).status, 201);

  assert.equal((await make({ type: 'text', x: 10, y: 10, w: 40, text: '  A bird in a cage.  ', style: 'note', size: 'large' })).status, 201);
  assert.equal(created.text, 'A bird in a cage.');
  assert.equal(created.style, 'note');
  assert.equal((await make({ type: 'text', style: 'glitter' })).status, 400);
  assert.equal((await make({ type: 'text', size: 'huge' })).status, 400);
  assert.equal((await make({ type: 'text', text: 'x'.repeat(1001) })).status, 400);
  assert.equal((await make({ type: 'text', w: 2 })).status, 400);
  assert.equal((await make({ type: 'video', youtubeUrl: 'https://example.com/clip' })).status, 400);
  assert.equal((await make({ type: 'video', youtubeUrl: 'https://youtu.be/rGz5Qbq-VaM', start: 9, end: 3 })).status, 400);
  assert.equal((await make({ type: 'dance' })).status, 400);
  assert.equal((await make({ type: 'audio', x: 140 })).status, 400);
  assert.equal((await make({ type: 'hotspot', color: 'red' })).status, 400);
  assert.equal((await make({ type: 'audio', mediaId: 'nope' })).status, 400);
  Media.exists = async () => null; // a file from some other book
  assert.equal((await make({ type: 'audio', mediaId: oid() })).status, 400);
  assert.equal((await make({ type: 'audio' }, customer)).status, 403);

  // readers need approval to see what is on a book's pages
  Request.exists = async () => null;
  PageItem.find = () => ({ sort() { return this; }, lean: async () => [] });
  assert.equal((await call('GET', `/api/page-items/book/${bookId}`, { token: customer })).status, 403);
  Request.exists = async () => ({ _id: oid() });
  assert.equal((await call('GET', `/api/page-items/book/${bookId}`, { token: customer })).status, 200);
});

test('quiz questions can speak and show pictures; the answer audio waits until after answering', async () => {
  Request.exists = async () => ({ _id: oid() });
  const speak = oid(), answer = oid(), pic = oid();
  const q = { _id: oid(), order: 1, type: 'multiple-choice', title: 'Where?', options: ['Garden', 'Zoo'], optionImages: [pic, ''], correctAnswer: 'Garden', points: 10, audioId: speak, answerAudioId: answer, correctFeedback: 'yes', incorrectFeedback: 'no' };
  const activity = { _id: oid(), bookId: oid(), pageIndex: 8, title: 'Act', description: 'd', x: 40, y: 60, questions: [q] };
  Activity.find = () => ({ sort() { return this; }, lean: async () => [JSON.parse(JSON.stringify(activity))] });
  ActivityResponse.find = () => ({ lean: async () => [] });

  const list = await call('GET', `/api/activities/book/${activity.bookId}`, { token: customer });
  const sent = list.data[0].questions[0];
  assert.equal(sent.audioId, speak);
  assert.deepEqual(sent.optionImages, [pic, '']);
  assert.equal(sent.answerAudioId, undefined);
  assert.equal(list.data[0].x, 40);

  Activity.findById = async () => ({ ...activity, questions: Object.assign([q], { id: () => q }) });
  ActivityResponse.findOne = async () => null;
  ActivityResponse.prototype.save = async function () { return this; };
  const res = await call('POST', `/api/activities/${activity._id}/submit`, { token: customer, body: { questionId: q._id, userAnswer: 'Garden' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.answerAudioId, answer);
});

test('quiz questions: sounds and pictures must be this book\'s own files of the right kind', async () => {
  const bookId = oid(), snd = oid(), ans = oid(), pic1 = oid(), pic2 = oid();
  let created;
  Activity.create = async (doc) => { created = doc; return { _id: oid(), ...doc }; };
  Book.exists = async () => true;
  let library = [{ _id: snd, kind: 'audio' }, { _id: ans, kind: 'audio' }, { _id: pic1, kind: 'image' }, { _id: pic2, kind: 'image' }];
  Media.find = (q) => ({ select: () => ({ lean: async () => library.filter((m) => q._id.$in.includes(String(m._id))) }) });
  const q = { type: 'multiple-choice', title: 'Where?', options: ['Garden', 'Zoo'], correctAnswer: 'Garden', audioId: snd, answerAudioId: ans, optionImages: [pic1, pic2] };
  const make = (question) => call('POST', '/api/activities', { token: admin, body: { bookId, pageIndex: 8, title: 'A', description: 'd', questions: [question] } });

  const ok = await make(q);
  assert.equal(ok.status, 201);
  assert.deepEqual(created.questions[0].optionImages, [pic1, pic2]);
  assert.equal(created.questions[0].audioId, snd);
  assert.equal(created.questions[0].answerAudioId, ans);

  assert.equal((await make({ ...q, audioId: pic1 })).status, 400);             // a picture used as a sound
  assert.equal((await make({ ...q, optionImages: [snd, ''] })).status, 400);   // a sound used as a picture
  library = [];                                                                // files from some other book
  assert.equal((await make(q)).status, 400);
  assert.equal((await make({ ...q, audioId: 'nope' })).status, 400);
  assert.equal((await make({ type: 'true-false', title: 'T', correctAnswer: 'true' })).status, 201); // plain questions are unaffected
});

test('a quiz badge can be moved on the page (teachers only)', async () => {
  const saved = { x: null, y: null, save: async function () { return this; } };
  Activity.findById = async () => saved;
  const id = oid();
  const ok = await call('PUT', `/api/activities/${id}/position`, { token: admin, body: { x: 33.333, y: 70 } });
  assert.equal(ok.status, 200);
  assert.equal(saved.x, 33.33);
  assert.equal((await call('PUT', `/api/activities/${id}/position`, { token: admin, body: { x: 500, y: 1 } })).status, 400);
  assert.equal((await call('PUT', `/api/activities/${id}/position`, { token: customer, body: { x: 1, y: 1 } })).status, 403);
});

// ---------- reading practice: learners record their own voice ----------

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60)]);

test('reading practice: a learner saves, lists and hears only their own recording', async () => {
  const bookId = oid(), itemId = oid(), recId = oid();
  const spot = { _id: itemId, bookId, type: 'record', pageIndex: 3, maxSeconds: 60 };
  PageItem.findById = () => ({ select: async () => spot });
  let approved = false, upsert;
  Request.exists = async () => (approved ? { _id: oid() } : null);
  Recording.findOneAndUpdate = (filter, doc) => { upsert = { filter, doc }; return { select: async () => ({ _id: recId, itemId, size: doc.size, durationMs: doc.durationMs, createdAt: new Date(), mime: doc.mime }) }; };
  const put = (buf, q = '', who = customer) => call('PUT', `/api/recordings/${itemId}${q}`, { token: who, raw: buf, contentType: 'audio/webm' });

  assert.equal((await call('PUT', `/api/recordings/${itemId}`, { raw: WEBM, contentType: 'audio/webm' })).status, 401);
  assert.equal((await put(WEBM)).status, 403);                 // logged in but not approved for this book
  approved = true;
  const ok = await put(WEBM, '?durationMs=45000');
  assert.equal(ok.status, 201);
  assert.equal(ok.data.id, String(recId));
  assert.equal(upsert.doc.mime, 'audio/webm');
  assert.equal(upsert.doc.durationMs, 45000);
  assert.deepEqual(Object.keys(upsert.filter).sort(), ['itemId', 'userId']); // one per learner per spot: saving again replaces it
  assert.equal((await put(WEBM, '?durationMs=999999999')).status, 201);
  assert.equal(upsert.doc.durationMs, 65000);                   // never longer than the teacher's limit (+5 s)
  assert.equal((await put(Buffer.from('<html>not sound at all</html>'))).status, 400);
  assert.equal((await put(Buffer.concat([WEBM, Buffer.alloc(12.5 * 1024 * 1024)]))).status, 413);
  spot.type = 'audio';                                          // a spot that is not a recording spot
  assert.equal((await put(WEBM)).status, 404);
  spot.type = 'record';

  // listing: just the facts, never the sound
  Recording.find = () => ({ select() { return this; }, lean: async () => [{ _id: recId, itemId, size: 10, durationMs: 5000, createdAt: new Date(), mime: 'audio/webm', data: 'SECRET' }] });
  const list = await call('GET', `/api/recordings/book/${bookId}`, { token: customer });
  assert.equal(list.status, 200);
  assert.equal(list.data[0].itemId, String(itemId));
  assert.equal(JSON.stringify(list.data).includes('SECRET'), false);

  // hearing it: only the learner who made it (and teachers)
  const mine = { _id: recId, userId: customerId, mime: 'audio/webm', data: WEBM };
  Recording.findById = () => ({ select: async () => mine });
  const heard = await call('GET', `/api/recordings/${recId}/audio`, { token: customer });
  assert.equal(heard.status, 200);
  assert.equal(heard.headers.get('content-type'), 'audio/webm');
  mine.userId = oid();                                          // somebody else's recording
  assert.equal((await call('GET', `/api/recordings/${recId}/audio`, { token: customer })).status, 404);
  assert.equal((await call('GET', `/api/recordings/${recId}/audio`, { token: admin })).status, 200);

  let removed;
  Recording.deleteOne = async (f) => { removed = f; return {}; };
  assert.equal((await call('DELETE', `/api/recordings/${itemId}`, { token: customer })).status, 200);
  assert.equal(String(removed.userId), String(customerId));
});

test('the teacher decides where a Record spot goes and how long it can run', async () => {
  const bookId = oid();
  let created;
  Book.exists = async () => true;
  PageItem.create = async (doc) => { created = doc; return { _id: oid(), ...doc }; };
  const make = (body, token = admin) => call('POST', '/api/page-items', { token, body: { bookId, pageIndex: 0, type: 'record', x: 50, y: 40, ...body } });
  assert.equal((await make({ maxSeconds: 90, label: 'Read this page aloud' })).status, 201);
  assert.equal(created.maxSeconds, 90);
  assert.equal((await make({ maxSeconds: 5 })).status, 400);
  assert.equal((await make({ maxSeconds: 9000 })).status, 400);
  assert.equal((await make({}, customer)).status, 403);
});

test('the web app is served by the backend', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<title>Digital Reader<\/title>/);
  const css = await fetch(base + '/css/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('unknown routes and bad JSON return JSON errors', async () => {
  const nf = await call('GET', '/api/nope', { token: customer });
  assert.equal(nf.status, 404);
  assert.equal(nf.data.msg, 'Not found');

  const bad = await call('POST', '/api/auth/login', { raw: '{oops', token: undefined });
  assert.equal(bad.status, 400);
});
