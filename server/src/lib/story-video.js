// فيديو الستوري: ملف MP4/WebM قصير بيتخزن (على R2 لو متفعل، وإلا على الديسك) ويتمسح مع الستوري.
// لو ffmpeg موجود على السيرفر بنحوّل أي فيديو (آيفون MOV/HEVC وغيره) لـ H.264 720p ونقص عند 30 ثانية ونطلع صورة غلاف.
// لو مش موجود بنقبل MP4 (H.264) بس، بحد أقصى للحجم والمدة، من غير ما نلمسه.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import sharp from 'sharp';
import { config } from '../config.js';
import { r2Enabled, r2Put, r2Delete } from './r2.js';

export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024;
// ستوري تويست الرسمي: جودة أعلى (1080p) ومدة وحجم أكبر
export const HQ_VIDEO_MAX_SECONDS = 60;
export const HQ_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

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
export async function saveStoryVideo(buf, storeId, { hq = false } = {}) {
  const maxSec = hq ? HQ_VIDEO_MAX_SECONDS : VIDEO_MAX_SECONDS;
  const maxBytes = hq ? HQ_VIDEO_MAX_BYTES : VIDEO_MAX_BYTES;
  const width = hq ? 1080 : 720;
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
        // fast path: a short H.264/AAC MP4 that is already small enough is only re-wrapped (about a second) instead of re-encoded (can take a minute)
        let done = false;
        const pr = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width:format=duration', '-of', 'json', inp], 10000).then((o) => JSON.parse(o), () => null);
        const vs = pr?.streams?.find((x) => x.codec_type === 'video'); const as = pr?.streams?.find((x) => x.codec_type === 'audio');
        if (isMp4(buf) && vs?.codec_name === 'h264' && (!as || as.codec_name === 'aac') && vs.width && vs.width <= width && Number(pr.format?.duration) <= maxSec + 0.5 && buf.length <= maxBytes) {
          try { await run('ffmpeg', ['-y', '-protocol_whitelist', 'file', '-i', inp, '-c', 'copy', '-movflags', '+faststart', mp4], 60000); done = true; } catch { done = false; }
        }
        if (!done) await exclusive(() => run('ffmpeg', ['-y', '-protocol_whitelist', 'file', '-threads', '2', '-i', inp, '-t', String(maxSec), '-vf', `scale='min(${width},iw)':-2,format=yuv420p`, '-c:v', 'libx264', '-preset', hq ? 'veryfast' : 'superfast', '-crf', hq ? '22' : '28', '-c:a', 'aac', '-b:a', hq ? '128k' : '96k', '-movflags', '+faststart', '-max_muxing_queue_size', '1024', mp4], hq ? 300000 : 120000));
        await run('ffmpeg', ['-y', '-protocol_whitelist', 'file', '-i', mp4, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', hq ? '2' : '4', jpg], 30000).catch(() => {});
      } catch (e) { throw fail('video_failed', 'Could not process this video.'); }
      out = await fs.readFile(mp4);
      poster = await fs.readFile(jpg).catch(() => null);
      const info = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mp4], 10000).catch(() => '');
      seconds = Number(String(info).trim()) || seconds;
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  } else {
    if (!isMp4(buf)) throw fail('video_unsupported', 'Use an MP4 video.');
    if (buf.length > maxBytes) throw fail('video_too_big', 'Video is too large.');
    if (mp4Codec(buf) !== 'h264') throw fail('video_codec', 'This video format is not supported. Record it as H.264 (most compatible) or use a different video.');
    if (seconds != null && seconds > maxSec + 1) throw fail('video_too_long', `Video must be ${maxSec} seconds or less.`);
  }
  if (out.length > maxBytes) throw fail('video_too_big', 'Video is too large.');

  const remote = await put(key, out);
  if (poster) await put(posterKey, poster).catch(() => { poster = null; });
  return { key, posterKey: poster ? posterKey : null, remote, seconds: seconds ? Math.round(seconds * 10) / 10 : null };
}

/**
 * صورة ستوري تويست: من غير قص ولا تحويل لعرض صغير — لحد 1440×2560 بجودة WebP 90. بتتخزن زي الفيديو (R2 أو الديسك).
 * بيرجع { key, remote } أو يرمي Error بـ code: invalid_image | image_too_small
 */
export async function saveStoryImage(buf, storeId) {
  const fail = (code, message) => Object.assign(new Error(message), { code });
  let meta;
  try { meta = await sharp(buf, { failOn: 'error', limitInputPixels: 80e6 }).metadata(); } catch { throw fail('invalid_image', 'This file is not a supported image.'); }
  if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(meta.format)) throw fail('invalid_image', 'This file is not a supported image.');
  if (Math.min(meta.width || 0, meta.height || 0) < 480) throw fail('image_too_small', 'This image is too small (at least 480 px).');
  const out = await sharp(buf, { limitInputPixels: 80e6 }).rotate().resize({ width: 1440, height: 2560, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });
  const key = `stories/${storeId}/${crypto.randomBytes(8).toString('hex')}.webp`;
  const remote = await put(key, out.data);
  return { key, remote, w: out.info.width, h: out.info.height };
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
