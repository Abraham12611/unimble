/**
 * Ref-counted body scroll lock.
 *
 * Multiple consumers (Modal, MobileSidebarDrawer, etc.) can independently
 * lock/unlock scrolling. The body overflow is only restored when the last
 * consumer unlocks — preventing one component from stomping another's lock.
 */

let lockCount = 0;
let originalOverflow = "";

export function lockScroll(): void {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}

export function unlockScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
  }
}
