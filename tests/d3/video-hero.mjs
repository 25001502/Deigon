import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { bundle, find, root } from "../admin-a/support/bundle.mjs";

test("the real clock schedules exactly seven seconds and cleanup cancels that timeout", async () => {
  const rotation = await bundle("export * from './lib/storefront/hero-slideshow';");
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let scheduled, cleared;
  try {
    globalThis.setTimeout = (callback, delay) => { scheduled = { callback, delay }; return 73; };
    globalThis.clearTimeout = id => { cleared = id; };
    let advances = 0;
    const cleanup = rotation.scheduleHeroAdvance(() => advances++);
    assert.equal(scheduled.delay, 7000);
    scheduled.callback(); assert.equal(advances, 1);
    cleanup(); assert.equal(cleared, 73);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

async function harness({ initiallyVisible = true } = {}) {
  const h = { cursor: 0, slots: [{ current: {} }], effects: [], reduced: false, hidden: false, headerHeight: 92, timers: new Map(), nextTimer: 0 };
  const originalDocument = globalThis.document;
  globalThis.document = { querySelector: () => ({ parentElement: { getBoundingClientRect: () => ({ height: h.headerHeight }) } }) };
  globalThis.__d3Hero = h;
  globalThis.IntersectionObserver = class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; h.observer = this; }
    observe(element) { this.element = element; this.callback([{ isIntersecting: initiallyVisible, intersectionRatio: initiallyVisible ? 1 : 0 }]); }
    disconnect() { this.disconnected = true; }
  };
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) { this.callback = callback; h.headerResize = this; }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  };
  const heroModule = await bundle("export { VideoHero, HeroVideo } from './components/storefront/video-hero';", {
    "next/link": "export default function Link() {}",
    "react": `
      export function useState(initial) {
        const h = globalThis.__d3Hero, i = h.cursor++;
        h.slots[i] ??= { value: initial };
        return [h.slots[i].value, value => {
          h.slots[i].value = typeof value === 'function' ? value(h.slots[i].value) : value;
        }];
      }
      export function useRef(initial) {
        const h = globalThis.__d3Hero, i = h.cursor++;
        h.slots[i] ??= { current: initial }; return h.slots[i];
      }
      export function useSyncExternalStore(subscribe, snapshot) {
        return snapshot.name === 'reducedMotion' ? globalThis.__d3Hero.reduced : globalThis.__d3Hero.hidden;
      }
      export function useEffect(effect, deps) {
        const h = globalThis.__d3Hero, i = h.cursor++;
        const old = h.slots[i];
        if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) {
          old?.cleanup?.();
          const slot = h.slots[i] = { deps };
          h.effects.push(() => { slot.cleanup = effect(); });
        }
      }
    `,
    "@/lib/storefront/hero-slideshow": `
      export { heroSlides, heroSlideIndex } from './lib/storefront/hero-slideshow';
      export function scheduleHeroAdvance(callback) {
        const h = globalThis.__d3Hero, id = ++h.nextTimer;
        h.timers.set(id, { callback, delay: 7000 });
        return () => h.timers.delete(id);
      }
    `,
  });
  const render = () => {
    let view;
    for (let pass = 0; pass < 2; pass++) {
      h.cursor = 0; h.effects = [];
      view = heroModule.VideoHero();
      for (const effect of h.effects) effect();
    }
    return view;
  };
  const button = (view, label) => find(view, node => node.type === "button" && node.props["aria-label"] === label);
  const activeVideo = view => find(view, node => node.type === heroModule.HeroVideo);
  const advance = () => {
    assert.equal(h.timers.size, 1);
    const [id, timer] = h.timers.entries().next().value;
    h.timers.delete(id); timer.callback();
    return render();
  };
  const dispose = () => { for (const slot of h.slots) slot?.cleanup?.(); delete globalThis.__d3Hero; delete globalThis.IntersectionObserver; delete globalThis.ResizeObserver; globalThis.document = originalDocument; };
  return { h, render, button, activeVideo, advance, dispose, heroModule };
}

test("only the active approved video is mounted and each seven-second boundary advances in order", async () => {
  const { h, render, activeVideo, advance, dispose } = await harness();
  try {
    let view = render();
    for (const expected of ["1st", "2nd", "3rd", "4th", "1st"]) {
      assert.ok(activeVideo(view).props.src.endsWith(`/${expected}-web.mp4`));
      assert.equal(h.timers.size, 1);
      assert.equal(h.timers.values().next().value.delay, 7000);
      view = advance();
    }
  } finally { dispose(); }
});

test("arrows and indicators reset the timer, including selecting the already active slide", async () => {
  const { h, render, button, activeVideo, dispose } = await harness();
  try {
    let view = render(); const first = h.nextTimer;
    button(view, "Next video").props.onClick(); view = render();
    assert.ok(activeVideo(view).props.src.endsWith('/2nd-web.mp4'));
    assert.equal(h.timers.has(first), false);
    button(view, "Previous video").props.onClick(); view = render();
    assert.ok(activeVideo(view).props.src.endsWith('/1st-web.mp4'));
    button(view, "Show video 4 of 4").props.onClick(); view = render();
    assert.ok(activeVideo(view).props.src.endsWith('/4th-web.mp4'));
    const before = h.nextTimer;
    button(view, "Show video 4 of 4").props.onClick(); render();
    assert.ok(h.nextTimer > before);
    assert.equal(h.timers.size, 1);
  } finally { dispose(); }
});

test("explicit pause and focus pause are independent and resume creates one fresh timer", async () => {
  const { h, render, button, dispose } = await harness();
  try {
    let view = render();
    const controls = find(view, node => node.props?.["aria-label"] === "Video slideshow controls");
    controls.props.onFocusCapture({ target: { matches: () => true } }); view = render(); assert.equal(h.timers.size, 0);
    button(view, "Pause video slideshow").props.onClick(); view = render();
    globalThis.Node = class Node {};
    controls.props.onBlurCapture({ relatedTarget: null, currentTarget: { contains: () => false } });
    view = render(); assert.equal(h.timers.size, 0);
    button(view, "Resume video slideshow").props.onClick(); render(); assert.equal(h.timers.size, 1);
    dispose(); assert.equal(h.timers.size, 0);
  } finally { delete globalThis.Node; dispose(); }
});

test("hidden pages pause video and rotation and visibility restoration restarts one timer", async () => {
  const { h, render, activeVideo, dispose } = await harness();
  try {
    render(); h.hidden = true;
    const view = render(); assert.equal(h.timers.size, 0); assert.equal(activeVideo(view), undefined);
    h.hidden = false; render(); assert.equal(h.timers.size, 1);
  } finally { dispose(); }
});

test("reduced motion defaults to no video download or timer and manual controls remain usable", async () => {
  const { h, render, button, activeVideo, dispose } = await harness();
  try {
    h.reduced = true; let view = render();
    assert.equal(activeVideo(view), undefined); assert.equal(h.timers.size, 0);
    button(view, "Next video").props.onClick(); view = render();
    assert.equal(activeVideo(view), undefined); assert.equal(h.timers.size, 0);
    assert.equal(button(view, "Show video 2 of 4").props["aria-pressed"], true);
    button(view, "Resume video slideshow").props.onClick(); view = render();
    assert.ok(activeVideo(view)); assert.equal(h.timers.size, 1);
  } finally { dispose(); }
});

test("active videos loop muted, cover without stretching, restart, and pause on cleanup", async () => {
  const { h, heroModule, dispose } = await harness();
  try {
    let plays = 0, pauses = 0, loads = 0;
    const video = { currentTime: 17, play: () => { plays++; return Promise.resolve(); }, pause: () => pauses++, removeAttribute: () => { delete video.src; }, load: () => loads++ };
    h.slots[0] = { current: video };
    h.cursor = 0; h.effects = [];
    const view = heroModule.HeroVideo({ src: 'test.mp4', playing: true });
    for (const effect of h.effects) effect();
    const element = find(view, node => node.type === 'video');
    assert.equal(element.props.muted, true); assert.equal(element.props.loop, true);
    assert.equal(element.props.playsInline, true); assert.equal(element.props.preload, 'metadata');
    assert.match(element.props.className, /object-cover/);
    assert.equal(video.currentTime, 0); assert.equal(plays, 1);
    dispose(); assert.equal(pauses, 2); assert.equal(video.src, undefined); assert.equal(loads, 1);
  } finally { dispose(); }
});

test("hero integration keeps the existing collection destination and other homepage sections", () => {
  const page = readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
  const hero = readFileSync(path.join(root, 'components/storefront/video-hero.tsx'), 'utf8');
  assert.match(page, /<VideoHero \/>/);
  assert.match(page, /Featured products/); assert.match(page, /FOXYGEON COLLECTIONS/);
  assert.match(hero, /Shop Our Latest Collection/);
  assert.match(hero, /href="\/collections\/foxygeon-collections"/);
  assert.doesNotMatch(hero, /fetch\(|onEnded|preload="auto"/);
});

test("autoplay rejection hides failed media without showing an error message", async () => {
  const { h, heroModule, dispose } = await harness();
  try {
    h.slots[0] = { current: { currentTime: 0, play: () => Promise.reject(new Error('NotAllowedError')), pause: () => {}, removeAttribute: () => {}, load: () => {} } };
    h.cursor = 0; h.effects = [];
    heroModule.HeroVideo({ src: 'test.mp4', playing: true });
    for (const effect of h.effects) effect();
    await Promise.resolve();
    h.cursor = 0; h.effects = [];
    const view = heroModule.HeroVideo({ src: 'test.mp4', playing: true });
    assert.equal(find(view, node => node.type === 'p'), undefined);
    assert.match(find(view, node => node.type === 'video').props.className, /opacity-0/);
  } finally { dispose(); }
});

test("viewport exit stops rotation and releases the active video; entry restarts one countdown", async () => {
  const { h, render, activeVideo, dispose } = await harness();
  try {
    render(); const previousTimer = h.nextTimer;
    assert.equal(h.observer.options.rootMargin, '-92px 0px 0px 0px');
    h.observer.callback([{ isIntersecting: false, intersectionRatio: 0 }]);
    const offscreen = render();
    assert.equal(h.timers.size, 0); assert.equal(activeVideo(offscreen), undefined);
    assert.ok(find(offscreen, node => node.props?.className?.includes('radial-gradient')));
    assert.ok(find(offscreen, node => node.props?.href === '/collections/foxygeon-collections'));
    h.observer.callback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    assert.ok(activeVideo(render())); assert.equal(h.timers.size, 1);
    assert.ok(h.nextTimer > previousTimer); assert.equal(h.timers.has(previousTimer), false);
    const observer = h.observer; dispose(); assert.equal(observer.disconnected, true);
  } finally { dispose(); }
});

test("viewport re-entry cannot override explicit pause or hidden-tab protection", async () => {
  const { h, render, button, activeVideo, dispose } = await harness();
  try {
    let view = render(); button(view, 'Pause video slideshow').props.onClick(); render();
    h.observer.callback([{ isIntersecting: false, intersectionRatio: 0 }]); render();
    h.observer.callback([{ isIntersecting: true, intersectionRatio: 1 }]); view = render();
    assert.equal(h.timers.size, 0); assert.equal(activeVideo(view).props.playing, false);
    h.hidden = true; assert.equal(activeVideo(render()), undefined);
    h.hidden = false; render(); assert.equal(h.timers.size, 0);
  } finally { dispose(); }
});

test("header resize replaces its intersection observer and stale callbacks cannot restart playback", async () => {
  const { h, render, activeVideo, dispose } = await harness();
  try {
    render(); const original = h.observer;
    h.headerHeight = 240; h.headerResize.callback();
    assert.equal(original.disconnected, true);
    assert.equal(h.observer.options.rootMargin, '-240px 0px 0px 0px');
    h.observer.callback([{ isIntersecting: false, intersectionRatio: 0 }]); render();
    original.callback([{ isIntersecting: true, intersectionRatio: 1 }]);
    assert.equal(activeVideo(render()), undefined); assert.equal(h.timers.size, 0);
    const resize = h.headerResize; dispose(); assert.equal(resize.disconnected, true);
  } finally { dispose(); }
});

test("an initially offscreen hero loads no video until its first viewport entry", async () => {
  const { h, render, activeVideo, dispose } = await harness({ initiallyVisible: false });
  try {
    const view = render(); assert.equal(activeVideo(view), undefined); assert.equal(h.timers.size, 0);
    assert.ok(find(view, node => node.props?.className?.includes('radial-gradient')));
    h.observer.callback([{ isIntersecting: true, intersectionRatio: 1 }]);
    assert.ok(activeVideo(render())); assert.equal(h.timers.size, 1);
  } finally { dispose(); }
});

for (const [label, selected, afterCountdown] of [
  ['Next video', '2nd-web.mp4', '3rd-web.mp4'],
  ['Previous video', '4th-web.mp4', '1st-web.mp4'],
  ['Show video 4 of 4', '4th-web.mp4', '1st-web.mp4'],
]) {
  test(`pointer activation of ${label} resets the countdown and allows the next automatic slide`, async () => {
    const { h, render, button, activeVideo, advance, dispose } = await harness();
    try {
      let view = render(); const previousTimer = h.nextTimer;
      const controls = find(view, node => node.props?.['aria-label'] === 'Video slideshow controls');
      controls.props.onPointerDownCapture();
      controls.props.onFocusCapture({ target: { matches: selector => {
        assert.equal(selector, ':focus-visible'); return false;
      } } });
      button(view, label).props.onClick(); view = render();
      assert.ok(activeVideo(view).props.src.endsWith(selected));
      assert.equal(h.timers.has(previousTimer), false);
      assert.equal(h.timers.size, 1);
      assert.equal(h.timers.values().next().value.delay, 7000);
      assert.ok(activeVideo(advance()).props.src.endsWith(afterCountdown));
      assert.equal(h.timers.size, 1);
    } finally { dispose(); }
  });
}

test("Tab and Shift+Tab pause within controls and exiting keyboard focus restarts one countdown", async () => {
  const { h, render, dispose } = await harness();
  const originalNode = globalThis.Node;
  globalThis.Node = class Node {};
  try {
    let view = render();
    const controls = find(view, node => node.props?.['aria-label'] === 'Video slideshow controls');
    controls.props.onFocusCapture({ target: { matches: () => true } });
    view = render(); assert.equal(h.timers.size, 0);
    for (const shiftKey of [false, true]) {
      controls.props.onKeyDownCapture({ key: 'Tab', shiftKey });
      controls.props.onBlurCapture({ relatedTarget: new globalThis.Node(), currentTarget: { contains: () => true } });
      render(); assert.equal(h.timers.size, 0);
    }
    controls.props.onBlurCapture({ relatedTarget: null, currentTarget: { contains: () => false } });
    render(); assert.equal(h.timers.size, 1);
    assert.equal(h.timers.values().next().value.delay, 7000);
  } finally { globalThis.Node = originalNode; dispose(); }
});

test("keyboard use of a pointer-focused control pauses; switching back to pointer resumes without duplicate timers", async () => {
  const { h, render, dispose } = await harness();
  try {
    const view = render();
    const controls = find(view, node => node.props?.['aria-label'] === 'Video slideshow controls');
    controls.props.onFocusCapture({ target: { matches: () => false } }); render();
    assert.equal(h.timers.size, 1);
    controls.props.onKeyDownCapture({ key: 'Tab' }); render(); assert.equal(h.timers.size, 0);
    controls.props.onPointerDownCapture(); render(); assert.equal(h.timers.size, 1);
    controls.props.onPointerDownCapture(); render(); assert.equal(h.timers.size, 1);
  } finally { dispose(); }
});

test("explicit pause remains authoritative through keyboard focus and pointer navigation", async () => {
  const { h, render, button, activeVideo, dispose } = await harness();
  try {
    let view = render();
    const controls = find(view, node => node.props?.['aria-label'] === 'Video slideshow controls');
    controls.props.onPointerDownCapture(); button(view, 'Pause video slideshow').props.onClick(); render();
    controls.props.onKeyDownCapture({ key: 'Tab' }); render(); assert.equal(h.timers.size, 0);
    controls.props.onPointerDownCapture();
    controls.props.onFocusCapture({ target: { matches: () => false } });
    view = render(); button(view, 'Next video').props.onClick(); view = render();
    assert.equal(h.timers.size, 0); assert.equal(activeVideo(view).props.playing, false);
    assert.ok(button(view, 'Resume video slideshow'));
  } finally { dispose(); }
});

test("pointer events cannot bypass hidden-tab, offscreen, or reduced-motion blockers", async () => {
  const { h, render, dispose } = await harness();
  try {
    const view = render();
    const controls = find(view, node => node.props?.['aria-label'] === 'Video slideshow controls');
    h.hidden = true; controls.props.onPointerDownCapture(); render(); assert.equal(h.timers.size, 0);
    h.hidden = false; h.reduced = true; controls.props.onPointerDownCapture(); render(); assert.equal(h.timers.size, 0);
    h.reduced = false; h.observer.callback([{ isIntersecting: false, intersectionRatio: 0 }]);
    controls.props.onPointerDownCapture(); render(); assert.equal(h.timers.size, 0);
  } finally { dispose(); }
});
