(function () {
  var secciones = Array.prototype.slice.call(document.querySelectorAll('.lamina'));
  var nav = document.querySelector('.puntos');

  // puntos de navegación
  secciones.forEach(function (s) {
    var a = document.createElement('a');
    a.href = '#' + s.id; a.setAttribute('aria-label', s.dataset.nombre);
    nav.appendChild(a);
  });
  var puntos = nav.querySelectorAll('a');

  // aparición de contenido
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.18 });
  secciones.forEach(function (s) { io.observe(s); });

  // sección activa
  function activa() {
    var c = innerHeight * 0.5, idx = 0;
    secciones.forEach(function (s, i) { if (s.getBoundingClientRect().top < c) idx = i; });
    puntos.forEach(function (p, i) { p.classList.toggle('activo', i === idx); });
  }
  addEventListener('scroll', activa, { passive: true }); activa();

  // bordes de papel rasgado en las fotos
  function rasgado(seed) {
    var r = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var pts = [], n = 22, i;
    for (i = 0; i <= n; i++) pts.push((i / n * 100).toFixed(2) + '% ' + (r() * 2.2).toFixed(2) + '%');
    for (i = 1; i <= n; i++) pts.push((100 - r() * 1.6).toFixed(2) + '% ' + (i / n * 100).toFixed(2) + '%');
    for (i = n - 1; i >= 0; i--) pts.push((i / n * 100).toFixed(2) + '% ' + (100 - r() * 2.2).toFixed(2) + '%');
    for (i = n - 1; i >= 1; i--) pts.push((r() * 1.6).toFixed(2) + '% ' + (i / n * 100).toFixed(2) + '%');
    return 'polygon(' + pts.join(',') + ')';
  }
  document.querySelectorAll('.galeria img').forEach(function (img, i) {
    img.style.clipPath = rasgado(1234 + i * 977);
    img.parentNode.style.transform = 'rotate(' + ((i % 3) - 1) * 1.2 + 'deg)';
  });

  // visor
  var visor = document.querySelector('.visor'), vimg = visor.querySelector('img');
  document.querySelectorAll('.galeria img').forEach(function (img) {
    img.addEventListener('click', function () { vimg.src = img.src; vimg.alt = img.alt; visor.hidden = false; });
  });
  visor.addEventListener('click', function () { visor.hidden = true; });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') visor.hidden = true; });
})();
