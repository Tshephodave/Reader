// Checks what an uploaded file REALLY is by looking at its first bytes,
// instead of trusting the file name or the browser's guess.
const MB = 1024 * 1024;

const LIMITS = { audio: 8 * MB, image: 3 * MB, video: 15 * MB };
const KINDS = Object.keys(LIMITS);

const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

// kind = what the teacher says it is ('audio' | 'image' | 'video'). Returns a mime type, or null.
function detectMime(buf, kind) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const b = buf;

  // pictures
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return kind === 'image' ? 'image/png' : null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return kind === 'image' ? 'image/jpeg' : null;
  if (ascii(b, 0, 4) === 'GIF8') return kind === 'image' ? 'image/gif' : null;
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return kind === 'image' ? 'image/webp' : null;

  // audio only
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return kind === 'audio' ? 'audio/wav' : null;
  if (ascii(b, 0, 3) === 'ID3') return kind === 'audio' ? 'audio/mpeg' : null;
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    // A frame header: the two "layer" bits are 00 for AAC (ADTS) and non-zero for MP3.
    if ((b[1] & 0x06) === 0) return kind === 'audio' ? 'audio/aac' : null;
    return kind === 'audio' ? 'audio/mpeg' : null;
  }

  // containers that can hold sound or film
  if (ascii(b, 4, 8) === 'ftyp') return kind === 'audio' ? 'audio/mp4' : kind === 'video' ? 'video/mp4' : null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return kind === 'audio' ? 'audio/webm' : kind === 'video' ? 'video/webm' : null;
  if (ascii(b, 0, 4) === 'OggS') return kind === 'audio' ? 'audio/ogg' : kind === 'video' ? 'video/ogg' : null;

  return null;
}

// Pulls the 11-character video id out of the usual YouTube link shapes. null if it isn't one.
function parseYouTubeId(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch (e) { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) id = m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

module.exports = { LIMITS, KINDS, detectMime, parseYouTubeId };
