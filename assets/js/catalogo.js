/**
 * LA FAMA CARNES - Motor Reactivo del Catálogo y Lista de Pedido
 * Carga dinámica desde data/productos.json, búsqueda en tiempo real,
 * filtrado por las 6 categorías oficiales, cálculo automático de contadores,
 * gestión de lista de pedido en localStorage y generación de mensaje único para WhatsApp.
 */

(function () {
  'use strict';

  // Configuración base
  const CONFIG = {
    datosUrl: 'data/productos.json',
    combosUrl: 'data/combos.json',
    telefonoWhatsApp: '573222468276',
    storageKey: 'la_fama_pedido_v1'
  };

  // Estado del catálogo
  let productos = [];
  let categorias = [];
  let combosData = [];
  let comboSeleccionadoActual = {}; // Mapa keyed por comboId: { presentacionId, cantidad }
  let configDatos = {};
  let categoriaActual = 'all';
  let terminoBusqueda = '';

  // Elementos DOM de Combos
  const combosContainer = document.getElementById('combosContainer');

  // Estado de la Lista de Pedido (cargado desde localStorage)
  let listaPedido = [];

  // Elementos DOM del Catálogo
  const searchInput = document.getElementById('cutSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const categoryFiltersContainer = document.getElementById('categoryFilters');
  const productGrid = document.getElementById('productGrid');
  const noResultsState = document.getElementById('noResultsState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const totalCounter = document.getElementById('totalCounter');
  const activeCategoryTitle = document.getElementById('activeCategoryTitle');

  // Elementos DOM de la Lista de Pedido
  const floatingOrderBtn = document.getElementById('floatingOrderBtn');
  const floatingOrderCount = document.getElementById('floatingOrderCount');
  const headerOrderBtn = document.getElementById('headerOrderBtn');
  const headerOrderCount = document.getElementById('headerOrderCount');
  const mobileOpenOrderBtn = document.getElementById('mobileOpenOrderBtn');
  const bannerOpenOrderBtn = document.getElementById('bannerOpenOrderBtn');
  const orderOverlay = document.getElementById('orderOverlay');
  const orderDrawer = document.getElementById('orderDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const orderDrawerBody = document.getElementById('orderDrawerBody');
  const drawerOrderSubtitle = document.getElementById('drawerOrderSubtitle');
  const clearOrderBtn = document.getElementById('clearOrderBtn');
  const sendOrderWhatsAppBtn = document.getElementById('sendOrderWhatsAppBtn');
  const orderToast = document.getElementById('orderToast');
  const orderToastMessage = document.getElementById('orderToastMessage');
  const toastOpenBtn = document.getElementById('toastOpenBtn');

  let toastTimeout = null;

  /**
 * Normaliza la modalidad de venta de cada producto
 */
  function normalizarPresentacion(valor) {
    const modalidad = String(valor || '').trim().toLowerCase();

    if (modalidad === 'peso') return 'peso';
    if (modalidad === 'unidad') return 'unidad';
    if (modalidad === 'paquete') return 'paquete';

    return 'por confirmar';
  }


  /* ==========================================================================
     1. GESTIÓN DEL ESTADO DE LA LISTA DE PEDIDO (LOCALSTORAGE)
     ========================================================================== */

  /**
   * Carga la lista de pedidos desde localStorage
   */
  function inicializarPedidoStorage() {
    try {
      const guardado = localStorage.getItem(CONFIG.storageKey);
      listaPedido = guardado ? JSON.parse(guardado) : [];
      if (!Array.isArray(listaPedido)) listaPedido = [];
    } catch (e) {
      console.warn('Error al leer de localStorage:', e);
      listaPedido = [];
    }
    actualizarBadgesYResumen();
  }

  /**
   * Guarda la lista de pedidos en localStorage
   */
  function persistirPedido() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(listaPedido));
    } catch (e) {
      console.warn('Error al guardar en localStorage:', e);
    }
    actualizarBadgesYResumen();
  }

  /**
   * Comprueba si un producto ya está en la lista de pedido
   */
  function estaEnPedido(productoId) {
    return listaPedido.some(item => item.id === productoId);
  }

  /**
   * Agrega un producto a la lista de pedido o abre el panel si ya existe
   */
  function agregarOEditarEnPedido(productoId) {
    const prod = productos.find(p => p.id === productoId);
    if (!prod) return;

    const index = listaPedido.findIndex(item => item.id === productoId);

    if (index === -1) {
      // Producto nuevo: agregarlo con indicación sugerida
      let indicacionInicial = '';
      listaPedido.push({
        id: prod.id,
        nombre: prod.nombre,
        categoria: prod.categoriaLabel || prod.categoria,
        indicacion: indicacionInicial
      });

      persistirPedido();
      actualizarBotonTarjeta(productoId, true);
      mostrarToast(`¡«${prod.nombre}» agregado a tu pedido!`);
    } else {
      // Ya estaba agregado: abrir el panel y enfocar el producto
      abrirDrawer();
      setTimeout(() => {
        const inputEl = document.querySelector(`input[data-action="cambiar-indicacion"][data-prod-id="${productoId}"]`);
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        }
      }, 350);
    }
  }

  /**
   * Actualiza la indicación / cantidad libre de un producto
   */
  function actualizarIndicacionItem(productoId, nuevaIndicacion) {
    const item = listaPedido.find(p => p.id === productoId);
    if (item) {
      item.indicacion = nuevaIndicacion;
      persistirPedido();
      actualizarEnlaceWhatsApp();
    }
  }

  /**
   * Elimina un producto de la lista de pedido
   */
  function eliminarDelPedido(productoId) {
    const itemEliminado = listaPedido.find(p => p.id === productoId);
    listaPedido = listaPedido.filter(item => item.id !== productoId);
    persistirPedido();
    actualizarBotonTarjeta(productoId, false);
    renderizarDrawer();
    renderizarCombos();
    if (itemEliminado) {
      mostrarToast(`«${itemEliminado.nombre}» eliminado de tu pedido`);
    }
  }

  /**
   * Vacía toda la lista de pedidos
   */
  function vaciarListaPedido() {
    if (listaPedido.length === 0) return;
    if (confirm('¿Deseas vaciar todos los productos y combos de tu lista de pedido?')) {
      listaPedido = [];
      persistirPedido();
      renderizarProductos(obtenerProductosFiltrados());
      renderizarCombos();
      renderizarDrawer();
      mostrarToast('Tu lista de pedido ha sido vaciada');
    }
  }

  /**
   * Actualiza el estado visual del botón de una tarjeta específica
   */
  function actualizarBotonTarjeta(productoId, enPedido) {
    const btn = document.querySelector(`button[data-action="toggle-pedido"][data-prod-id="${productoId}"]`);
    if (!btn) return;

    const icono = btn.querySelector('.material-symbols-outlined');
    const texto = btn.querySelector('span:not(.material-symbols-outlined)');

    if (enPedido) {
      btn.classList.remove('bg-primary-container', 'text-on-primary', 'hover:bg-secondary');
      btn.classList.add('bg-secondary', 'text-on-secondary', 'hover:bg-primary-container');
      if (icono) icono.textContent = 'check_circle';
      if (texto) texto.textContent = 'En tu lista de pedido (editar)';
    } else {
      btn.classList.add('bg-primary-container', 'text-on-primary', 'hover:bg-secondary');
      btn.classList.remove('bg-secondary', 'text-on-secondary', 'hover:bg-primary-container');
      if (icono) icono.textContent = 'add_circle';
      if (texto) texto.textContent = 'Agregar al pedido';
    }
  }

  /**
   * Actualiza contadores y badges en la interfaz
   */
  function actualizarBadgesYResumen() {
    const cantidad = listaPedido.length;

    if (floatingOrderCount) {
      floatingOrderCount.textContent = cantidad;
      floatingOrderCount.classList.remove('pulse-badge');
      void floatingOrderCount.offsetWidth; // Forzar reflow para reiniciar animación
      floatingOrderCount.classList.add('pulse-badge');
    }

    if (headerOrderCount) {
      headerOrderCount.textContent = cantidad;
    }

    if (drawerOrderSubtitle) {
      drawerOrderSubtitle.textContent = `${cantidad} ${cantidad === 1 ? 'producto o combo seleccionado' : 'productos o combos seleccionados'}`;
    }

    actualizarEnlaceWhatsApp();
  }

  /* ==========================================================================
     2. GENERACIÓN DEL MENSAJE CONSOLIDADO DE WHATSAPP
     ========================================================================== */

  /**
   * Genera el enlace de WhatsApp con todos los productos seleccionados
   */
  function actualizarEnlaceWhatsApp() {
    if (!sendOrderWhatsAppBtn) return;

    if (listaPedido.length === 0) {
      sendOrderWhatsAppBtn.removeAttribute('href');
      sendOrderWhatsAppBtn.classList.add('opacity-50', 'pointer-events-none');
      return;
    }

    sendOrderWhatsAppBtn.classList.remove('opacity-50', 'pointer-events-none');

    // Construcción del mensaje consolidado profesional y honesto
    let texto = `Hola La Fama Carnes, deseo consultar y encargar los siguientes productos para la sede Sopó:\n\n`;

    listaPedido.forEach((item, idx) => {
      if (item.esCombo) {
        const cant = item.cantidad || 1;
        texto += `${idx + 1}. *${item.nombre}* (${item.categoria})\n`;
        texto += `   → Cantidad: ${cant} ${cant === 1 ? 'combo' : 'combos'} (${item.personas} personas / ${item.pesoEstimado} est.)\n`;
        if (item.composicionTexto) {
          texto += `   → Composición base: ${item.composicionTexto}\n`;
        }
        if (item.precioProvisionalTexto) {
          texto += `   → Ref. Precio de prueba: ${item.precioProvisionalTexto}\n`;
        }
        texto += `\n`;
      } else {
        const detalle = item.indicacion && item.indicacion.trim() !== ''
          ? item.indicacion.trim()
          : 'Porción o corte a consultar';
        texto += `${idx + 1}. *${item.nombre}* (${item.categoria})\n   → Detalle/Cantidad: ${detalle}\n\n`;
      }
    });

    texto += `Por favor confirmar disponibilidad, corte exacto y detalles de entrega. ¡Muchas gracias!`;

    const tel = configDatos.whatsappNumero || CONFIG.telefonoWhatsApp;
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
    sendOrderWhatsAppBtn.setAttribute('href', url);
  }

  /* ==========================================================================
     3. CONTROL DEL DRAWER / PANEL LATERAL
     ========================================================================== */

  function abrirDrawer() {
    if (!orderDrawer || !orderOverlay) return;
    renderizarDrawer();
    orderOverlay.classList.add('open');
    orderDrawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function cerrarDrawer() {
    if (!orderDrawer || !orderOverlay) return;
    orderDrawer.classList.remove('open');
    orderOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  /**
   * Renderiza el contenido interno del panel lateral
   */
  function renderizarDrawer() {
    if (!orderDrawerBody) return;

    if (listaPedido.length === 0) {
      orderDrawerBody.innerHTML = `
        <div class="py-14 px-4 text-center flex flex-col items-center justify-center text-on-surface-variant">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
            <span class="material-symbols-outlined text-3xl">receipt_long</span>
          </div>
          <h3 class="font-headline-md text-lg font-bold text-primary mb-1">Tu lista de pedido está vacía</h3>
          <p class="font-body-sm text-xs max-w-xs mb-5 leading-relaxed">
            Explora nuestro catálogo y pulsa «Agregar al pedido» en los cortes que deseas solicitar para consolidar tu solicitud.
          </p>
          <button type="button" id="drawerExploreBtn" class="px-5 py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-title-sm text-xs font-semibold transition-colors">
            Explorar catálogo
          </button>
        </div>
      `;

      const exploreBtn = document.getElementById('drawerExploreBtn');
      if (exploreBtn) exploreBtn.addEventListener('click', cerrarDrawer);

      actualizarEnlaceWhatsApp();
      return;
    }

    let html = '';
    listaPedido.forEach(item => {

      if (item.esCombo) {
        // ── Tarjeta combo cerrado ──────────────────────────────────────────
        const cant = item.cantidad || 1;
        html += `
          <div class="order-item-card order-item-combo" data-order-item-id="${item.id}">
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex-1 min-w-0">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/15 text-secondary font-label-sm text-[10px] uppercase font-bold tracking-wider mb-1">
                  <span class="material-symbols-outlined text-xs">local_fire_department</span>
                  Combo Cerrado
                </span>
                <h4 class="font-headline-md text-base font-bold text-primary truncate">${item.nombre}</h4>
                <p class="font-body-sm text-xs text-on-surface-variant mt-0.5">${item.personas} personas · ${item.pesoEstimado} estimados</p>
              </div>
              <button type="button" data-action="eliminar-item" data-prod-id="${item.id}"
                aria-label="Eliminar ${item.nombre}"
                class="shrink-0 text-on-surface-variant hover:text-secondary p-1 rounded-md transition-colors" title="Eliminar">
                <span class="material-symbols-outlined text-xl">delete_outline</span>
              </button>
            </div>

            <!-- Stepper cantidad -->
            <div class="flex items-center gap-2 mt-2">
              <span class="font-label-sm text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">Cantidad:</span>
              <button type="button" class="qty-stepper-btn" data-action="drawer-combo-menos" data-prod-id="${item.id}" aria-label="Reducir">−</button>
              <span class="font-title-sm font-bold text-primary w-7 text-center tabular-nums" data-drawer-qty="${item.id}">${cant}</span>
              <button type="button" class="qty-stepper-btn" data-action="drawer-combo-mas" data-prod-id="${item.id}" aria-label="Aumentar">+</button>
              <span class="font-label-sm text-[11px] text-on-surface-variant ml-1">${cant === 1 ? 'combo' : 'combos'}</span>
            </div>

            <!-- Precio provisional -->
            <div class="mt-2">
              <span class="combo-provisional-badge text-[10px]">
                <span class="material-symbols-outlined text-xs">info</span>
                ${item.precioProvisionalTexto}
              </span>
            </div>
            <p class="font-body-sm text-[11px] text-on-surface-variant/70 mt-1.5 leading-relaxed">
              Los componentes de este combo no son modificables desde el pedido.
            </p>
          </div>`;

      } else {
        // ── Tarjeta producto individual ───────────────────────────────────
        html += `
          <div class="order-item-card" data-order-item-id="${item.id}">
            <div class="flex items-start justify-between gap-3 mb-2">
              <div>
                <span class="inline-block px-2 py-0.5 rounded bg-primary-container/10 text-primary font-label-sm text-[10px] uppercase font-bold tracking-wider mb-1">
                  ${item.categoria}
                </span>
                <h4 class="font-headline-md text-base font-bold text-primary">${item.nombre}</h4>
              </div>
              <button type="button"
                      data-action="eliminar-item"
                      data-prod-id="${item.id}"
                      aria-label="Eliminar ${item.nombre}"
                      class="text-on-surface-variant hover:text-secondary p-1 rounded-md transition-colors" title="Eliminar corte">
                <span class="material-symbols-outlined text-xl">delete_outline</span>
              </button>
            </div>

            <!-- Campo libre de cantidad o presentación -->
            <div class="mt-2">
              <label class="block font-label-sm text-[11px] uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
                Cantidad o presentación deseada:
              </label>
              <input type="text"
                     data-action="cambiar-indicacion"
                     data-prod-id="${item.id}"
                     class="order-item-input"
                     placeholder="Ej: 500g, 1 kg, 2 unidades o al gusto..."
                     value="${escapeHtml(item.indicacion || '')}">
            </div>

            <!-- Píldoras de sugerencias rápidas -->
            <div class="flex items-center gap-1.5 mt-2 flex-wrap">
              <span class="text-[10px] text-on-surface-variant/70 font-medium">Sugerencias:</span>
              <button type="button" data-action="sugerir-qty" data-prod-id="${item.id}" data-val="500 gramos" class="quick-qty-btn">500g</button>
              <button type="button" data-action="sugerir-qty" data-prod-id="${item.id}" data-val="1 kilo" class="quick-qty-btn">1 kg</button>
              <button type="button" data-action="sugerir-qty" data-prod-id="${item.id}" data-val="2 kilos" class="quick-qty-btn">2 kg</button>
              <button type="button" data-action="sugerir-qty" data-prod-id="${item.id}" data-val="Unidades" class="quick-qty-btn">Unidades</button>
              <button type="button" data-action="sugerir-qty" data-prod-id="${item.id}" data-val="Paquetes" class="quick-qty-btn">Paquetes</button>
            </div>
          </div>
        `;
      }
    });

    orderDrawerBody.innerHTML = html;

    // Escuchadores para los inputs de cantidad libre
    orderDrawerBody.querySelectorAll('input[data-action="cambiar-indicacion"]').forEach(input => {
      input.addEventListener('input', (e) => {
        const prodId = e.target.getAttribute('data-prod-id');
        actualizarIndicacionItem(prodId, e.target.value);
      });
    });

    // Escuchadores para botones de sugerencia rápida
    orderDrawerBody.querySelectorAll('button[data-action="sugerir-qty"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prodId = btn.getAttribute('data-prod-id');
        const valor = btn.getAttribute('data-val');
        const input = orderDrawerBody.querySelector(`input[data-action="cambiar-indicacion"][data-prod-id="${prodId}"]`);
        if (input) {
          input.value = valor;
          actualizarIndicacionItem(prodId, valor);
          input.focus();
        }
      });
    });

    // Escuchadores para eliminar corte/combo
    orderDrawerBody.querySelectorAll('button[data-action="eliminar-item"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prodId = btn.getAttribute('data-prod-id');
        eliminarDelPedido(prodId);
      });
    });

    // Escuchadores stepper cantidad combos en el drawer (−)
    orderDrawerBody.querySelectorAll('button[data-action="drawer-combo-menos"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-prod-id');
        const item = listaPedido.find(i => i.id === id);
        if (item) {
          item.cantidad = Math.max(1, (item.cantidad || 1) - 1);
          persistirPedido();
          renderizarDrawer();
        }
      });
    });

    // Escuchadores stepper cantidad combos en el drawer (+)
    orderDrawerBody.querySelectorAll('button[data-action="drawer-combo-mas"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-prod-id');
        const item = listaPedido.find(i => i.id === id);
        if (item) {
          item.cantidad = Math.min(10, (item.cantidad || 1) + 1);
          persistirPedido();
          renderizarDrawer();
        }
      });
    });

    actualizarEnlaceWhatsApp();
  }

  /**
   * Muestra notificación toast flotante
   */
  function mostrarToast(mensaje) {
    if (!orderToast || !orderToastMessage) return;
    if (toastTimeout) clearTimeout(toastTimeout);

    orderToastMessage.textContent = mensaje;
    orderToast.classList.add('show');

    toastTimeout = setTimeout(() => {
      orderToast.classList.remove('show');
    }, 3500);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ==========================================================================
     4. COMBOS Y KITS — CARGA, RENDERIZADO E INTEGRACIÓN CON PEDIDO
     ========================================================================== */

  /**
   * Carga data/combos.json y renderiza la sección Combos y Kits.
   * Se ejecuta independientemente de cargarDatos().
   */
  async function cargarCombos() {
    if (!combosContainer) return;

    try {
      const resp = await fetch(CONFIG.combosUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      combosData = (data.combos || []).filter(c => c.activo);

      // Inicializar estado selector por combo (segunda presentación o primera por defecto)
      combosData.forEach(combo => {
        if (!comboSeleccionadoActual[combo.id]) {
          comboSeleccionadoActual[combo.id] = {
            presentacionId: (combo.presentaciones[1] || combo.presentaciones[0]).id,
            cantidad: 1
          };
        }
      });

      renderizarCombos();
    } catch (err) {
      console.warn('Error al cargar combos.json:', err);
      if (combosContainer) {
        combosContainer.innerHTML = `
          <div class="p-8 text-center bg-surface-container rounded-2xl border border-surface-container max-w-lg mx-auto">
            <span class="material-symbols-outlined text-4xl text-secondary mb-3 block">info</span>
            <h3 class="font-headline-md text-lg font-bold text-primary mb-2">Combos no disponibles en este momento</h3>
            <p class="font-body-sm text-sm text-on-surface-variant mb-4 leading-relaxed">
              No se pudieron cargar los combos. Consúltanos directamente por WhatsApp y te contamos sobre nuestros paquetes parrilleros.
            </p>
            <a href="https://wa.me/${CONFIG.telefonoWhatsApp}?text=${encodeURIComponent('Hola La Fama, quisiera consultar sobre los Combos Parrilleros disponibles.')}"
               target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container text-on-primary font-title-sm text-sm font-semibold hover:bg-secondary transition-all shadow-sm">
              <span class="material-symbols-outlined text-lg">chat</span>
              <span>Consultar por WhatsApp</span>
            </a>
          </div>`;
      }
    }
  }

  /**
   * Renderiza las tarjetas de combos en #combosContainer.
   * Se llama al cargar y cada vez que cambia la selección o el pedido.
   */
  function renderizarCombos() {
    if (!combosContainer) return;
    if (combosData.length === 0) return;

    let html = '';

    combosData.forEach(combo => {
      const estado = comboSeleccionadoActual[combo.id] || {
        presentacionId: combo.presentaciones[0].id,
        cantidad: 1
      };
      const presActiva = combo.presentaciones.find(p => p.id === estado.presentacionId) || combo.presentaciones[0];
      const cantidad = estado.cantidad || 1;
      const itemId = `${combo.id}--${presActiva.id}`;
      const yaEnPedido = listaPedido.some(i => i.id === itemId);

      html += `
        <div class="combo-card" data-combo-id="${combo.id}">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-0">

            <!-- Imagen -->
            <div class="relative h-56 md:h-full overflow-hidden bg-surface-container">
              <img src="${combo.imagen}" alt="${combo.nombre}" class="w-full h-full object-cover" loading="lazy">
              <div class="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent"></div>
              <div class="absolute bottom-4 left-4">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-on-secondary font-label-sm text-xs font-bold uppercase tracking-wider shadow">
                  <span class="material-symbols-outlined text-sm">local_fire_department</span>
                  Combo Parrillero
                </span>
              </div>
            </div>

            <!-- Info y selector -->
            <div class="p-6 flex flex-col gap-4">
              <div>
                <h3 class="font-headline-md text-2xl font-bold text-primary">${combo.nombre}</h3>
                <p class="font-body-sm text-sm text-on-surface-variant mt-1 leading-relaxed">${combo.descripcion}</p>
              </div>

              <!-- Selector de presentación -->
              <div>
                <span class="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-semibold block mb-2">Elige el tamaño:</span>
                <div class="flex gap-2 flex-wrap">
                  ${combo.presentaciones.map(p => `
                    <button type="button"
                      class="combo-pres-pill ${p.id === presActiva.id ? 'active' : ''}"
                      data-action="seleccionar-pres"
                      data-combo-id="${combo.id}"
                      data-pres-id="${p.id}">
                      <span class="font-bold text-sm block">${p.nombre}</span>
                      <span class="text-[11px] block mt-0.5 ${p.id === presActiva.id ? 'text-on-secondary' : 'text-on-surface-variant'}">${p.personas} pers. · ${p.pesoEstimado}</span>
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Composición base -->
              <div class="bg-surface-container rounded-xl p-3">
                <span class="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold block mb-1.5">Composición base (provisional):</span>
                <ul class="space-y-1">
                  ${presActiva.composicion.map(c => `
                    <li class="font-body-sm text-xs text-on-surface-variant flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-secondary/60 shrink-0"></span>
                      ${c.corte}: <strong class="ml-0.5">${c.cantidad}</strong>
                    </li>
                  `).join('')}
                </ul>
              </div>

              <!-- Precio provisional -->
              <div>
                <span class="combo-provisional-badge">
                  <span class="material-symbols-outlined text-sm">info</span>
                  ${presActiva.precioProvisionalTexto}
                </span>
              </div>

              <!-- Selector cantidad + botón agregar -->
              <div class="flex items-center gap-3 mt-auto pt-2">
                <div class="flex items-center gap-2 shrink-0">
                  <button type="button" class="qty-stepper-btn" data-action="combo-qty-menos" data-combo-id="${combo.id}" aria-label="Reducir cantidad">−</button>
                  <span class="font-title-sm font-bold text-primary w-8 text-center tabular-nums" data-combo-qty="${combo.id}">${cantidad}</span>
                  <button type="button" class="qty-stepper-btn" data-action="combo-qty-mas" data-combo-id="${combo.id}" aria-label="Aumentar cantidad">+</button>
                </div>
                <button type="button"
                  class="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-title-sm text-sm font-semibold transition-all duration-200 shadow-sm
                    ${yaEnPedido ? 'bg-secondary text-on-secondary hover:bg-primary-container' : 'bg-primary-container text-on-primary hover:bg-secondary'}"
                  data-action="agregar-combo"
                  data-combo-id="${combo.id}">
                  <span class="material-symbols-outlined text-lg leading-none">${yaEnPedido ? 'check_circle' : 'add_shopping_cart'}</span>
                  <span>${yaEnPedido ? 'En tu pedido (editar)' : 'Agregar al pedido'}</span>
                </button>
              </div>

              <span class="font-label-sm text-[11px] text-on-surface-variant text-center leading-relaxed">${combo.notaComercial}</span>
            </div>
          </div>
        </div>`;
    });

    combosContainer.innerHTML = html;

    // --- Listeners: selector de presentación ---
    combosContainer.querySelectorAll('button[data-action="seleccionar-pres"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const comboId = btn.getAttribute('data-combo-id');
        const presId = btn.getAttribute('data-pres-id');
        if (!comboSeleccionadoActual[comboId]) {
          comboSeleccionadoActual[comboId] = { presentacionId: presId, cantidad: 1 };
        } else {
          comboSeleccionadoActual[comboId].presentacionId = presId;
        }
        renderizarCombos();
      });
    });

    // --- Listeners: stepper cantidad (−) ---
    combosContainer.querySelectorAll('button[data-action="combo-qty-menos"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const comboId = btn.getAttribute('data-combo-id');
        if (!comboSeleccionadoActual[comboId]) {
          comboSeleccionadoActual[comboId] = { presentacionId: null, cantidad: 1 };
        }
        const actual = comboSeleccionadoActual[comboId].cantidad || 1;
        comboSeleccionadoActual[comboId].cantidad = Math.max(1, actual - 1);
        const display = combosContainer.querySelector(`[data-combo-qty="${comboId}"]`);
        if (display) display.textContent = comboSeleccionadoActual[comboId].cantidad;
      });
    });

    // --- Listeners: stepper cantidad (+) ---
    combosContainer.querySelectorAll('button[data-action="combo-qty-mas"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const comboId = btn.getAttribute('data-combo-id');
        if (!comboSeleccionadoActual[comboId]) {
          comboSeleccionadoActual[comboId] = { presentacionId: null, cantidad: 1 };
        }
        const actual = comboSeleccionadoActual[comboId].cantidad || 1;
        comboSeleccionadoActual[comboId].cantidad = Math.min(10, actual + 1);
        const display = combosContainer.querySelector(`[data-combo-qty="${comboId}"]`);
        if (display) display.textContent = comboSeleccionadoActual[comboId].cantidad;
      });
    });

    // --- Listeners: agregar combo al pedido ---
    combosContainer.querySelectorAll('button[data-action="agregar-combo"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const comboId = btn.getAttribute('data-combo-id');
        agregarComboAlPedido(comboId);
      });
    });
  }

  /**
   * Agrega o actualiza un combo cerrado en la lista de pedido.
   */
  function agregarComboAlPedido(comboId) {
    const combo = combosData.find(c => c.id === comboId);
    if (!combo) return;

    const estado = comboSeleccionadoActual[comboId] || {
      presentacionId: combo.presentaciones[0].id,
      cantidad: 1
    };
    const pres = combo.presentaciones.find(p => p.id === estado.presentacionId) || combo.presentaciones[0];
    const cantidad = estado.cantidad || 1;
    const itemId = `${combo.id}--${pres.id}`;
    const composicionTexto = pres.composicion.map(c => `${c.corte} (${c.cantidad})`).join(', ');

    const idxExistente = listaPedido.findIndex(i => i.id === itemId);

    if (idxExistente !== -1) {
      // Ya estaba: actualizar cantidad y abrir drawer para editar
      listaPedido[idxExistente].cantidad = cantidad;
      persistirPedido();
      renderizarCombos();
      abrirDrawer();
      return;
    }

    // Nuevo combo: añadir al pedido
    listaPedido.push({
      id: itemId,
      nombre: `${combo.nombre} \u2013 ${pres.nombre}`,
      categoria: combo.categoria,
      esCombo: true,
      cantidad: cantidad,
      personas: pres.personas,
      pesoEstimado: pres.pesoEstimado,
      composicionTexto: composicionTexto,
      precioProvisionalTexto: pres.precioProvisionalTexto
    });

    persistirPedido();
    renderizarCombos();
    mostrarToast(`\u00a1\u00abCombo ${pres.nombre}\u00bb agregado a tu pedido!`);
  }

  /* ==========================================================================
     5. CARGA Y FILTRADO DEL CATÁLOGO
     ========================================================================== */

  /**
   * Carga los datos del catálogo desde productos.json
   */
  async function cargarDatos() {
    inicializarPedidoStorage();

    try {
      const respuesta = await fetch(CONFIG.datosUrl);
      if (!respuesta.ok) {
        throw new Error(`Error HTTP: ${respuesta.status}`);
      }
      const data = await respuesta.json();
      configDatos = data.config || {};
      categorias = data.categorias || [];

      // Filtrar productos: activos y exclusión de ejemplos si aplica
      const excluirEjemplos = configDatos.excluirEjemplos === true;
      productos = (data.productos || []).filter(item => {
        if (!item.activo) return false;
        if (excluirEjemplos && item.esEjemplo) return false;
        return true;
      });

      inicializarFiltrosCategorias();
      procesarParametroUrl();
      filtrarYRenderizar();
    } catch (error) {
      console.warn('No se pudo cargar productos.json vía fetch:', error);
      mostrarErrorCarga();
    }
  }

  /**
   * Muestra mensaje en caso de error de carga
   */
  function mostrarErrorCarga() {
    if (productGrid) {
      productGrid.innerHTML = `
        <div class="col-span-full p-8 text-center bg-surface-container rounded-2xl border border-surface-container">
          <span class="material-symbols-outlined text-4xl text-secondary mb-2">info</span>
          <h3 class="font-headline-md text-xl font-bold text-primary mb-2">Consulta de Catálogo Directa</h3>
          <p class="font-body-md text-sm text-on-surface-variant max-w-md mx-auto mb-4">
            Comunícate directamente con nuestro maestro carnicero para conocer los cortes y piezas disponibles del día.
          </p>
          <a href="https://wa.me/${CONFIG.telefonoWhatsApp}?text=${encodeURIComponent('Hola La Fama, quisiera consultar los cortes disponibles en el catálogo.')}" 
             target="_blank" rel="noopener noreferrer" 
             class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-container text-on-primary font-title-sm text-sm font-semibold hover:bg-secondary transition-all">
            <span class="material-symbols-outlined text-lg">chat</span>
            <span>Consultar por WhatsApp</span>
          </a>
        </div>
      `;
    }
  }

  /**
   * Genera los botones de las 6 categorías oficiales
   */
  function inicializarFiltrosCategorias() {
    if (!categoryFiltersContainer) return;

    // Calcular productos activos por categoría
    const conteoPorCat = {};
    productos.forEach(p => {
      conteoPorCat[p.categoria] = (conteoPorCat[p.categoria] || 0) + 1;
    });

    // Botón "Todos los productos"
    let html = `
      <button class="cat-pill filter-pill flex items-center gap-2 px-4 py-2.5 rounded-lg font-title-sm text-sm transition-all whitespace-nowrap ${categoriaActual === 'all' ? 'active bg-primary-container text-on-primary' : 'bg-surface-container text-on-surface'}" 
              data-cat="all">
        <span class="material-symbols-outlined text-lg leading-none">restaurant_menu</span>
        <span>Todos los productos</span>
        <span class="ml-1 px-2 py-0.5 rounded-full bg-surface-container-highest/30 font-label-sm text-xs font-semibold">${productos.length}</span>
      </button>
    `;

    // Botones para las 6 categorías oficiales
    categorias.forEach(cat => {
      const cantidad = conteoPorCat[cat.id] || 0;
      const isActive = categoriaActual === cat.id;
      html += `
        <button class="cat-pill filter-pill flex items-center gap-2 px-4 py-2.5 rounded-lg font-title-sm text-sm transition-all whitespace-nowrap ${isActive ? 'active bg-primary-container text-on-primary' : 'bg-surface-container text-on-surface'}" 
                data-cat="${cat.id}">
          <span class="material-symbols-outlined text-lg leading-none">${cat.icono || 'dinner_dining'}</span>
          <span>${cat.nombre}</span>
          <span class="ml-1 px-2 py-0.5 rounded-full bg-surface-container-highest/30 font-label-sm text-xs font-semibold">${cantidad}</span>
        </button>
      `;
    });

    categoryFiltersContainer.innerHTML = html;

    // Event listeners en botones de categoría
    categoryFiltersContainer.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        categoriaActual = btn.getAttribute('data-cat') || 'all';
        actualizarEstadoVisualPills();
        filtrarYRenderizar();
      });
    });
  }

  /**
   * Actualiza el estilo activo de los botones de categoría
   */
  function actualizarEstadoVisualPills() {
    if (!categoryFiltersContainer) return;
    categoryFiltersContainer.querySelectorAll('.cat-pill').forEach(btn => {
      const cat = btn.getAttribute('data-cat');
      if (cat === categoriaActual) {
        btn.classList.add('active', 'bg-primary-container', 'text-on-primary');
        btn.classList.remove('bg-surface-container', 'text-on-surface');
      } else {
        btn.classList.remove('active', 'bg-primary-container', 'text-on-primary');
        btn.classList.add('bg-surface-container', 'text-on-surface');
      }
    });
  }

  /**
   * Detecta si hay un parámetro ?cat= en la URL
   */
  function procesarParametroUrl() {
    const params = new URLSearchParams(window.location.search);
    const catParam = params.get('cat');
    if (catParam && (catParam === 'all' || categorias.some(c => c.id === catParam))) {
      categoriaActual = catParam;
      actualizarEstadoVisualPills();
    }
  }

  /**
   * Obtiene la lista de productos filtrados actualmente
   */
  function obtenerProductosFiltrados() {
    const query = terminoBusqueda.toLowerCase().trim();

    return productos.filter(item => {
      const coincideCat = (categoriaActual === 'all') || (item.categoria === categoriaActual);
      let coincideBusqueda = true;
      if (query) {
        const textoCompleto = `${item.nombre} ${item.categoriaLabel || ''} ${item.descripcion || ''} ${item.presentacion || ''}`.toLowerCase();
        coincideBusqueda = textoCompleto.includes(query);
      }
      return coincideCat && coincideBusqueda;
    });
  }

  /**
   * Filtra los productos según categoría y texto de búsqueda
   */
  function filtrarYRenderizar() {
    const filtrados = obtenerProductosFiltrados();
    actualizarMetadatos(filtrados.length);
    renderizarProductos(filtrados);
  }

  /**
   * Actualiza el contador dinámico y el título de la categoría
   */
  function actualizarMetadatos(cantidadVisible) {
    if (totalCounter) {
      totalCounter.textContent = `${cantidadVisible} ${cantidadVisible === 1 ? 'corte disponible' : 'cortes disponibles'}`;
    }

    if (activeCategoryTitle) {
      if (categoriaActual === 'all') {
        activeCategoryTitle.textContent = 'Todos los Cortes & Especialidades';
      } else {
        const catObj = categorias.find(c => c.id === categoriaActual);
        activeCategoryTitle.textContent = catObj ? catObj.nombre : 'Cortes Seleccionados';
      }
    }
  }

  /**
   * Renderiza las tarjetas del catálogo con el botón «Agregar al pedido»
   */
  function renderizarProductos(items) {
    if (!productGrid) return;

    if (items.length === 0) {
      productGrid.innerHTML = '';
      if (noResultsState) noResultsState.classList.remove('hidden');
      return;
    }

    if (noResultsState) noResultsState.classList.add('hidden');

    let html = '';
    items.forEach(prod => {
      const tieneFoto = prod.imagen && prod.imagen.trim() !== '';
      const enPedido = estaEnPedido(prod.id);

      html += `
        <article class="product-card group flex flex-col justify-between bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-surface-container">
          <div>
            ${tieneFoto ? `
              <div class="relative h-52 w-full overflow-hidden bg-surface-container">
                <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                     src="${prod.imagen}" 
                     alt="${prod.nombre}"
                     loading="lazy">
                <div class="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                  <span class="px-2.5 py-1 rounded bg-primary-container text-on-primary font-label-sm text-xs uppercase tracking-wider font-semibold shadow">
                    ${prod.categoriaLabel || prod.categoria}
                  </span>
                  ${prod.destacado ? `
                    <span class="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-xs font-semibold">
                      Destacado
                    </span>
                  ` : ''}
                </div>
              </div>
            ` : `
              <div class="relative h-32 w-full bg-surface-container-low flex flex-col items-center justify-center p-4 border-b border-surface-container">
                <span class="material-symbols-outlined text-4xl text-secondary/60 mb-1">kebab_dining</span>
                <span class="px-2.5 py-1 rounded bg-primary-container text-on-primary font-label-sm text-xs uppercase tracking-wider font-semibold">
                  ${prod.categoriaLabel || prod.categoria}
                </span>
              </div>
            `}

            <div class="p-5 flex flex-col gap-2.5">
              <h3 class="font-headline-md text-xl font-bold text-primary group-hover:text-secondary transition-colors">
                ${prod.nombre}
              </h3>
              
              <div class="flex items-center gap-2 text-on-surface-variant bg-surface-container/60 py-1 px-2.5 rounded-lg w-fit">
                <span class="material-symbols-outlined text-secondary text-base">tune</span>
                <span class="font-label-sm text-xs">Presentación: <strong>${prod.presentacion || 'Por confirmar'}</strong></span>
              </div>

              ${prod.descripcion ? `
                <p class="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed line-clamp-2 mt-1">
                  ${prod.descripcion}
                </p>
              ` : ''}
            </div>
          </div>

          <div class="p-5 pt-0">
            <!-- Botón de Agregar / Editar en la Lista de Pedido -->
            <button type="button" 
                    data-action="toggle-pedido"
                    data-prod-id="${prod.id}"
                    class="btn-agregar-pedido w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-title-sm text-sm font-semibold transition-all duration-200 shadow-sm ${enPedido ? 'bg-secondary text-on-secondary hover:bg-primary-container' : 'bg-primary-container text-on-primary hover:bg-secondary'}">
              <span class="material-symbols-outlined text-lg leading-none">${enPedido ? 'check_circle' : 'add_circle'}</span>
              <span>${enPedido ? 'En tu lista de pedido (editar)' : 'Agregar al pedido'}</span>
            </button>
            <span class="block text-center font-label-sm text-[11px] text-on-surface-variant mt-2">
              Indica tu cantidad o porción en la lista
            </span>
          </div>
        </article>
      `;
    });

    productGrid.innerHTML = html;

    // Escuchadores para botones de agregar al pedido
    productGrid.querySelectorAll('button[data-action="toggle-pedido"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prodId = btn.getAttribute('data-prod-id');
        agregarOEditarEnPedido(prodId);
      });
    });
  }

  /* ==========================================================================
     5. ASIGNACIÓN DE EVENTOS GLOBALES
     ========================================================================== */

  // Buscador de texto
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      terminoBusqueda = e.target.value;
      if (clearSearchBtn) {
        if (terminoBusqueda.length > 0) {
          clearSearchBtn.classList.remove('hidden');
        } else {
          clearSearchBtn.classList.add('hidden');
        }
      }
      filtrarYRenderizar();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      terminoBusqueda = '';
      clearSearchBtn.classList.add('hidden');
      filtrarYRenderizar();
    });
  }

  // Restablecer filtros
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      categoriaActual = 'all';
      terminoBusqueda = '';
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
      actualizarEstadoVisualPills();
      filtrarYRenderizar();
    });
  }

  // Apertura y Cierre del Drawer
  if (floatingOrderBtn) floatingOrderBtn.addEventListener('click', abrirDrawer);
  if (headerOrderBtn) headerOrderBtn.addEventListener('click', abrirDrawer);
  if (mobileOpenOrderBtn) mobileOpenOrderBtn.addEventListener('click', () => {
    // Cerrar menú móvil si está abierto
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) mobileMenu.classList.add('hidden');
    abrirDrawer();
  });
  if (bannerOpenOrderBtn) bannerOpenOrderBtn.addEventListener('click', abrirDrawer);
  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', cerrarDrawer);
  if (orderOverlay) orderOverlay.addEventListener('click', cerrarDrawer);
  if (toastOpenBtn) toastOpenBtn.addEventListener('click', abrirDrawer);
  if (clearOrderBtn) clearOrderBtn.addEventListener('click', vaciarListaPedido);

  // Cerrar Drawer con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && orderDrawer && orderDrawer.classList.contains('open')) {
      cerrarDrawer();
    }
  });

  // Inicializar al cargar el DOM
  document.addEventListener('DOMContentLoaded', () => {
    cargarDatos();
    cargarCombos();
  });
})();
