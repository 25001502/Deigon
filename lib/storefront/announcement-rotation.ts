export const ANNOUNCEMENT_INTERVAL_MS = 6_000;

export function nextAnnouncementIndex(currentIndex: number, announcementCount: number) {
  if (announcementCount <= 0) {
    return 0;
  }

  return (currentIndex + 1) % announcementCount;
}

export function previousAnnouncementIndex(currentIndex: number, announcementCount: number) {
  if (announcementCount <= 0) {
    return 0;
  }

  return (currentIndex - 1 + announcementCount) % announcementCount;
}

export function announcementInteractionActive({
  isHovered,
  isFocusWithin,
}: {
  isHovered: boolean;
  isFocusWithin: boolean;
}) {
  return isHovered || isFocusWithin;
}

export function announcementAutoplayEnabled({
  isPaused,
  isInteracting,
  prefersReducedMotion,
}: {
  isPaused: boolean;
  isInteracting: boolean;
  prefersReducedMotion: boolean;
}) {
  return !isPaused && !isInteracting && !prefersReducedMotion;
}

type AnnouncementTimerApi = {
  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
};

const browserTimerApi: AnnouncementTimerApi = {
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (timer) => clearInterval(timer),
};

export function scheduleAnnouncementAdvance(
  onAdvance: () => void,
  timerApi: AnnouncementTimerApi = browserTimerApi,
) {
  const timer = timerApi.setInterval(onAdvance, ANNOUNCEMENT_INTERVAL_MS);

  return () => timerApi.clearInterval(timer);
}
