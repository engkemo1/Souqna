// Cinematic post-processing: MSAA, soft bloom (sun glare), warm/teal grade, vignette, grain, filmic tone-map.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: .38 }, uTime: { value: 0 }, uSat: { value: 1.14 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uTime; uniform float uSat; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(.2126, .7152, .0722));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.07, 1.0, .9), smoothstep(.25, 1.4, l));     // warm highlights
      c.rgb = mix(c.rgb, c.rgb * vec3(.9, .97, 1.08), 1.0 - smoothstep(.0, .4, l)); // cool shadows
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec2 d = (vUv - .5) * vec2(1.0, 1.1);
      c.rgb *= mix(1.0 - uVig, 1.0, smoothstep(.9, .2, length(d)));
      float g = fract(sin(dot(vUv * vec2(1280., 720.) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - .5) * .014;
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera, { mobile = false } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(Math.max(size.x, 2), Math.max(size.y, 2), { type: THREE.HalfFloatType, samples: mobile ? 2 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * .5, size.y * .5), mobile ? .32 : .45, .85, .92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    render(t = 0) { grade.uniforms.uTime.value = t % 100; composer.render(); },
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w * .5, h * .5); },
    dispose() { composer.dispose?.(); target.dispose(); },
  };
}
