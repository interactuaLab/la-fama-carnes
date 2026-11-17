/**
 * LA FAMA CARNES - Scripts Principales
 * Manejo de navegación móvil, encabezado interactivo y enlaces a WhatsApp
 */

const LA_FAMA_CONFIG = {
  telefonoWhatsApp: '573222468276',
  mensajeGeneral: 'Hola La Fama, quisiera información sobre sus cortes y disponibilidad para mi pedido.',
  mensajeAsado: 'Hola La Fama, estoy planeando un asado y quisiera consultar cortes y disponibilidad.',
  mensajeProducto: (nombre) => `Hola, estoy interesado en consultar disponibilidad y presentación de ${nombre}.`
};

/**
 * Genera el enlace directo a WhatsApp con mensaje codificado
 */
function getWhatsAppUrl(mensaje) {
  const msg = mensaje || LA_FAMA_CONFIG.mensajeGeneral;
  return `https://wa.me/${LA_FAMA_CONFIG.telefonoWhatsApp}?text=${encodeURIComponent(msg)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  // Manejo de menú móvil
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
      mobileMenu.classList.toggle('hidden');
    });

    // Cerrar menú al hacer clic en un enlace
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Scroll suave en enlaces internos
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#' || targetId === '') return;
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});

