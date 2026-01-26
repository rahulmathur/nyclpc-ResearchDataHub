import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * Clustered map for ProjectDetail - displays site clusters for better performance
 * Uses the /api/projects/:projectId/sites/clustered endpoint
 */
export default function ProjectDetailMap({ projectId, onClusterClick }) {
  const mapRef = useRef(null);
  const viewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ totalSites: 0, clusterCount: 0 });

  useEffect(() => {
    if (!projectId || !mapRef.current) return;

    let destroyed = false;

    const initMap = async () => {
      // Wait for ArcGIS to be available
      if (!window.require) {
        setError('ArcGIS API not loaded');
        setLoading(false);
        return;
      }

      window.require([
        'esri/Map',
        'esri/views/MapView',
        'esri/layers/GraphicsLayer',
        'esri/Graphic',
        'esri/geometry/Point',
        'esri/symbols/SimpleMarkerSymbol',
        'esri/symbols/TextSymbol',
        'esri/PopupTemplate'
      ], async (Map, MapView, GraphicsLayer, Graphic, Point, SimpleMarkerSymbol, TextSymbol, PopupTemplate) => {
        if (destroyed) return;

        try {
          // Fetch clustered data (may take time for large datasets)
          // Use larger grid size (1000ft) for faster initial load with fewer clusters
          const res = await axios.get(`/api/projects/${projectId}/sites/clustered?gridSize=1000`, {
            timeout: 120000 // 2 minute timeout for large projects
          });
          if (destroyed) return;

          const { clusters, totalSites, clusterCount, bounds } = res.data.data;
          setStats({ totalSites, clusterCount });

          // Create map
          const map = new Map({ basemap: 'streets-navigation-vector' });

          // Create view
          const view = new MapView({
            container: mapRef.current,
            map: map,
            zoom: 10,
            center: [-73.95, 40.7] // NYC default
          });

          viewRef.current = view;

          // Create graphics layer for clusters
          const clusterLayer = new GraphicsLayer();
          map.add(clusterLayer);

          console.log(`[ProjectDetailMap] Rendering ${clusters.length} clusters for ${totalSites} sites`);

          // Calculate size scale based on counts (ensure counts are numbers)
          const maxCount = Math.max(...clusters.map(c => parseInt(c.count) || 0), 1);
          const minSize = 20;
          const maxSize = 60;

          // Add cluster markers
          clusters.forEach(cluster => {
            if (!cluster.geometry || !cluster.geometry.coordinates) return;

            const [lng, lat] = cluster.geometry.coordinates;
            const count = parseInt(cluster.count);
            
            // Scale marker size based on count
            const size = minSize + ((count / maxCount) * (maxSize - minSize));
            
            // Color based on count (blue to red gradient)
            const intensity = Math.min(count / (maxCount * 0.5), 1);
            const r = Math.round(50 + intensity * 205);
            const g = Math.round(130 - intensity * 80);
            const b = Math.round(200 - intensity * 150);

            const point = new Point({ longitude: lng, latitude: lat });

            // Circle marker
            const markerSymbol = new SimpleMarkerSymbol({
              style: 'circle',
              color: [r, g, b, 0.7],
              size: size,
              outline: { color: [255, 255, 255, 0.9], width: 2 }
            });

            const graphic = new Graphic({
              geometry: point,
              symbol: markerSymbol,
              attributes: {
                count: count,
                sampleSiteIds: cluster.sampleSiteIds
              },
              popupTemplate: new PopupTemplate({
                title: `${count.toLocaleString()} Sites`,
                content: `Sample IDs: ${(cluster.sampleSiteIds || []).slice(0, 5).join(', ')}${cluster.sampleSiteIds?.length > 5 ? '...' : ''}`
              })
            });

            clusterLayer.add(graphic);

            // Add count label for larger clusters
            if (count >= 10 && size >= 25) {
              const textSymbol = new TextSymbol({
                text: count >= 1000 ? `${(count/1000).toFixed(1)}k` : count.toString(),
                color: 'white',
                font: { size: Math.max(9, size / 4), weight: 'bold' },
                haloColor: [0, 0, 0, 0.5],
                haloSize: 1
              });

              const labelGraphic = new Graphic({
                geometry: point,
                symbol: textSymbol
              });
              clusterLayer.add(labelGraphic);
            }
          });

          // Zoom to bounds if available
          if (bounds && bounds.coordinates) {
            try {
              const coords = bounds.coordinates[0];
              const xMin = Math.min(...coords.map(c => c[0]));
              const xMax = Math.max(...coords.map(c => c[0]));
              const yMin = Math.min(...coords.map(c => c[1]));
              const yMax = Math.max(...coords.map(c => c[1]));
              
              view.goTo({
                target: {
                  type: 'extent',
                  xmin: xMin,
                  ymin: yMin,
                  xmax: xMax,
                  ymax: yMax,
                  spatialReference: { wkid: 4326 }
                }
              }, { duration: 1000 });
            } catch (e) {
              console.warn('Could not zoom to bounds:', e);
            }
          }

          // Handle cluster click
          if (onClusterClick) {
            view.on('click', (event) => {
              view.hitTest(event).then((response) => {
                const hit = response.results.find(r => r.graphic && r.graphic.attributes?.sampleSiteIds);
                if (hit) {
                  onClusterClick(hit.graphic.attributes);
                }
              });
            });
          }

          setLoading(false);

        } catch (err) {
          if (!destroyed) {
            console.error('ProjectDetailMap error:', err);
            setError(err.message);
            setLoading(false);
          }
        }
      });
    };

    initMap();

    return () => {
      destroyed = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [projectId, onClusterClick]);

  return (
    <div className="project-detail-map-container" style={{ position: 'relative' }}>
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '400px', 
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#1a1a2e'
        }} 
      />
      {loading && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          color: '#888',
          fontSize: '14px',
          textAlign: 'center'
        }}>
          <div>Loading clustered map...</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>This may take a minute for large projects</div>
        </div>
      )}
      {error && (
        <div style={{ color: '#ff6b6b', padding: '8px', fontSize: '12px' }}>
          Map error: {error}
        </div>
      )}
      {!loading && !error && (
        <div style={{ 
          padding: '8px 0', 
          fontSize: '12px', 
          color: '#888',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>{stats.totalSites.toLocaleString()} sites in {stats.clusterCount.toLocaleString()} clusters</span>
          <span style={{ fontSize: '11px' }}>Click a cluster for details</span>
        </div>
      )}
    </div>
  );
}
