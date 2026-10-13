export const HERO_SLIDE_DURATION_MS = 7_000;

export const heroSlides = [
  "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/public/homepage-media/1st-web.mp4",
  "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/public/homepage-media/2nd-web.mp4",
  "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/public/homepage-media/3rd-web.mp4",
  "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/public/homepage-media/4th-web.mp4",
] as const;

export function heroSlideIndex(index: number) {
  return ((index % heroSlides.length) + heroSlides.length) % heroSlides.length;
}

export function scheduleHeroAdvance(advance: () => void) {
  const timer = setTimeout(advance, HERO_SLIDE_DURATION_MS);
  return () => clearTimeout(timer);
}
