// Applies the saved theme before first paint (external file so a strict CSP without inline scripts works).
try {
  var t = localStorage.getItem('aegis.theme');
  if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
} catch (e) {}
