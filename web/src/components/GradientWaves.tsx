import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import "./GradientWaves.css";

export type GradientWavesDetail = "low" | "medium" | "high";

export interface GradientWavesProps {
  horizonColor?: string;
  waveColor?: string;
  crestColor?: string;
  speed?: number;
  amplitude?: number;
  waveScale?: number;
  waveRatio?: number;
  swell?: number;
  turbulence?: number;
  tilt?: number;
  zoom?: number;
  height?: number;
  fogDepth?: number;
  detail?: GradientWavesDetail;
  brightness?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  parallaxStrength?: number;
  grain?: boolean;
  grainIntensity?: number;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
};

const detailToSteps = (detail: GradientWavesDetail) => ({ low: 40, medium: 70, high: 110 })[detail];

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;
const float MAX_DIST = 20000.0;
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}
float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}
void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;
  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }
  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;
  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = clamp(mix(uHorizonColor, body, t) * uBrightness, 0.0, 1.0);
  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`;

type Uniform = { value: number | boolean | Float32Array };
type WavesContext = { program: InstanceType<typeof Program> };
const contexts = new WeakMap<HTMLDivElement, WavesContext>();

export default function GradientWaves({
  horizonColor = "#5227FF", waveColor = "#FF9FFC", crestColor = "#FFFFFF",
  speed = 0.4, amplitude = 2.5, waveScale = 0.6, waveRatio = 0.9,
  swell = 35, turbulence = 20, tilt = 1.11, zoom = 1, height = 5.5,
  fogDepth = 15, detail = "medium", brightness = 1, opacity = 1,
  mouseInteraction = true, parallaxStrength = 0.5, grain = true,
  grainIntensity = 0.05, className = "",
}: GradientWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const enableMouseRef = useRef(mouseInteraction);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderer = new Renderer({ webgl: 2, alpha: true, premultipliedAlpha: true, antialias: false, dpr: Math.min(devicePixelRatio || 1, 2) });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    Object.assign(canvas.style, { width: "100%", height: "100%", display: "block" });
    container.appendChild(canvas);
    const program = new Program(gl, { vertex, fragment, uniforms: {
      iTime: { value: 0 }, iResolution: { value: new Float32Array([1, 1]) },
      uSpeed: { value: 0.4 }, uAmplitude: { value: 2.5 }, uWaveScale: { value: 0.6 }, uWaveRatio: { value: 0.9 },
      uSwell: { value: 35 }, uTurbulence: { value: 20 }, uTilt: { value: 1.11 }, uZoom: { value: 1 },
      uHeight: { value: 5.5 }, uFogDepth: { value: 15 }, uSteps: { value: 70 }, uBrightness: { value: 1 },
      uOpacity: { value: 1 }, uGrain: { value: 1 }, uGrainIntensity: { value: 0.05 },
      uMouse: { value: new Float32Array([0.5, 0.5]) }, uParallax: { value: 0.5 }, uEnableMouse: { value: true },
      uHorizonColor: { value: new Float32Array(3) }, uWaveColor: { value: new Float32Array(3) }, uCrestColor: { value: new Float32Array(3) },
    }});
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    contexts.set(container, { program });
    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      const resolution = (program.uniforms.iResolution as Uniform).value as Float32Array;
      resolution.set([gl.drawingBufferWidth, gl.drawingBufferHeight]);
      renderer.render({ scene: mesh });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    const current: [number, number] = [0.5, 0.5];
    const target: [number, number] = [0.5, 0.5];
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      target[0] = (event.clientX - rect.left) / rect.width;
      target[1] = 1 - (event.clientY - rect.top) / rect.height;
    };
    const onLeave = () => target.splice(0, 2, 0.5, 0.5);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    let frame = 0;
    let inView = true;
    let pageVisible = !document.hidden;
    const startTime = performance.now();
    const loop = (time: number) => {
      (program.uniforms.iTime as Uniform).value = (time - startTime) * 0.001;
      const targetX = enableMouseRef.current ? target[0] : 0.5;
      const targetY = enableMouseRef.current ? target[1] : 0.5;
      current[0] += 0.05 * (targetX - current[0]); current[1] += 0.05 * (targetY - current[1]);
      ((program.uniforms.uMouse as Uniform).value as Float32Array).set(current);
      renderer.render({ scene: mesh });
      frame = requestAnimationFrame(loop);
    };
    const start = () => { if (inView && pageVisible && !frame) frame = requestAnimationFrame(loop); };
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) start();
      else stop();
    });
    intersectionObserver.observe(container);
    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop(); resizeObserver.disconnect(); intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave);
      contexts.delete(container); canvas.remove(); gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const context = container ? contexts.get(container) : undefined;
    if (!context) return;
    enableMouseRef.current = mouseInteraction;
    const uniforms = context.program.uniforms as Record<string, Uniform>;
    const values: Record<string, number | boolean> = {
      uSpeed: speed, uAmplitude: amplitude, uWaveScale: waveScale, uWaveRatio: waveRatio,
      uSwell: swell, uTurbulence: turbulence, uTilt: tilt, uZoom: zoom, uHeight: height,
      uFogDepth: fogDepth, uSteps: detailToSteps(detail), uBrightness: brightness, uOpacity: opacity,
      uGrain: grain ? 1 : 0, uGrainIntensity: grainIntensity, uParallax: parallaxStrength, uEnableMouse: mouseInteraction,
    };
    Object.entries(values).forEach(([name, value]) => { uniforms[name].value = value; });
    ([["uHorizonColor", horizonColor], ["uWaveColor", waveColor], ["uCrestColor", crestColor]] as const)
      .forEach(([name, color]) => ((uniforms[name].value as Float32Array).set(hexToRgb(color))));
  }, [horizonColor, waveColor, crestColor, speed, amplitude, waveScale, waveRatio, swell, turbulence, tilt, zoom, height, fogDepth, detail, brightness, opacity, mouseInteraction, parallaxStrength, grain, grainIntensity]);

  return <div ref={containerRef} className={`gradient-waves-container ${className}`.trim()} aria-hidden="true" />;
}