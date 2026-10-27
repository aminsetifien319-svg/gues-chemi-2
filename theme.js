// الوضع الليلي: يتبع إعداد الجهاز أول مرة، ثم يتذكّر اختيار الطالب.
(function () {
  var K = 'gueschemi.theme', d = document.documentElement, t = null;
  try { t = localStorage.getItem(K); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  d.setAttribute('data-theme', t);
  function meta() { var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = '#0a1a33'; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!b) return;
    t = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    d.setAttribute('data-theme', t);
    b.setAttribute('aria-label', t === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي');
    try { localStorage.setItem(K, t); } catch (e2) {}
    meta();
  });
})();
