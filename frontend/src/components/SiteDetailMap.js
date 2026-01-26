import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { createMapView, drawSiteGeometries } from '../utils/arcgisMapUtils';

/**
 * Map component for SiteDetail. Shows site geometry from /api/sites/:id/geometry.
 * Reuses .site-detail-map-wrap, .site-detail-map-label, .site-detail-map from SiteDetail.css.
 */
export default function SiteDetailMap({ site }) {
  const mapRef = useRef();

  useEffect(() => {
    if (!site) return;

    let destroy = null;

    createMapView(mapRef.current)
      .then(({ view, destroy: d }) => {
        destroy = d;

        const siteId = site.hub_site_id || site.id;
        return axios.get(`/api/sites/${siteId}/geometry`).then((res) => {
          const data = res.data?.data || [];
          return drawSiteGeometries(view, data, { fitBounds: true });
        });
      })
      .catch((err) => console.warn('SiteDetailMap init:', err));

    return () => {
      if (destroy) destroy();
    };
  }, [site]);

  return (
    <div className="site-detail-map-wrap">
      <span className="site-detail-map-label">Location</span>
      <div ref={mapRef} className="site-detail-map" />
    </div>
  );
}
