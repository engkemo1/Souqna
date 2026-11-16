// فيديو الستوري: ملف MP4/WebM قصير بيتخزن (على R2 لو متفعل، وإلا على الديسك) ويتمسح مع الستوري.
// لو ffmpeg موجود على السيرفر بنحوّل أي فيديو (آيفون MOV/HEVC وغيره) لـ H.264 720p ونقص عند 30 ثانية ونطلع صورة غلاف.
// لو مش موجود بنقبل MP4 (H.264) بس، بحد أقصى للحجم والمدة، من غير ما نلمسه.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { r2Enabled, r2Put, r2Delete } from './r2.js';

export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024;

// تحويل الفيديو تقيل على المعالج: واحد بس في نفس الوقت، والباقي يستنى دوره
let chain = Promise.resolve();
const exclusive = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

const run = (cmd, args, timeout) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout)));
});

let ffmpegOk;
export async function hasFfmpeg() {
  if (ffmpegOk === undefined) ffmpegOk = await run('ffmpeg', ['-version'], 5000).then(() => true, () => false);
  return ffmpegOk;
}

// نفس صندوق ftyp بتستخدمه صور HEIC/AVIF: لازم نفرّق عشان الصورة ماتتعاملش كفيديو
/** كودك الفيديو جوه MP4 (من غير ffmpeg): 'h264' | 'other' (HEVC/AV1/VP9) | null لو مش معروف. */
export function mp4Codec(b) {
  if (b.indexOf('avc1', 0, 'latin1') >= 0 || b.indexOf('avc3', 0, 'latin1') >= 0) return 'h264';
  for (const t of ['hvc1', 'hev1', 'av01', 'vp09', 'dvh1']) if (b.indexOf(t, 0, 'latin1') >= 0) return 'other';
  return null;
}

const IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis']);
export const isMp4 = (b) => b.length > 12 && b.toString('latin1', 4, 8) === 'ftyp' && !IMAGE_BRANDS.has(b.toString('latin1', 8, 12));
export const isWebm = (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
export const looksLikeVideo = (b) => isMp4(b) || isWebm(b);

/** مدة MP4 بالثواني من صندوق mvhd (من غير ffmpeg). null لو مش قادرين نقراها. */
export function mp4Seconds(b) {
  const i = b.indexOf('mvhd', 0, 'latin1');
  if (i < 0 || i + 36 > b.length) return null;
  const ver = b[i + 4];
  const scale = b.readUInt32BE(i + (ver === 1 ? 24 : 16));
  const dur = ver === 1 ? Number(b.readBigUInt64BE(i + 28)) : b.readUInt32BE(i + 20);
  return scale ? dur / scale : null;
}

const localPath = (key) => path.join(config.mediaDir, ...key.split('/'));

async function put(key, buf) {
  if (r2Enabled) { await r2Put(key, buf); return true; }
  await fs.mkdir(path.dirname(localPath(key)), { recursive: true });
  await fs.writeFile(localPath(key), buf);
  return false;
}

/**
 * بيجهّز الفيديو ويخزنه. بيرجع { key, posterKey, remote, seconds } أو يرمي Error بـ code:
 * video_unsupported | video_codec | video_too_long | video_too_big | video_failed
 */
export async function saveStoryVideo(buf, storeId) {
  const fail = (code, message) => Object.assign(new Error(message), { code });
  if (!looksLikeVideo(buf)) throw fail('video_unsupported', 'Use an MP4 or WebM video.');
  const id = crypto.randomBytes(8).toString('hex');
  const key = `stories/${storeId}/${id}.mp4`;
  const posterKey = `stories/${storeId}/${id}.jpg`;
  let out = buf; let poster = null; let seconds = isMp4(buf) ? mp4Seconds(buf) : null;

  if (await hasFfmpeg()) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'story-'));
    try {
      const inp = path.join(dir, 'in.bin'); const mp4 = path.join(dir, 'out.mp4'); const jpg = path.join(dir, 'poster.jpg');
      await fs.writeFile(inp, buf);
      try {
        await exclusive(() => run('ffmpeg', ['-y', '-protocol_whitelist', 'file', '-threads', '2', '-i', inp, '-t', String(VIDEO_MAX_SECONDS), '-vf', "scale='min(720,iw)':-2,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-max_muxing_queue_size', '1024', mp4], 120000));
        await run('ffmpeg', ['-y', '-protocol_whitelist', 'file', '-i', mp4, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '4', jpg], 30000).catch(() => {});
      } catch (e) { throw fail('video_failed', 'Could not process this video.'); }
      out = await fs.readFile(mp4);
      poster = await fs.readFile(jpg).catch(() => null);
      const info = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mp4], 10000).catch(() => '');
      seconds = Number(String(info).trim()) || seconds;
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  } else {
    if (!isMp4(buf)) throw fail('video_unsupported', 'Use an MP4 video.');
    if (buf.length > VIDEO_MAX_BYTES) throw fail('video_too_big', 'Video is too large.');
    if (mp4Codec(buf) !== 'h264') throw fail('video_codec', 'This video format is not supported. Record it as H.264 (most compatible) or use a different video.');
    if (seconds != null && seconds > VIDEO_MAX_SECONDS + 1) throw fail('video_too_long', `Video must be ${VIDEO_MAX_SECONDS} seconds or less.`);
  }
  if (out.length > VIDEO_MAX_BYTES) throw fail('video_too_big', 'Video is too large.');

  const remote = await put(key, out);
  if (poster) await put(posterKey, poster).catch(() => { poster = null; });
  return { key, posterKey: poster ? posterKey : null, remote, seconds: seconds ? Math.round(seconds * 10) / 10 : null };
}

export const videoUrls = (row) => ({
  src: `${row.video_remote ? config.r2.publicUrl : config.mediaBaseUrl}/${row.video_key}`,
  poster: row.poster_key ? `${row.video_remote ? config.r2.publicUrl : config.mediaBaseUrl}/${row.poster_key}` : null,
  seconds: row.video_seconds ?? null,
});

export async function deleteStoryVideo(row) {
  for (const k of [row.video_key, row.poster_key].filter(Boolean)) {
    try { if (row.video_remote) await r2Delete(k); else await fs.rm(localPath(k), { force: true }); } catch { /* ملف اتمسح قبل كده */ }
  }
}
