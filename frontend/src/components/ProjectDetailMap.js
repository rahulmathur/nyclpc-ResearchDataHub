import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { drawSiteGeometriesClustered, createMapView } from '../utils/arcgisMapUtils';

/**
 * Map component for ProjectDetail - displays all individual sites for a project
 * Uses Esri basemap (will prompt for authentication)
 */
export default function ProjectDetailMap({ projectId }) {
  const mapRef = useRef(null);
  const viewRef = useRef(null);
  const destroyRef = useRef(null);
  const clusterDestroyRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [totalSites, setTotalSites] = useState(0);

  useEffect(() => {
    if (!projectId || !mapRef.current) return;

    let destroyed = false;
    setMapReady(false);
    setProgress(0);
    setLoadingStage('Initializing...');
    
    // Safety timeout - ensure loading is cleared after 5 minutes max
    const safetyTimeout = setTimeout(() => {
      if (!destroyed) {
        setLoading(false);
      }
    }, 300000); // 5 minutes

    const initMap = async () => {
      try {
        // Stage 1: Fetch site IDs
        setLoadingStage('Fetching sites...');
        setProgress(5);
        const sitesRes = await axios.get(`/api/projects/${projectId}/sites?limit=100000`, {
          timeout: 120000 // 2 minute timeout for large projects
        });
        if (destroyed) return;

        const sites = sitesRes.data.data || [];
        const siteIds = sites.map(site => site.id || site.hub_site_id).filter(id => id != null);
        setTotalSites(siteIds.length);
        setProgress(15);

        if (siteIds.length === 0) {
          clearTimeout(safetyTimeout);
          setError('No sites found for this project');
          setLoading(false);
          return;
        }

        // Stage 2: Fetch geometries
        setLoadingStage(`Fetching ${siteIds.length.toLocaleString()} geometries...`);
        setProgress(20);
        const geomRes = await axios.post('/api/sites/geometries', { siteIds }, {
          timeout: 120000
        });
        if (destroyed) return;

        const geometries = geomRes.data.data || [];
        setProgress(40);
        setLoadingStage('Creating map...');

        if (!mapRef.current) {
          clearTimeout(safetyTimeout);
          setError('Map container not available');
          setLoading(false);
          return;
        }

        // Wait for container to have proper dimensions (max 5 seconds)
        for (let i = 0; i < 50; i++) {
          const rect = mapRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Force minimum height if container still has zero dimensions
        if (mapRef.current) {
          const rect = mapRef.current.getBoundingClientRect();
          if (rect.height === 0) {
            mapRef.current.style.height = '400px';
            mapRef.current.style.minHeight = '400px';
          }
        }

        try {
          const { view, destroy } = await createMapView(mapRef.current);
          viewRef.current = view;
          destroyRef.current = destroy;
          
          // Wait for view to be ready (with timeout - authentication may delay this)
          // We'll proceed even if it times out, as the view may still be functional
          try {
            await Promise.race([
              view.when(),
              new Promise((resolve) => setTimeout(resolve, 15000)) // 15 second timeout
            ]);
          } catch (viewReadyErr) {
            // Continue anyway - the view might still be usable
            if (view.destroyed) {
              throw new Error('View was destroyed during initialization');
            }
          }
          
          // Give a small delay for view to render if when() didn't resolve
          if (!view.ready) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          if (destroyed || !viewRef.current || view.destroyed) {
            if (!destroyed) {
              if (destroyRef.current) destroyRef.current();
              setLoading(false);
            }
            return;
          }

          // Force view to resize to ensure proper rendering
          try {
            if (view && typeof view.resize === 'function') {
              view.resize();
            }
          } catch (resizeErr) {
            // Ignore resize errors
          }

          // Draw all site geometries with clustering (much faster for large datasets)
          setLoadingStage(`Rendering ${geometries.length.toLocaleString()} sites...`);
          setProgress(50);
          try {
            const { destroy: clusterDestroy } = await Promise.race([
              drawSiteGeometriesClustered(view, geometries, {
                fitBounds: true,
                onProgress: (pct) => setProgress(50 + Math.round(pct * 0.45)) // 50-95%
              }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Drawing geometries timeout')), 180000) // 3 minute timeout
              )
            ]);
            clusterDestroyRef.current = clusterDestroy;
          } catch (drawErr) {
            console.error('[ProjectDetailMap] Error drawing geometries:', drawErr);
            // Continue even if drawing fails - map should still be visible
          }
          setProgress(100);

          // Small delay for map to settle before revealing
          await new Promise(resolve => setTimeout(resolve, 300));
          setMapReady(true);

          // Final check before completing
          if (destroyed || !viewRef.current || view.destroyed) {
            if (!destroyed) {
              if (destroyRef.current) destroyRef.current();
              setLoading(false);
            }
            return;
          }

          clearTimeout(safetyTimeout);
          setLoading(false);
          
        } catch (mapErr) {
          if (!destroyed) {
            clearTimeout(safetyTimeout);
            console.error('[ProjectDetailMap] Error creating map view:', mapErr);
            setError('Failed to create map: ' + (mapErr?.message || String(mapErr)));
            setLoading(false);
          }
        }
      } catch (err) {
        if (!destroyed) {
          clearTimeout(safetyTimeout);
          console.error('[ProjectDetailMap] Error:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    };

    initMap();

    return () => {
      destroyed = true;
      clearTimeout(safetyTimeout);
      if (clusterDestroyRef.current) {
        clusterDestroyRef.current();
        clusterDestroyRef.current = null;
      }
      if (destroyRef.current) {
        destroyRef.current();
        destroyRef.current = null;
      }
      if (viewRef.current) {
        viewRef.current = null;
      }
    };
  }, [projectId]);

  return (
    <div className="project-detail-map-container" style={{ position: 'relative', minHeight: '400px' }}>
      <div
        ref={mapRef}
        className="project-detail-map"
        style={{
          width: '100%',
          height: '400px',
          minHeight: '400px',
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#1a1a2e',
          display: 'block',
          opacity: mapReady ? 1 : 0,
          transition: 'opacity 0.4s ease-in-out'
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
          textAlign: 'center',
          zIndex: 10,
          pointerEvents: 'none',
          width: '80%',
          maxWidth: '300px'
        }}>
          <div style={{ marginBottom: '8px' }}>{loadingStage}</div>
          {totalSites > 0 && (
            <div style={{ fontSize: '12px', marginBottom: '8px', color: '#aaa' }}>
              {totalSites.toLocaleString()} sites
            </div>
          )}
          <div style={{
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '4px',
            height: '8px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: '#0071bc',
              height: '100%',
              width: `${progress}%`,
              transition: 'width 0.3s ease-out',
              borderRadius: '4px'
            }} />
          </div>
          <div style={{ fontSize: '11px', marginTop: '4px', color: '#aaa' }}>
            {progress}%
          </div>
        </div>
      )}
      {error && (
        <div style={{ color: '#ff6b6b', padding: '8px', fontSize: '12px' }}>
          Map error: {error}
        </div>
      )}
      {!loading && !error && totalSites > 0 && (
        <div style={{ 
          padding: '8px 0', 
          fontSize: '12px', 
          color: '#888'
        }}>
          <span>Showing {totalSites.toLocaleString()} sites</span>
        </div>
      )}
    </div>
  );
}
