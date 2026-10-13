import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle } from "../admin-a/support/bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const header = readFileSync(path.join(root, "components/storefront/header.tsx"), "utf8");
const catalog = readFileSync(path.join(root, "lib/data/catalog.ts"), "utf8");
const globals = readFileSync(path.join(root, "app/globals.css"), "utf8");
const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");

const rotation = await bundle(`
  export * from "./lib/storefront/announcement-rotation";
`);

test("the announcement catalogue keeps the existing copy and adds the third approved message", () => {
  const announcementBlock = catalog.match(/export const announcements = \[([\s\S]*?)\];/)?.[1] ?? "";

  assert.match(announcementBlock, /"Free Delivery On Orders Over R600"/);
  assert.match(announcementBlock, /"Delivery In 5 to 10 Business Days"/);
  assert.match(announcementBlock, /"Explore The DEIGON Collections"/);
  assert.equal((announcementBlock.match(/^\s*"/gm) ?? []).length, 3);
});

test("announcement index helpers wrap continuously in both directions", () => {
  assert.equal(rotation.nextAnnouncementIndex(0, 3), 1);
  assert.equal(rotation.nextAnnouncementIndex(2, 3), 0);
  assert.equal(rotation.previousAnnouncementIndex(2, 3), 1);
  assert.equal(rotation.previousAnnouncementIndex(0, 3), 2);
  assert.equal(rotation.nextAnnouncementIndex(0, 0), 0);
  assert.equal(rotation.previousAnnouncementIndex(0, 0), 0);
});

test("automatic rotation uses one six-second timer and cleans it up", () => {
  let scheduled;
  const cleared = [];
  const timerApi = {
    setInterval(callback, delay) {
      scheduled = { callback, delay, id: 41 };
      return scheduled.id;
    },
    clearInterval(timer) {
      cleared.push(timer);
    },
  };
  let advances = 0;

  const cleanup = rotation.scheduleAnnouncementAdvance(() => {
    advances += 1;
  }, timerApi);

  assert.equal(scheduled.delay, 6_000);
  scheduled.callback();
  assert.equal(advances, 1);
  cleanup();
  assert.deepEqual(cleared, [41]);
});

test("resetting automatic rotation retires the old interval before scheduling a fresh one", () => {
  let nextId = 0;
  const active = new Map();
  const timerApi = {
    setInterval(callback, delay) {
      const id = ++nextId;
      active.set(id, { callback, delay });
      return id;
    },
    clearInterval(timer) {
      active.delete(timer);
    },
  };
  let advances = 0;

  const cleanupFirst = rotation.scheduleAnnouncementAdvance(() => {
    advances += 1;
  }, timerApi);
  cleanupFirst();
  const cleanupSecond = rotation.scheduleAnnouncementAdvance(() => {
    advances += 1;
  }, timerApi);

  assert.equal(active.size, 1);
  assert.equal(active.has(1), false);
  assert.equal(active.get(2).delay, 6_000);
  active.get(2).callback();
  assert.equal(advances, 1);
  cleanupSecond();
  assert.equal(active.size, 0);
});

test("pause, interaction, and reduced-motion preferences independently stop autoplay", () => {
  const enabled = rotation.announcementAutoplayEnabled;

  assert.equal(enabled({ isPaused: false, isInteracting: false, prefersReducedMotion: false }), true);
  assert.equal(enabled({ isPaused: true, isInteracting: false, prefersReducedMotion: false }), false);
  assert.equal(enabled({ isPaused: false, isInteracting: true, prefersReducedMotion: false }), false);
  assert.equal(enabled({ isPaused: false, isInteracting: false, prefersReducedMotion: true }), false);
});

test("hover ending does not resume autoplay while keyboard focus remains inside", () => {
  let isHovered = true;
  let isFocusWithin = false;
  const isInteracting = () => rotation.announcementInteractionActive({ isHovered, isFocusWithin });

  assert.equal(isInteracting(), true);
  isFocusWithin = true;
  assert.equal(isInteracting(), true);
  isHovered = false;
  assert.equal(isInteracting(), true);
  assert.equal(
    rotation.announcementAutoplayEnabled({
      isPaused: false,
      isInteracting: isInteracting(),
      prefersReducedMotion: false,
    }),
    false,
  );
});

test("focus leaving does not resume autoplay while the pointer remains over the bar", () => {
  let isHovered = false;
  let isFocusWithin = true;
  const isInteracting = () => rotation.announcementInteractionActive({ isHovered, isFocusWithin });

  assert.equal(isInteracting(), true);
  isHovered = true;
  assert.equal(isInteracting(), true);
  isFocusWithin = false;
  assert.equal(isInteracting(), true);
  assert.equal(
    rotation.announcementAutoplayEnabled({
      isPaused: false,
      isInteracting: isInteracting(),
      prefersReducedMotion: false,
    }),
    false,
  );
});

test("autoplay resumes only after hover, focus, explicit pause, and reduced motion are clear", () => {
  const interaction = rotation.announcementInteractionActive;
  const enabled = rotation.announcementAutoplayEnabled;

  assert.equal(interaction({ isHovered: true, isFocusWithin: true }), true);
  assert.equal(interaction({ isHovered: false, isFocusWithin: false }), false);
  assert.equal(
    enabled({ isPaused: false, isInteracting: false, prefersReducedMotion: false }),
    true,
  );
  assert.equal(
    enabled({ isPaused: true, isInteracting: false, prefersReducedMotion: false }),
    false,
  );
  assert.equal(
    enabled({ isPaused: false, isInteracting: false, prefersReducedMotion: true }),
    false,
  );
});

test("manual navigation resets autoplay while pause and resume remain explicit", () => {
  assert.match(header, /const resetAnnouncementTimer = \(\) => setRotationVersion/);
  assert.match(header, /const prev = \(\) => \{[\s\S]*?previousAnnouncementIndex[\s\S]*?resetAnnouncementTimer\(\);[\s\S]*?\};/);
  assert.match(header, /const next = \(\) => \{[\s\S]*?nextAnnouncementIndex[\s\S]*?resetAnnouncementTimer\(\);[\s\S]*?\};/);
  assert.match(header, /setIsAnnouncementPaused\(\(paused\) => !paused\)/);
  assert.match(header, /\[isAnnouncementInteracting, isAnnouncementPaused, prefersReducedMotion, rotationVersion\]/);
  assert.match(header, /"Resume announcements"/);
  assert.match(header, /"Pause announcements"/);
});

test("hover, focus, accessibility, and reduced-motion safeguards are present", () => {
  assert.match(header, /onMouseEnter=\{\(\) => setIsAnnouncementHovered\(true\)\}/);
  assert.match(header, /onMouseLeave=\{\(\) => setIsAnnouncementHovered\(false\)\}/);
  assert.match(header, /onFocusCapture=\{\(\) => setIsAnnouncementFocusWithin\(true\)\}/);
  assert.match(header, /onBlurCapture=\{handleAnnouncementBlur\}/);
  assert.match(header, /isHovered: isAnnouncementHovered/);
  assert.match(header, /isFocusWithin: isAnnouncementFocusWithin/);
  assert.match(header, /aria-label="Previous announcement"/);
  assert.match(header, /aria-label="Next announcement"/);
  assert.match(header, /aria-live="off"/);
  assert.match(header, /prefers-reduced-motion: reduce/);
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /\.announcement-message\s*\{\s*animation: none;/);
});

test("the fixed-height announcement bar preserves the D6 sticky layout", () => {
  assert.match(header, /className="sticky top-0 z-40"/);
  assert.match(header, /className="relative flex h-10 items-center justify-center/);
  assert.match(header, /className="announcement-message block truncate"/);
  assert.match(layout, /className="relative min-h-screen overflow-x-clip"/);
  assert.doesNotMatch(layout, /overflow-hidden/);
});
