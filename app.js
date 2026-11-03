const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
app.disable('x-powered-by');

// CLIENT_ORIGIN can be a comma-separated list. If it's unset, any origin is allowed.
const origins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));

// Books are uploaded as base64 inside JSON (PDF limit is 10 MB, ~13.4 MB encoded).
app.use(express.json({ limit: '20mb' }));
// Express 5 leaves req.body undefined when a request has no body.
app.use((req, res, next) => {
  if (!req.body) req.body = {};
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/bookmarks', require('./routes/bookmarkRoutes'));
app.use('/api/stickynotes', require('./routes/stickyNoteRoutes'));
app.use('/api/highlights', require('./routes/highlightRoutes'));
app.use('/api/activities', require('./routes/activityRoutes'));
app.use('/api/page-items', require('./routes/pageItemRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/recordings', require('./routes/recordingRoutes'));

// The web app (plain HTML/CSS/JS) is served from the sibling folder, so one
// server runs everything. Set WEB_DIR to serve it from somewhere else.
const webDir = process.env.WEB_DIR || path.join(__dirname, '..', 'digital-reader-web');
if (fs.existsSync(webDir)) app.use(express.static(webDir));

app.use((req, res) => res.status(404).json({ msg: 'Not found' }));
app.use(errorHandler);

module.exports = app;
