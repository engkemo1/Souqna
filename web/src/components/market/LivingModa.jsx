import { useEffect, useRef } from 'react';

/**
 * Moda's portrait, brought to life in a WebGL shader (no 3D model needed):
 * real blinking eyelids, eyes that follow your finger/mouse, lips that open while she talks, brows that lift when she thinks,
 * hair that sways, earrings that swing, a gentle breathing motion and a head that turns toward you.
 * All feature positions are in the 1254px design space of /moda/moda.webp.
 */
import { MODA_IMG } from './modaImg.js';

const VERT = `attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x*.5+.5, .5-a.y*.5); gl_Position = vec4(a,0.,1.); }`;
const FRAG = `
precision highp float;
varying vec2 v; uniform sampler2D tex;
uniform vec2 look, gaze; uniform float t, blink, open, think, swing, talk;
const float S = 1254.0;
vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
vec4 T(vec2 p){ return texture2D(tex, p / S); }
float ell(vec2 p, vec2 c, vec2 ab, float th){ return length(rot(p - c, -th) / ab); }

void main(){
  vec2 P = v * S; vec2 q = P;
  vec4 c0 = T(P);
  float faceR = ell(P, vec2(650.,500.), vec2(215.,270.), 0.);
  float notFace = smoothstep(1.0, 1.3, faceR);
  float lum = dot(c0.rgb / max(c0.a, .001), vec3(.3,.59,.11));
  float hair = (1.0 - smoothstep(.2, .4, lum)) * c0.a * notFace * smoothstep(230., 430., P.y);
  // hair sway
  q.x += sin(t*1.25 + P.y*.008 + P.x*.004) * 8.0 * hair * (.35 + (P.y-300.)/900.);
  q.y += cos(t*1.0 + P.x*.01) * 3.0 * hair;
  // head turns toward the pointer: the face moves more than the hair, the body stays
  float depth = max(1.0 - smoothstep(.85, 1.35, faceR), .35 * smoothstep(900., 500., P.y));
  q -= look * vec2(18., 10.) * depth;
  // nod / tilt around the neck
  vec2 pivot = vec2(640., 830.); float w = smoothstep(940., 650., P.y);
  q = pivot + rot(q - pivot, -(look.x * .03 + sin(t*.7) * .012 + talk * sin(t*6.3) * .006) * w);
  // breathing
  q.y += sin(t*1.6) * 3.0 * smoothstep(650., 1050., P.y);
  // earrings swing (hook points)
  vec2 hkL = vec2(472., 575.), hkR = vec2(836., 485.);
  float wl = 1.0 - smoothstep(75., 125., length(q - hkL)); float wr = 1.0 - smoothstep(75., 125., length(q - hkR));
  q = hkL + rot(q - hkL, -swing * wl * step(-8., q.y - hkL.y));
  q = hkR + rot(q - hkR, swing * .8 * wr * step(-8., q.y - hkR.y));

  // eyebrows lift (thinking) / small emphasis (talking)
  float browL = 1.0 - smoothstep(.8, 1.1, ell(q, vec2(505.,368.), vec2(85.,32.), -.1));
  float browR = 1.0 - smoothstep(.8, 1.1, ell(q, vec2(702.,325.), vec2(88.,34.), -.3));
  q.y += (browL + browR) * (think * 7.0 + talk * 2.0 * (.5 + .5*sin(t*5.0)));
  // eyes: look around
  vec2 eL = vec2(532., 449.), eR = vec2(718., 408.);
  float inL = 1.0 - smoothstep(.55, .95, ell(q, eL, vec2(54.,27.), .2));
  float inR = 1.0 - smoothstep(.55, .95, ell(q, eR, vec2(50.,32.), -.35));
  q -= gaze * vec2(8., 5.) * (inL + inR);

  vec4 col = T(q);
  vec3 rgb = col.a > .001 ? col.rgb / col.a : col.rgb;

  // mouth: the lower lip drops along the real lip line, showing teeth and the dark inside
  float mx = q.x;
  float lineY = mx < 610. ? mix(577., 585., clamp((mx-572.)/38., 0., 1.))
              : mx < 650. ? mix(585., 582., (mx-610.)/40.)
              : mx < 700. ? mix(582., 570., (mx-650.)/50.)
              : mix(570., 532., clamp((mx-700.)/35., 0., 1.));
  float wx = smoothstep(576., 612., mx) * (1.0 - smoothstep(692., 728., mx));
  float dd = q.y - lineY;
  float gapMax = open * 30.0 * wx;
  if (gapMax > 5.0 && dd > 0.0) {
    float fy = 1.0 - smoothstep(34., 80., dd);
    float gap = gapMax * fy;
    float fade = smoothstep(5.0, 10.0, gapMax);
    if (dd < gap) {
      float k = dd / gap;
      vec3 inside = mix(vec3(.66,.22,.24), vec3(.34,.06,.09), smoothstep(.15,1.,k));
      float teeth = (1.0 - smoothstep(.12, .36, k)) * smoothstep(.2, .6, wx);
      vec3 mouthCol = mix(inside, vec3(.98,.95,.91), teeth * .95);
      float edge = smoothstep(0., 2.0, dd);
      rgb = mix(rgb, mouthCol, edge * fade); col.a = mix(col.a, 1.0, edge * fade);
    } else {
      vec4 s2 = T(vec2(q.x, q.y - gap));
      rgb = mix(rgb, s2.a > .001 ? s2.rgb / s2.a : s2.rgb, fade); col.a = mix(col.a, s2.a, fade);
    }
  }

  // blink (both eyes together)
  float kk = smoothstep(.0, .06, blink);
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? vec2(524., 449.) : vec2(722., 404.);
    float th = i == 0 ? .2 : -.35; vec2 ab = i == 0 ? vec2(90., 50.) : vec2(76., 48.);
    vec2 l = rot(q - c, -th); float r = length(l / ab);
    float m = 1.0 - smoothstep(.8, 1.0, r);
    float lid = -ab.y * .9 + ab.y * 1.2 * blink + .38 * ab.y * blink * (1.0 - clamp(pow(l.x / ab.x, 2.), 0., 1.));
    float covered = smoothstep(lid + 2., lid - 2., l.y) * m * kk;
    vec4 sk = T(c + rot(vec2(l.x, ab.y * 1.5), th)); vec4 fk = T(vec2(612., 312.));
    vec3 skin = mix(fk.rgb / max(fk.a, .001), sk.rgb / max(sk.a, .001), .3) * vec3(.99, .965, .95);
    rgb = mix(rgb, skin, covered);
    float line = exp(-pow((l.y - lid) / 2.4, 2.)) * m * kk;
    rgb = mix(rgb, vec3(.14,.07,.05), clamp(line * .95, 0., 1.));
  }
  gl_FragColor = vec4(rgb * col.a, col.a);
}`;

export default function LivingModa({ size = 220, talking = false, thinking = false, src = MODA_IMG, onFail }) {
  const host = useRef(null); const st = useRef({ talking, thinking });
  st.current.talking = talking; st.current.thinking = thinking;

  useEffect(() => {
    const el = host.current; if (!el) return undefined;
    const cv = document.createElement('canvas'); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr); cv.style.cssText = 'width:100%;height:100%;display:block';
    const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) { onFail?.(); return undefined; }
    const sh = (type, srcCode) => { const s = gl.createShader(type); gl.shaderSource(s, srcCode); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    let prog;
    try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link'); }
    catch (e) { console.error('[moda]', e.message); onFail?.(); return undefined; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    const u = { look: U('look'), gaze: U('gaze'), t: U('t'), blink: U('blink'), open: U('open'), think: U('think'), swing: U('swing'), talk: U('talk') };
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alive = true; let raf = 0; let ready = false; let last = performance.now();
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!alive) return;
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true; el.appendChild(cv); raf = requestAnimationFrame(tick);
    };
    img.onerror = () => onFail?.();
    img.src = src;

    const look = { x: 0, y: 0 }; const tgt = { x: 0, y: 0 };
    const move = (e) => { const r = el.getBoundingClientRect(); tgt.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 260)); tgt.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 260)); };
    const leave = () => { tgt.x = 0; tgt.y = 0; };
    window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerup', leave);

    let blinkAt = 1.2; let blinkT = -1; let open = 0; let wander = { x: 0, y: 0 }; let wanderAt = 2; let think = 0; const gz = { x: 0, y: 0 };
    const t0 = performance.now();
    function tick(now) {
      if (!alive) return; raf = requestAnimationFrame(tick);
      if (document.hidden || !ready) return;
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const t = reduced ? 0 : (now - t0) / 1000; const { talking: tk, thinking: th } = st.current;
      look.x += (tgt.x - look.x) * .07; look.y += (tgt.y - look.y) * .07;
      if (t > wanderAt) { wander = { x: (Math.random() - .5) * 1.2, y: (Math.random() - .5) * .6 }; wanderAt = t + 1.5 + Math.random() * 3; }
      think += ((th ? 1 : 0) - think) * .1;
      const gx = th ? -.8 : look.x * .9 + wander.x * (tgt.x === 0 ? 1 : 0); const gy = th ? -.7 : look.y * .9 + wander.y * (tgt.y === 0 ? 1 : 0);
      gz.x += (gx - gz.x) * .15; gz.y += (gy - gz.y) * .15;
      let b = 0;
      if (!reduced && blinkT < 0 && t > blinkAt) blinkT = 0;
      if (blinkT >= 0) { blinkT += dt * 15; b = Math.sin(Math.min(blinkT, Math.PI)); if (blinkT >= Math.PI) { blinkT = -1; blinkAt = t + 1.6 + Math.random() * 3.6; if (Math.random() < .2) blinkAt = t + .25; } }
      const target = tk ? Math.min(1, (.2 + .8 * Math.abs(Math.sin(t * 6.2))) * (.6 + .4 * Math.abs(Math.sin(t * 2.7)))) : 0;
      open += (target - open) * Math.min(1, dt * 22);
      gl.uniform2f(u.look, look.x, look.y); gl.uniform2f(u.gaze, gz.x, gz.y);
      gl.uniform1f(u.t, t); gl.uniform1f(u.blink, b); gl.uniform1f(u.open, Math.min(1, open)); gl.uniform1f(u.think, think);
      gl.uniform1f(u.swing, Math.sin(t * 1.7) * .07 + Math.sin(t * 3.1) * .02); gl.uniform1f(u.talk, tk ? 1 : 0);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return () => {
      alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', leave);
      cv.remove(); gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [size, src, onFail]);

  return <div ref={host} style={{ width: size, height: size }} aria-hidden="true" />;
}
