import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { createMapView, drawSiteGeometries } from '../utils/arcgisMapUtils';

const PROJECT_MARKER_SYMBOL = { type: 'simple-marker', color: [226, 119, 40], size: 12 };

/**
 * Map for Create/Edit Project: click to set location, project marker, or site geometries when siteIds provided.
 * When siteIds.length > 0, site geometries replace the project marker.
 */
export default function CreateProjectMap({
  siteIds = [],
  latitude,
  longitude,
  onPositionChange,
  height = 360,
  className
}) {
  const mapRef = useRef();
  const viewRef = useRef();
  const [mapReady, setMapReady] = useState(false);

  // Init map, click handler, cleanup
  useEffect(() => {
    let destroy = null;

    createMapView(mapRef.current)
      .then(({ view, destroy: d }) => {
        destroy = d;
        viewRef.current = view;
        view.on('click', (e) => {
          const p = view.toMap({ x: e.x, y: e.y });
          if (onPositionChange) onPositionChange({ lat: p.latitude, lng: p.longitude });
        });
        return view.when(() => setMapReady(true));
      })
      .catch((err) => console.warn('CreateProjectMap init:', err));

    return () => {
      if (destroy) destroy();
      viewRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Project marker when lat/lng set and no site geometries
  useEffect(() => {
    if (!mapReady || !viewRef.current || siteIds.length > 0) return;
    const lat = latitude != null ? Number(latitude) : null;
    const lng = longitude != null ? Number(longitude) : null;
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

    if (!window.require) return;
    window.require(['esri/Graphic'], (Graphic) => {
      if (!viewRef.current) return;
      const point = { type: 'point', longitude: lng, latitude: lat };
      viewRef.current.graphics.removeAll();
      viewRef.current.graphics.add(new Graphic({ geometry: point, symbol: PROJECT_MARKER_SYMBOL }));
      viewRef.current.center = point;
    });
  }, [latitude, longitude, mapReady, siteIds.length]);

  // Site geometries when siteIds provided
  useEffect(() => {
    if (siteIds.length === 0 || !mapReady || !viewRef.current) return;

    (async () => {
      try {
        const res = await axios.post('/api/sites/geometries', { siteIds });
        const data = res.data?.data || [];
        await drawSiteGeometries(viewRef.current, data, { fitBounds: true });
      } catch (err) {
        console.error('CreateProjectMap site geometries:', err);
      }
    })();
  }, [siteIds, mapReady]);

  return (
    <div
      ref={mapRef}
      className={className}
      style={{ height, minHeight: height, width: '100%', borderRadius: '4px', background: 'var(--bg-secondary)' }}
    />
  );
}
