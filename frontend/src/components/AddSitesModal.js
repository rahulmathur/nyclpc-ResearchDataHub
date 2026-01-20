import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Input, Table, Message, Dimmer, Loader, Checkbox } from 'semantic-ui-react';
import axios from 'axios';

const PAGE_SIZE = 100;

export default function AddSitesModal({ open, onClose, projectId, onSitesUpdated, onViewSiteDetail }) {
  const [sites, setSites] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const loadIdRef = useRef(0);
  const sitesFetchedRef = useRef(false);

  const fetchSites = useCallback(async (opts) => {
    const { replace, offset, q } = opts;
    const params = { limit: PAGE_SIZE, offset, q: q || '' };
    try {
      if (replace) {
        loadIdRef.current += 1;
        const id = loadIdRef.current;
        setLoading(true);
        setError(null);
        const res = await axios.get('/api/sites', { params });
        if (id !== loadIdRef.current) return;
        setSites(res.data?.data || []);
        setTotal(res.data?.total ?? 0);
      } else {
        setLoadingMore(true);
        const res = await axios.get('/api/sites', { params });
        const data = res.data?.data || [];
        setSites((prev) => {
          if (prev.length !== offset) return prev;
          return [...prev, ...data];
        });
      }
    } catch (err) {
      if (opts.replace) setError('Failed to load sites');
      console.error(err);
    } finally {
      if (replace) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  // Reset when modal closes
  useEffect(() => {
    if (!open) sitesFetchedRef.current = false;
  }, [open]);

  // Fetch linked sites when modal opens
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    axios.get(`/api/projects/${projectId}/sites`).then((res) => {
      if (cancelled) return;
      const linked = res.data?.data || [];
      setSelectedSiteIds(new Set(linked.map((s) => s.hub_site_id || s.id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, projectId]);

  // Fetch sites: immediate on first open, debounced when searchTerm changes
  useEffect(() => {
    if (!open || !projectId) return;
    if (!sitesFetchedRef.current) {
      sitesFetchedRef.current = true;
      fetchSites({ replace: true, offset: 0, q: searchTerm });
      return;
    }
    const t = setTimeout(() => fetchSites({ replace: true, offset: 0, q: searchTerm }), 350);
    return () => clearTimeout(t);
  }, [open, projectId, searchTerm, fetchSites]);

  const loadMore = () => {
    fetchSites({ replace: false, offset: sites.length, q: searchTerm });
  };

  const toggleSite = (siteId) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const selectAllVisible = () => {
    const ids = sites.map((s) => s.hub_site_id || s.id);
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const deselectAllVisible = () => {
    const ids = sites.map((s) => s.hub_site_id || s.id);
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await axios.put(`/api/projects/${projectId}/sites`, { siteIds: Array.from(selectedSiteIds) });
      if (onSitesUpdated) onSitesUpdated(Array.from(selectedSiteIds));
      onClose();
    } catch (err) {
      setError('Failed to save site selection');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const visibleSelectedCount = sites.filter((s) => selectedSiteIds.has(s.hub_site_id || s.id)).length;
  const hasMore = sites.length < total;

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>Add Sites to Project</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}

        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Input
            placeholder="Search by site ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1 }}
            icon="search"
          />
          <span style={{ color: '#666' }}>
            {selectedSiteIds.size} site{selectedSiteIds.size !== 1 ? 's' : ''} selected
          </span>
        </div>

        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" onClick={selectAllVisible}>
            Select All Visible ({sites.length})
          </Button>
          <Button size="small" onClick={deselectAllVisible}>
            Deselect All Visible
          </Button>
          <span style={{ color: '#888', fontSize: '0.9em' }}>
            {total > 0 && (sites.length > 0 ? `Showing 1–${sites.length} of ${total.toLocaleString()}` : `Showing 0 of ${total.toLocaleString()}`)}
          </span>
        </div>

        <Dimmer active={loading} inverted>
          <Loader>Loading sites...</Loader>
        </Dimmer>

        {!loading && (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <Table celled compact striped>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell style={{ width: 50 }}>
                    <Checkbox
                      checked={visibleSelectedCount === sites.length && sites.length > 0}
                      indeterminate={visibleSelectedCount > 0 && visibleSelectedCount < sites.length}
                      onChange={() => (visibleSelectedCount === sites.length ? deselectAllVisible() : selectAllVisible())}
                    />
                  </Table.HeaderCell>
                  <Table.HeaderCell>Site ID</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sites.map((site) => {
                  const siteId = site.hub_site_id || site.id;
                  const isSelected = selectedSiteIds.has(siteId);
                  const onSiteIdClick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onViewSiteDetail) onViewSiteDetail(site);
                  };
                  return (
                    <Table.Row key={siteId} onClick={() => toggleSite(siteId)} style={{ cursor: 'pointer' }}>
                      <Table.Cell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onChange={() => toggleSite(siteId)} />
                      </Table.Cell>
                      <Table.Cell>
                        {onViewSiteDetail ? (
                          <button
                            type="button"
                            onClick={onSiteIdClick}
                            className="site-id-link"
                            style={{
                              background: 'none', border: 'none', padding: 0, textDecoration: 'underline',
                              cursor: 'pointer', fontWeight: '500', color: '#00ccff', font: 'inherit'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#00ff88'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#00ccff'; }}
                            aria-label={`View details for site ${siteId}`}
                          >
                            {siteId}
                          </button>
                        ) : (
                          siteId
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <Button
                  onClick={loadMore}
                  loading={loadingMore}
                  disabled={loadingMore}
                  secondary
                >
                  {loadingMore ? 'Loading...' : `Load more (${sites.length} of ${total.toLocaleString()} loaded)`}
                </Button>
              </div>
            )}
          </div>
        )}

        {!loading && sites.length === 0 && total === 0 && (
          <Message info content="No sites found. Try a different search." />
        )}
        {!loading && sites.length === 0 && total > 0 && (
          <Message info content="No sites in this range. Try a different search or clear the filter." />
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button primary onClick={handleSave} loading={saving} disabled={saving}>
          Save Selection ({selectedSiteIds.size} sites)
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
