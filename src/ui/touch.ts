import type { Input, VirtualButton } from '../input/Input';

/** On-screen controls for phones/tablets (also forced with ?touch=1). */
export function setupTouch(input: Input): void {
  const root = document.getElementById('touch');
  if (!root) return;
  const forced = new URLSearchParams(location.search).has('touch');
  if (!forced && !matchMedia('(pointer: coarse)').matches) return;
  input.touch = true;
  root.hidden = false;
  document.body.classList.add('is-touch');
  root.querySelectorAll<HTMLElement>('[data-vbtn]').forEach((el) => {
    const name = el.dataset.vbtn as VirtualButton;
    const on = (e: Event) => { e.preventDefault(); input.setVirtual(name, true); el.classList.add('down'); };
    const off = (e: Event) => { e.preventDefault(); input.setVirtual(name, false); el.classList.remove('down'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  });
}
