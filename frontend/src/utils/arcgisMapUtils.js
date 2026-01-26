/**
 * Shared ArcGIS map utilities for SiteDetailMap and CreateProjectMap.
 * Uses AMD (window.require) for esri modules.
 */

const NYC_EXTENT = { xmin: -74.256, ymin: 40.496, xmax: -73.700, ymax: 40.916, wkid: 4326 };

/**
 * Create a MapView with NYC extent. Retries until container and window.require are ready.
 * @param {HTMLElement | null} containerEl
 * @param {object} [opts] - reserved for future options
 * @returns {Promise<{ view: import('esri/views/MapView').default, destroy: () => void }>}
 */
export function createMapView(containerEl, opts = {}) {
  return new Promise((resolve, reject) => {
    let retries = 0;

    const tryInit = () => {
      retries++;
      if (!containerEl || !window.require) {
        if (retries < 30) setTimeout(tryInit, 100);
        else reject(new Error('ArcGIS: container or require not ready'));
        return;
      }

      window.require(
        ['esri/Map', 'esri/views/MapView', 'esri/geometry/Extent'],
        (Map, MapView, Extent) => {
          if (!containerEl) {
            reject(new Error('ArcGIS: container unmounted'));
            return;
          }
          try {
            const map = new Map({ basemap: 'arcgis-streets' });
            const extent = new Extent({
              xmin: NYC_EXTENT.xmin,
              ymin: NYC_EXTENT.ymin,
              xmax: NYC_EXTENT.xmax,
              ymax: NYC_EXTENT.ymax,
              spatialReference: { wkid: NYC_EXTENT.wkid }
            });
            const view = new MapView({ container: containerEl, map, extent });

            const destroy = () => {
              try {
                view.destroy();
              } catch (e) {
                console.warn('createMapView destroy:', e);
              }
            };

            resolve({ view, destroy });
          } catch (e) {
            reject(e);
          }
        },
        (err) => {
          if (retries < 30) setTimeout(tryInit, 100);
          else reject(err || new Error('ArcGIS modules failed to load'));
        }
      );
    };

    tryInit();
  });
}

/**
 * Compute centroid from GeoJSON-like geometry.
 * @param {object} geomData - { type, coordinates }
 * @returns {{ x: number, y: number } | null}
 */
export function getCentroid(geomData) {
  try {
    if (geomData.type === 'Point') {
      return { x: geomData.coordinates[0], y: geomData.coordinates[1] };
    }
    if (geomData.type === 'LineString') {
      const mid = Math.floor(geomData.coordinates.length / 2);
      return { x: geomData.coordinates[mid][0], y: geomData.coordinates[mid][1] };
    }
    if (geomData.type === 'Polygon') {
      const ring = geomData.coordinates[0] || [];
      let x = 0, y = 0;
      ring.forEach(coord => { x += coord[0]; y += coord[1]; });
      return ring.length ? { x: x / ring.length, y: y / ring.length } : null;
    }
    if (geomData.type === 'MultiPolygon') {
      let x = 0, y = 0, count = 0;
      geomData.coordinates.forEach(poly => {
        const ring = poly[0] || [];
        ring.forEach(coord => { x += coord[0]; y += coord[1]; count++; });
      });
      return count > 0 ? { x: x / count, y: y / count } : null;
    }
    return null;
  } catch (e) {
    return null;
  }
}

const FILL_SYMBOL = { type: 'simple-fill', color: [226, 119, 40, 0.6], outline: { color: [226, 119, 40], width: 3 } };
const LINE_SYMBOL = { type: 'simple-line', color: [226, 119, 40], width: 4 };
const POINT_SYMBOL = { type: 'simple-marker', color: [226, 119, 40], size: 16, outline: { color: [255, 255, 255], width: 3 } };
const PIN_SYMBOL = { type: 'simple-marker', style: 'circle', color: [0, 113, 188], size: 18, outline: { color: [255, 255, 255], width: 3 } };

/**
 * Draw site geometries on the map. Uses window.require for Graphic, Polygon, Polyline, Point.
 * @param {import('esri/views/MapView').default} view
 * @param {object[]} siteGeoms - each: geometry | shape | geom | the_geom (GeoJSON or string)
 * @param {{ fitBounds?: boolean }} [opts] - fitBounds: default true
 * @returns {Promise<void>}
 */
export function drawSiteGeometries(view, siteGeoms, opts = {}) {
  const { fitBounds = true } = opts;

  if (!view || !siteGeoms || siteGeoms.length === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (!window.require) {
      resolve();
      return;
    }
    window.require(
      ['esri/Graphic', 'esri/geometry/Polygon', 'esri/geometry/Polyline', 'esri/geometry/Point'],
      (Graphic, Polygon, Polyline, Point) => {
        try {
          view.graphics.removeAll();
          let bounds = null;

          const addGraphic = (geometry, symbol) => {
            if (geometry && symbol) {
              view.graphics.add(new Graphic({ geometry, symbol }));
              if (geometry.extent) bounds = bounds ? bounds.union(geometry.extent) : geometry.extent;
            }
          };

          (siteGeoms || []).forEach((row) => {
            try {
              let geomData = row.geometry ?? row.shape ?? row.geom ?? row.the_geom;
              if (typeof geomData === 'string') geomData = JSON.parse(geomData);
              if (!geomData || !geomData.type) return;

              const spatialRef = (geomData.crs?.properties?.name === 'EPSG:2263') ? { wkid: 2263 } : { wkid: 4326 };

              if (geomData.type === 'MultiPolygon') {
                geomData.coordinates.forEach((poly) => {
                  const ring = poly[0];
                  if (ring && ring.length) {
                    const geometry = new Polygon({ rings: [ring], spatialReference: spatialRef });
                    addGraphic(geometry, FILL_SYMBOL);
                  }
                });
              } else if (geomData.type === 'Polygon') {
                const geometry = new Polygon({ rings: geomData.coordinates, spatialReference: spatialRef });
                addGraphic(geometry, FILL_SYMBOL);
              } else if (geomData.type === 'LineString') {
                const geometry = new Polyline({ paths: [geomData.coordinates], spatialReference: spatialRef });
                addGraphic(geometry, LINE_SYMBOL);
              } else if (geomData.type === 'Point') {
                const geometry = new Point({ x: geomData.coordinates[0], y: geomData.coordinates[1], spatialReference: spatialRef });
                addGraphic(geometry, POINT_SYMBOL);
              }

              const centroid = getCentroid(geomData);
              if (centroid) {
                const pinGeometry = new Point({ x: centroid.x, y: centroid.y, spatialReference: spatialRef });
                view.graphics.add(new Graphic({ geometry: pinGeometry, symbol: PIN_SYMBOL }));
                if (pinGeometry.extent) bounds = bounds ? bounds.union(pinGeometry.extent) : pinGeometry.extent;
              }
            } catch (e) { /* skip invalid geometry */ }
          });

          if (fitBounds && bounds && siteGeoms.length > 0) {
            view.goTo({ target: bounds, padding: { top: 50, left: 50, right: 50, bottom: 50 } });
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      reject
    );
  });
}
