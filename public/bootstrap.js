// Scripts exécutés avant le chargement d'Angular. Ils vivent dans un fichier
// séparé pour que la CSP stricte (`script-src 'self'`) n'ait pas besoin
// d'autoriser les scripts inline.
(() => {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

  window.addEventListener('contextmenu', (event) => event.preventDefault());

  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (event) => event.preventDefault());
  }
  for (const type of ['touchstart', 'touchmove']) {
    document.addEventListener(
      type,
      (event) => {
        if (event.touches.length > 1) {
          event.preventDefault();
        }
      },
      { passive: false },
    );
  }
})();
