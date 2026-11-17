# Administración de Datos del Catálogo - La Fama Carnes

Este directorio contiene las fuentes de datos del sitio web comercial de La Fama Carnes.

## Archivos

- **`productos.json`**: Base de datos del catálogo. Contiene la configuración global, las 6 categorías oficiales y el listado de productos.
- **`sedes.json`**: Configuración técnica interna de sedes. Actualmente la sede activa y publicada es **Sopó**. Está preparada para habilitar sedes adicionales en el futuro (ej. Mesitas del Colegio) sin alterar la arquitectura.

---

## Cómo excluir o activar los productos de demostración

Todos los registros iniciales tienen el atributo `"esEjemplo": true`.

Para **excluir automáticamente todos los productos de demostración** antes de publicar el inventario real:

1. Abra `data/productos.json`.
2. En la sección `"config"`, cambie:
   ```json
   "excluirEjemplos": true
   ```
3. Guarde el archivo. El catálogo filtrará instantáneamente los productos de demostración sin necesidad de eliminarlos manualmente.

---

## Cómo incorporar los productos reales

Para agregar un producto confirmado:

```json
{
  "id": "res-corte-real-01",
  "nombre": "Nombre Oficial del Corte",
  "categoria": "res",
  "categoriaLabel": "Res",
  "presentacion": "Presentación confirmada (ej: Porción 500g o pieza entera)",
  "descripcion": "Descripción breve y honesta del corte.",
  "imagen": "assets/images/cortes/archivo.jpg",
  "destacado": false,
  "activo": true,
  "esEjemplo": false
}
```

- Si el producto no tiene fotografía, configure `"imagen": null`. El catálogo se adaptará visualmente de forma automática.
- Para despublicar temporalmente un producto sin borrarlo, cambie `"activo": false`.
- El contador de productos y los filtros por categoría se recalculan de forma automática.

