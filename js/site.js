/* The landing page: the trailer in a dialog (with sound), and the hero's background video held still
 * for people who ask for less motion. */
(() => {
  'use strict';
  const box = document.getElementById('trailer-box'), boxVideo = box.querySelector('video');
  for (const b of document.querySelectorAll('[data-trailer]')) {
    b.addEventListener('click', () => {
      box.showModal();
      boxVideo.play().catch(() => {});   // the click allows sound
    });
  }
  // stop it however the dialog goes away: Esc (cancel, then close), the × button, or the backdrop
  for (const t of ['cancel', 'close']) box.addEventListener(t, () => boxVideo.pause());
  // a click on the backdrop closes it where the browser doesn't do that itself (closedby="any")
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    box.addEventListener('click', (e) => {
      if (e.target !== box) return;
      const r = box.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) box.close();
    });
  }
  // less motion: the background video stays on its poster
  const hero = document.querySelector('.hero-video'), still = matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => { if (still.matches) { hero.removeAttribute('autoplay'); hero.pause(); } else hero.play().catch(() => {}); };
  sync();
  still.addEventListener('change', sync);
})();
