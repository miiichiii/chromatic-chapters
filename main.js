(() => {
const { THREE, Lenis, gsap, ScrollTrigger } = window;

if (!THREE || !Lenis || !gsap || !ScrollTrigger) {
  document.documentElement.dataset.skyborne = "fallback";
  console.warn("Interactive sky dependencies did not load. Showing CSS sky fallback.");
  return;
}

const canvas = document.querySelector("#paint-canvas");
const scenes = [...document.querySelectorAll(".story-scene")];
const navLinks = [...document.querySelectorAll(".chapter-nav a")];
const scrollMeter = document.querySelector(".scroll-meter span");
const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
root.dataset.skyborne = "ready";

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const hexToRgb = (hex) => {
  const value = hex.replace("#", "");
  const bigint = Number.parseInt(value, 16);
  return [
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  ];
};

const colorFrom = (hex) => new THREE.Color(...hexToRgb(hex));

const setActiveNav = (sceneElement) => {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.hash === `#${sceneElement.id}`);
  });
};

const setScenePalette = (sceneElement) => {
  root.style.setProperty("--ink", sceneElement.dataset.ink);
  root.style.setProperty("--sky-top", sceneElement.dataset.top);
  root.style.setProperty("--sky-mid", sceneElement.dataset.mid);
  root.style.setProperty("--sky-low", sceneElement.dataset.low);
  root.style.setProperty("--accent", sceneElement.dataset.accent);
};

setScenePalette(scenes[0]);

gsap.registerPlugin(ScrollTrigger);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});

const getMaxPixelRatio = () => (window.innerWidth < 760 ? 1.2 : 1.5);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, getMaxPixelRatio()));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  uVelocity: { value: 0 },
  uScroll: { value: 0 },
  uInk: { value: colorFrom(scenes[0].dataset.ink) },
  uTop: { value: colorFrom(scenes[0].dataset.top) },
  uMid: { value: colorFrom(scenes[0].dataset.mid) },
  uLow: { value: colorFrom(scenes[0].dataset.low) },
  uAccent: { value: colorFrom(scenes[0].dataset.accent) },
  uStars: { value: Number(scenes[0].dataset.stars) },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;

    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform float uTime;
    uniform float uVelocity;
    uniform float uScroll;
    uniform vec3 uInk;
    uniform vec3 uTop;
    uniform vec3 uMid;
    uniform vec3 uLow;
    uniform vec3 uAccent;
    uniform float uStars;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.52;
      mat2 rotate = mat2(0.80, -0.60, 0.60, 0.80);

      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = rotate * p * 2.03 + 1.9;
        amplitude *= 0.48;
      }

      return value;
    }

    vec3 softLight(vec3 base, vec3 blend, float amount) {
      return mix(base, 1.0 - (1.0 - base) * (1.0 - blend), amount);
    }

    void main() {
      vec2 uv = vUv;
      vec2 ratio = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
      vec2 cursor = (uv - uMouse) * ratio;
      float cursorDistance = length(cursor);
      float cursorBloom = 1.0 - smoothstep(0.0, 0.68, cursorDistance);
      float wake = cursorBloom * (0.42 + min(uVelocity, 1.0) * 0.78);

      float horizon = smoothstep(0.08, 0.84, uv.y);
      vec3 lowerSky = mix(uLow, uMid, smoothstep(0.0, 0.58, uv.y));
      vec3 sky = mix(lowerSky, uTop, horizon);

      vec2 flow = uv * vec2(2.0, 1.22);
      flow.x += sin(uv.y * 8.0 + uTime * 0.08 + uScroll * 2.2) * 0.08;
      flow.y += cos(uv.x * 7.0 - uTime * 0.07) * 0.06;
      flow += normalize(cursor + 0.001) * wake * 0.34;

      float cloudBase = fbm(flow * 2.55 + vec2(uTime * 0.018, -uScroll * 0.42));
      float cloudDetail = fbm(flow * 9.5 - vec2(uTime * 0.025, uScroll * 0.2));
      float cloudBand = smoothstep(0.04, 0.42, uv.y) * (1.0 - smoothstep(0.45, 1.05, uv.y));
      float cloud = smoothstep(0.46, 0.86, cloudBase + cloudDetail * 0.22 + wake * 0.54) * cloudBand;

      float brush = smoothstep(0.42, 0.88, fbm(flow * 13.0 + wake * 1.8));
      float dryEdge = smoothstep(0.64, 0.96, cloudBase + brush * 0.28);
      vec3 cloudColor = mix(vec3(1.0, 0.97, 0.9), uAccent, 0.28 + cloudDetail * 0.24);
      sky = mix(sky, cloudColor, cloud * (0.56 + dryEdge * 0.18));

      vec2 glowPoint = vec2(0.22 + 0.56 * smoothstep(0.0, 1.0, uScroll), 0.32 + 0.18 * sin(uScroll * 3.14159));
      float glow = 1.0 - smoothstep(0.0, 0.82, distance((uv - glowPoint) * ratio, vec2(0.0)));
      sky = softLight(sky, uAccent, glow * 0.32);

      float paintWake = (1.0 - smoothstep(0.0, 0.72, cursorDistance)) * (0.24 + uVelocity * 0.42);
      vec3 paintTint = mix(uAccent, uInk, cloudBase * 0.34);
      sky = mix(sky, paintTint, paintWake * (0.46 + brush * 0.34));

      float cursorAura = 1.0 - smoothstep(0.0, 0.54, cursorDistance);
      float cursorCore = 1.0 - smoothstep(0.0, 0.20, cursorDistance);
      vec3 cursorLight = mix(uAccent, vec3(1.0), 0.38);
      sky = mix(sky, cursorLight, cursorAura * (0.16 + min(uVelocity, 1.0) * 0.24));
      sky += vec3(cursorCore * 0.08);

      vec2 starGrid = floor(uv * uResolution.xy * 0.42);
      float starSeed = hash(starGrid);
      float starShape = smoothstep(0.996, 1.0, starSeed);
      float starTwinkle = 0.58 + 0.42 * sin(uTime * 1.7 + starSeed * 14.0);
      float starMask = smoothstep(0.28, 0.92, uv.y) * uStars;
      sky += vec3(starShape * starTwinkle * starMask);

      float grain = noise(uv * uResolution.xy * 0.72 + uTime * 0.02);
      sky += (grain - 0.5) * 0.035;

      float vignette = 1.0 - smoothstep(0.18, 1.14, distance(uv, vec2(0.5)));
      sky = mix(sky * 0.84, sky, vignette);

      gl_FragColor = vec4(sky, 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const resize = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, getMaxPixelRatio()));
  renderer.setSize(width, height, false);
  uniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
};

window.addEventListener("resize", resize);
resize();

let targetMouseX = 0.5;
let targetMouseY = 0.5;
let lastMouseX = 0.5;
let lastMouseY = 0.5;
let pointerVelocity = 0;

const setPointerTarget = (clientX, clientY) => {
  targetMouseX = clientX / Math.max(window.innerWidth, 1);
  targetMouseY = 1 - clientY / Math.max(window.innerHeight, 1);
};

window.addEventListener("pointermove", (event) => setPointerTarget(event.clientX, event.clientY));

const lenis = new Lenis({
  duration: 0.48,
  easing: (t) => 1 - Math.pow(1 - t, 3),
  smoothWheel: !reducedMotion,
  syncTouch: false,
  touchMultiplier: 1,
});

const SCENE_SNAP_DURATION = 0.36;
const SCENE_SNAP_RELEASE_MS = SCENE_SNAP_DURATION * 1000 + 140;
const SCENE_INPUT_COOLDOWN_MS = 760;
const WHEEL_GESTURE_RELEASE_MS = 1120;
const SWIPE_TRIGGER_DISTANCE = 46;
const SWIPE_AXIS_RATIO = 1.15;

let snapTimer = 0;
let isSceneSnapping = false;
let wheelGestureLocked = false;
let wheelGestureTimer = 0;
let inputCooldownUntil = 0;
let touchGestureLocked = false;
let touchReleaseTimer = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchLastX = 0;
let touchLastY = 0;
let touchVerticalIntent = false;
let settledSceneIndex = Math.max(
  0,
  scenes.findIndex((sceneElement) => `#${sceneElement.id}` === window.location.hash),
);
let anchorTimer = 0;
let driftAnchorTimer = 0;
let viewportAnchorTimer = 0;

const clampSceneIndex = (index) => Math.max(0, Math.min(scenes.length - 1, index));
const getSceneTop = (index) => Math.round(scenes[clampSceneIndex(index)]?.offsetTop ?? 0);

const updateScrollVisuals = () => {
  const maxScroll = Math.max(root.scrollHeight - window.innerHeight, 1);
  const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
  uniforms.uScroll.value = progress;
  gsap.set(scrollMeter, { scaleX: progress });
};

const anchorToScene = (targetIndex = settledSceneIndex) => {
  const clampedIndex = clampSceneIndex(targetIndex);
  const targetScene = scenes[clampedIndex];
  const targetTop = getSceneTop(clampedIndex);

  if (!targetScene) return;

  activateScene(targetScene);

  if (Math.abs(window.scrollY - targetTop) > 1) {
    lenis.scrollTo(targetTop, {
      immediate: true,
      force: true,
      lock: true,
    });
    window.scrollTo({
      top: targetTop,
      left: 0,
      behavior: "auto",
    });
  }

  updateScrollVisuals();
  ScrollTrigger.update();
};

const scheduleAnchor = (targetIndex = settledSceneIndex, delay = SCENE_SNAP_RELEASE_MS) => {
  window.clearTimeout(anchorTimer);
  anchorTimer = window.setTimeout(() => anchorToScene(targetIndex), delay);
};

const scheduleDriftAnchor = (delay = 70) => {
  window.clearTimeout(driftAnchorTimer);
  driftAnchorTimer = window.setTimeout(() => {
    if (!isSceneSnapping && (wheelGestureLocked || touchGestureLocked || performance.now() < inputCooldownUntil)) {
      anchorToScene(settledSceneIndex);
    }
  }, delay);
};

const releaseSceneSnap = (targetIndex = settledSceneIndex, delay = SCENE_SNAP_RELEASE_MS) => {
  window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(() => {
    anchorToScene(targetIndex);
    isSceneSnapping = false;
  }, delay);
};

const lockInputAfterSnap = () => {
  inputCooldownUntil = performance.now() + SCENE_INPUT_COOLDOWN_MS;
};

const releaseTouchGesture = (delay = SCENE_INPUT_COOLDOWN_MS) => {
  window.clearTimeout(touchReleaseTimer);
  touchReleaseTimer = window.setTimeout(() => {
    touchGestureLocked = false;
  }, delay);
};

const snapToScene = (targetIndex, duration = SCENE_SNAP_DURATION) => {
  const clampedIndex = clampSceneIndex(targetIndex);
  const targetScene = scenes[clampedIndex];
  const targetTop = getSceneTop(clampedIndex);

  if (!targetScene) return false;

  settledSceneIndex = clampedIndex;
  isSceneSnapping = true;
  wheelGestureLocked = true;
  touchGestureLocked = true;
  lockInputAfterSnap();
  activateScene(targetScene);
  lenis.scrollTo(targetTop, {
    duration,
    force: true,
    lock: true,
    onComplete: () => anchorToScene(clampedIndex),
  });
  releaseSceneSnap(clampedIndex);
  releaseTouchGesture();
  scheduleAnchor(clampedIndex);
  return true;
};

const snapByDirection = (direction) => {
  if (reducedMotion || isSceneSnapping || direction === 0 || performance.now() < inputCooldownUntil) return false;

  const currentIndex = settledSceneIndex;
  const targetIndex = Math.max(0, Math.min(scenes.length - 1, currentIndex + direction));

  if (targetIndex === currentIndex) return false;
  return snapToScene(targetIndex);
};

lenis.on("scroll", ({ progress, velocity }) => {
  ScrollTrigger.update();
  uniforms.uScroll.value = progress;
  uniforms.uVelocity.value = Math.min(Math.abs(velocity) / 34, 1.8);
  gsap.to(scrollMeter, { scaleX: progress, duration: 0.18, overwrite: true });
});

window.addEventListener(
  "scroll",
  () => {
    if (isSceneSnapping) return;
    if (wheelGestureLocked || touchGestureLocked || performance.now() < inputCooldownUntil) {
      scheduleDriftAnchor();
    }
  },
  { passive: true },
);

window.addEventListener(
  "wheel",
  (event) => {
    if (reducedMotion || Math.abs(event.deltaY) < 3) return;

    event.preventDefault();
    window.clearTimeout(wheelGestureTimer);

    if (!wheelGestureLocked && performance.now() >= inputCooldownUntil) {
      wheelGestureLocked = true;
      if (!snapByDirection(Math.sign(event.deltaY))) {
        anchorToScene(settledSceneIndex);
      }
    }

    wheelGestureTimer = window.setTimeout(() => {
      wheelGestureLocked = false;
    }, WHEEL_GESTURE_RELEASE_MS);
  },
  { passive: false, capture: true },
);

window.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.touches[0];
    touchStartX = touch?.clientX ?? 0;
    touchStartY = touch?.clientY ?? 0;
    touchLastX = touchStartX;
    touchLastY = touchStartY;
    touchVerticalIntent = false;

    if (touch) setPointerTarget(touch.clientX, touch.clientY);

    if (!isSceneSnapping && performance.now() >= inputCooldownUntil) {
      touchGestureLocked = false;
    }
  },
  { passive: true, capture: true },
);

window.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    const currentX = touch?.clientX ?? touchLastX;
    const currentY = touch?.clientY ?? touchLastY;
    const deltaX = currentX - touchStartX;
    const deltaY = touchStartY - currentY;
    const absoluteX = Math.abs(deltaX);
    const absoluteY = Math.abs(deltaY);

    touchLastX = currentX;
    touchLastY = currentY;
    setPointerTarget(currentX, currentY);
    touchVerticalIntent =
      touchVerticalIntent || (absoluteY > 8 && absoluteY > absoluteX * SWIPE_AXIS_RATIO);

    if (touchGestureLocked || isSceneSnapping || performance.now() < inputCooldownUntil || touchVerticalIntent) {
      event.preventDefault();
    }
  },
  { passive: false, capture: true },
);

window.addEventListener(
  "touchend",
  (event) => {
    const touch = event.changedTouches[0];
    const endX = touch?.clientX ?? touchLastX;
    const endY = touch?.clientY ?? touchLastY;
    const deltaX = endX - touchStartX;
    const deltaY = touchStartY - endY;
    const absoluteX = Math.abs(deltaX);
    const absoluteY = Math.abs(deltaY);
    const isVerticalSwipe = absoluteY > SWIPE_TRIGGER_DISTANCE && absoluteY > absoluteX * SWIPE_AXIS_RATIO;

    if (isVerticalSwipe) {
      event.preventDefault();
      if (touchGestureLocked) {
        if (!isSceneSnapping) anchorToScene(settledSceneIndex);
        return;
      }
      touchGestureLocked = true;
      if (!snapByDirection(Math.sign(deltaY))) {
        anchorToScene(settledSceneIndex);
        releaseTouchGesture(90);
      }
    } else if (touchVerticalIntent || absoluteY > 3) {
      anchorToScene(settledSceneIndex);
      releaseTouchGesture(90);
    } else {
      releaseTouchGesture(90);
    }
  },
  { passive: false, capture: true },
);

window.addEventListener("touchcancel", () => releaseTouchGesture(90), { passive: true, capture: true });

const handleViewportAnchor = () => {
  window.clearTimeout(viewportAnchorTimer);
  viewportAnchorTimer = window.setTimeout(() => {
    lenis.resize?.();
    ScrollTrigger.refresh();
    if (isSceneSnapping) {
      scheduleAnchor(settledSceneIndex);
    } else {
      anchorToScene(settledSceneIndex);
    }
  }, 180);
};

window.addEventListener("orientationchange", handleViewportAnchor);
window.addEventListener("resize", handleViewportAnchor);
window.visualViewport?.addEventListener("resize", handleViewportAnchor);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

const animateUniformColor = (uniformColor, hex, duration) => {
  const [r, g, b] = hexToRgb(hex);
  gsap.to(uniformColor, {
    r,
    g,
    b,
    duration,
    ease: "power2.out",
  });
};

const paintTo = (sceneElement, duration = 1.1) => {
  animateUniformColor(uniforms.uInk.value, sceneElement.dataset.ink, duration);
  animateUniformColor(uniforms.uTop.value, sceneElement.dataset.top, duration);
  animateUniformColor(uniforms.uMid.value, sceneElement.dataset.mid, duration);
  animateUniformColor(uniforms.uLow.value, sceneElement.dataset.low, duration);
  animateUniformColor(uniforms.uAccent.value, sceneElement.dataset.accent, duration);
  gsap.to(uniforms.uStars, {
    value: Number(sceneElement.dataset.stars),
    duration,
    ease: "power2.out",
  });
  gsap.to(root, {
    "--ink": sceneElement.dataset.ink,
    "--sky-top": sceneElement.dataset.top,
    "--sky-mid": sceneElement.dataset.mid,
    "--sky-low": sceneElement.dataset.low,
    "--accent": sceneElement.dataset.accent,
    duration: duration * 0.72,
    ease: "power2.out",
  });
};

const activateScene = (sceneElement) => {
  setScenePalette(sceneElement);
  paintTo(sceneElement);
  setActiveNav(sceneElement);
};

scenes.forEach((sceneElement, index) => {
  const copy = sceneElement.querySelector(".scene-copy");
  const heading = copy.querySelector("h1, h2");
  const paragraph = copy.querySelector("p");
  const eyebrow = sceneElement.querySelector(".eyebrow");
  const indexNumber = sceneElement.querySelector(".scene-index");
  const direction = sceneElement.classList.contains("align-right") ? -1 : 1;

  gsap.set([heading, paragraph, eyebrow], {
    y: 86,
    opacity: 0,
    force3D: true,
  });
  gsap.set(indexNumber, {
    y: 110,
    x: direction * 40,
    opacity: 0,
    rotate: direction * -4,
    force3D: true,
  });
  gsap.set(copy, { scale: 0.985, force3D: true });

  if (index === 0) {
    gsap.set([heading, paragraph, eyebrow], {
      y: 0,
      opacity: 1,
    });
    gsap.set(indexNumber, {
      y: 0,
      x: 0,
      opacity: 1,
      rotate: 0,
    });
    gsap.set(copy, { scale: 1 });
  }

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: sceneElement,
      start: "top 86%",
      end: "bottom 14%",
      scrub: reducedMotion ? false : true,
      invalidateOnRefresh: true,
      onEnter: () => {
        activateScene(sceneElement);
      },
      onEnterBack: () => {
        activateScene(sceneElement);
      },
    },
  });

  timeline
    .to(eyebrow, { y: 0, opacity: 1, duration: 0.16, ease: "power3.out" }, 0.04)
    .to(heading, { y: 0, opacity: 1, duration: 0.26, ease: "power3.out" }, 0.1)
    .to(paragraph, { y: 0, opacity: 1, duration: 0.22, ease: "power2.out" }, 0.2)
    .to(indexNumber, { y: 0, x: 0, opacity: 1, rotate: 0, duration: 0.36, ease: "power2.out" }, 0.08)
    .to(copy, { y: -42, scale: 1.018, duration: 0.46, ease: "none" }, 0.48)
    .to(indexNumber, { y: -90, opacity: 0.22, duration: 0.42, ease: "none" }, 0.54)
    .to([heading, paragraph, eyebrow], { y: -62, opacity: 0, duration: 0.22, ease: "power2.in" }, 0.76);

  gsap.to(sceneElement, {
    scrollTrigger: {
      trigger: sceneElement,
      start: "top bottom",
      end: "bottom top",
      scrub: true,
    },
    "--parallax": `${direction * 90}px`,
    ease: "none",
  });
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    snapToScene(navLinks.indexOf(link));
  });
});

const render = (time) => {
  uniforms.uTime.value = time * 0.001;
  uniforms.uMouse.value.x += (targetMouseX - uniforms.uMouse.value.x) * 0.12;
  uniforms.uMouse.value.y += (targetMouseY - uniforms.uMouse.value.y) * 0.12;

  const dx = targetMouseX - lastMouseX;
  const dy = targetMouseY - lastMouseY;
  pointerVelocity += (Math.hypot(dx, dy) * 28 - pointerVelocity) * 0.18;
  uniforms.uVelocity.value = Math.max(uniforms.uVelocity.value * 0.94, pointerVelocity);
  lastMouseX = targetMouseX;
  lastMouseY = targetMouseY;

  renderer.render(scene, camera);
  requestAnimationFrame(render);
};

requestAnimationFrame(render);
ScrollTrigger.refresh();
anchorToScene(settledSceneIndex);
})();
