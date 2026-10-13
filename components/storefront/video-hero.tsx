"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";

import { heroSlideIndex, heroSlides, scheduleHeroAdvance } from "@/lib/storefront/hero-slideshow";

function subscribeMotion(change: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeVisibility(change: () => void) {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}

function pageHidden() {
  return document.hidden;
}

// Start conservatively during SSR/hydration; no video downloads before preferences are known.
function serverInactive() {
  return true;
}

export function HeroVideo({ src, playing }: { src: string; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.src = src;
    video.currentTime = 0;
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    if (playing) {
      void video.play().catch(() => {
        if (active) setFailed(true);
      });
    } else {
      video.pause();
    }
    return () => {
      active = false;
      video.pause();
    };
  }, [playing, src]);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        onLoadedData={() => setReady(true)}
        onPlaying={() => setFailed(false)}
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${ready && !failed ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}

export function VideoHero() {
  const heroRef = useRef<HTMLElement>(null);
  const [inViewport, setInViewport] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [keyboardFocusWithin, setKeyboardFocusWithin] = useState(false);
  const [manualVersion, setManualVersion] = useState(0);
  const [motionOptIn, setMotionOptIn] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(subscribeMotion, reducedMotion, serverInactive);
  const hidden = useSyncExternalStore(subscribeVisibility, pageHidden, serverInactive);
  const mediaEnabled = !prefersReducedMotion || motionOptIn;
  const playing = mediaEnabled && inViewport && !paused && !hidden;
  const cycling = playing && !keyboardFocusWithin;

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const stickyHeader = document.querySelector("header")?.parentElement;
    let observer: IntersectionObserver;
    const observeViewport = () => {
      observer?.disconnect();
      const headerHeight = stickyHeader?.getBoundingClientRect().height ?? 0;
      const current = new IntersectionObserver(([entry]) => {
        if (observer !== current) return;
        setInViewport(entry.isIntersecting && entry.intersectionRatio >= 0.01);
      }, { threshold: [0, 0.01], rootMargin: `-${headerHeight}px 0px 0px 0px` });
      observer = current;
      observer.observe(hero);
    };
    observeViewport();
    const headerResize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(observeViewport);
    if (stickyHeader) headerResize?.observe(stickyHeader);
    return () => {
      observer.disconnect();
      headerResize?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!cycling) return;
    return scheduleHeroAdvance(() => setIndex((current) => heroSlideIndex(current + 1)));
  }, [cycling, index, manualVersion]);

  const selectSlide = (target: number) => {
    setIndex(heroSlideIndex(target));
    setManualVersion((version) => version + 1);
  };

  const togglePause = () => {
    if (!mediaEnabled) {
      setMotionOptIn(true);
      setPaused(false);
    } else {
      setPaused((current) => !current);
    }
    setManualVersion((version) => version + 1);
  };

  const blurControls = (event: FocusEvent<HTMLDivElement>) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setKeyboardFocusWithin(false);
    }
  };

  const focusControls = (event: FocusEvent<HTMLDivElement>) => {
    setKeyboardFocusWithin(event.target.matches(":focus-visible"));
  };

  const controlClass = "flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

  return (
    <section ref={heroRef} aria-label="Latest collection videos" aria-roledescription="carousel" className="relative isolate min-h-[560px] w-full overflow-hidden bg-neutral-900 h-[75svh] max-h-[900px] sm:min-h-[600px]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,#766858_0%,transparent_55%),linear-gradient(135deg,#353a38_0%,#202826_45%,#171c1b_100%)]" />
      {mediaEnabled && inViewport && !hidden ? <HeroVideo key={index} src={heroSlides[index]} playing={playing} /> : null}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-black/20" />
      <div className="absolute bottom-32 left-6 right-6 z-10 sm:bottom-28 sm:left-12 sm:right-auto sm:max-w-xl">
        <h2 className="font-sans text-4xl font-medium leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
          Shop Our Latest Collection
        </h2>
        <Link href="/collections/foxygeon-collections" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          Shop now
        </Link>
      </div>
      <div
        role="group"
        aria-label="Video slideshow controls"
        onPointerDownCapture={() => setKeyboardFocusWithin(false)}
        onKeyDownCapture={() => setKeyboardFocusWithin(true)}
        onFocusCapture={focusControls}
        onBlurCapture={blurControls}
        className="absolute bottom-6 left-6 right-6 z-10 flex items-center justify-between gap-3 sm:left-12 sm:right-12"
      >
        <div className="flex items-center gap-1">
          {heroSlides.map((_, slide) => (
            <button key={slide} type="button" aria-label={`Show video ${slide + 1} of ${heroSlides.length}`} aria-pressed={index === slide} onClick={() => selectSlide(slide)} className="flex h-11 w-8 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <span aria-hidden="true" className={`h-0.5 w-6 transition-colors ${index === slide ? "bg-white" : "bg-white/40"}`} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous video" onClick={() => selectSlide(index - 1)} className={controlClass}><ChevronLeft aria-hidden="true" size={18} /></button>
          <button type="button" aria-label={paused || !mediaEnabled ? "Resume video slideshow" : "Pause video slideshow"} aria-pressed={paused || !mediaEnabled} onClick={togglePause} className={controlClass}>
            {paused || !mediaEnabled ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}
          </button>
          <button type="button" aria-label="Next video" onClick={() => selectSlide(index + 1)} className={controlClass}><ChevronRight aria-hidden="true" size={18} /></button>
        </div>
      </div>
      <span className="sr-only" aria-live="off">Video {index + 1} of {heroSlides.length}</span>
    </section>
  );
}
