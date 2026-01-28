import React, { useEffect, useState, useCallback } from 'react';
import { Segment, Header, Table, Button, Icon, Loader, Message, Form } from 'semantic-ui-react';
import axios from 'axios';
import { useDelete } from '../hooks';
import './SitesList.css';

const PAGE_SIZE_OPTS = [25, 50, 100, 250];
const INIT_FILTERS = { siteId: '', bin: '', material: '', style: '', use: '', type: '' };

export default function SitesList({ onEdit, onCreate, onChange }) {
  const [sites, setSites] = useState([]);
  const [schemaFields, setSchemaFields] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState(INIT_FILTERS);
  const [refOptions, setRefOptions] = useState({ material: [], style: [], use: [], type: [] });
  const [pageSize, setPageSize] = useState(25);
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/columns/hub_sites');
        const cols = res.data?.columns || [];
        if (!mounted) return;
        if (cols.length > 0) {
          const fields = cols.map(c => c.column_name).filter(cn => cn !== 'hub_site_id');
          setSchemaFields(fields);
        } else {
          setSchemaFields(['name', 'description', 'address', 'borough', 'latitude', 'longitude']);
        }
      } catch (e) {
        console.warn('Failed to fetch columns schema, using fallback', e);
        setSchemaFields(['name', 'description', 'address', 'borough', 'latitude', 'longitude']);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load ref_* options for dropdowns
  useEffect(() => {
    const refs = [
      { key: 'material', table: 'ref_material', idCol: 'material_id', nmCol: 'material_nm' },
      { key: 'style', table: 'ref_style', idCol: 'style_id', nmCol: 'style_nm' },
      { key: 'use', table: 'ref_use', idCol: 'use_id', nmCol: 'use_nm' },
      { key: 'type', table: 'ref_type', idCol: 'type_id', nmCol: 'type_nm' },
    ];
    refs.forEach(async ({ key, table, idCol, nmCol }) => {
      try {
        const res = await axios.get(`/api/table/${table}`, { params: { limit: 500 } });
        const rows = res.data?.data || [];
        setRefOptions(prev => ({
          ...prev,
          [key]: rows.map(r => ({ key: r[idCol], value: r[nmCol], text: r[nmCol] })),
        }));
      } catch (e) {
        setRefOptions(prev => ({ ...prev, [key]: [] }));
      }
    });
  }, []);

  const load = useCallback(async (overrides = {}) => {
    const f = overrides.filters ?? filters;
    const o = overrides.offset ?? offset;
    const ps = overrides.pageSize ?? pageSize;
    setLoading(true);
    setError(null);
    try {
      const params = { limit: ps, offset: o };
      if (f.siteId) params.siteId = f.siteId;
      if (f.bin) params.bin = f.bin;
      if (f.material) params.material = f.material;
      if (f.style) params.style = f.style;
      if (f.use) params.use = f.use;
      if (f.type) params.type = f.type;
      const res = await axios.get('/api/sites/list', { params });
      setSites(res.data?.data || []);
      setCount(res.data?.count ?? 0);
    } catch (err) {
      console.error('Failed to load sites', err);
      setError(err.response?.data?.error || err.message || 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, [pageSize, offset, filters]);

  useEffect(() => {
    load();
    // filters omitted so we don't fetch on every keystroke; Search/Clear set offset or call load(overrides)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, pageSize]);

  const onSearch = () => {
    setOffset(0);
    if (offset === 0) load(); // effect won't run when offset stays 0
  };
  const onClear = () => {
    setFilters(INIT_FILTERS);
    setOffset(0);
    if (offset === 0) load({ filters: INIT_FILTERS }); // use cleared filters before state commits
  };
  const onPrev = () => setOffset(o => Math.max(0, o - pageSize));
  const onNext = () => setOffset(o => o + pageSize);
  const onPageSizeChange = (e) => {
    setPageSize(Number(e.target.value));
    setOffset(0);
  };

  // Use delete hook for site deletion
  const { handleDelete, error: deleteError } = useDelete('/api/table/hub_sites', async () => {
    load();
    if (onChange) onChange();
  }, 'site');

  const rangeStart = count === 0 ? 0 : offset + 1;
  const rangeEnd = count === 0 ? 0 : Math.min(offset + pageSize, count);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < count;

  return (
    <Segment>
      <Header as="h3">Sites <Button primary size="small" onClick={() => { if (onCreate) onCreate(); }} style={{ float: 'right' }}>New Site</Button></Header>

      {/* Filter sites */}
      <Segment className="sites-list-filter" secondary>
        <Header as="h4" style={{ marginTop: 0 }}>Filter sites</Header>
        <Form>
          <Form.Group widths="equal">
            <Form.Input
              placeholder="Site ID"
              value={filters.siteId}
              onChange={(e, { value }) => setFilters(f => ({ ...f, siteId: value || '' }))}
            />
            <Form.Input
              placeholder="BIN"
              value={filters.bin}
              onChange={(e, { value }) => setFilters(f => ({ ...f, bin: value || '' }))}
            />
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Select
              placeholder="Material"
              clearable
              selection
              options={refOptions.material}
              value={filters.material || ''}
              onChange={(e, { value }) => setFilters(f => ({ ...f, material: value ?? '' }))}
            />
            <Form.Select
              placeholder="Style"
              clearable
              selection
              options={refOptions.style}
              value={filters.style || ''}
              onChange={(e, { value }) => setFilters(f => ({ ...f, style: value ?? '' }))}
            />
            <Form.Select
              placeholder="Use"
              clearable
              selection
              options={refOptions.use}
              value={filters.use || ''}
              onChange={(e, { value }) => setFilters(f => ({ ...f, use: value ?? '' }))}
            />
            <Form.Select
              placeholder="Type"
              clearable
              selection
              options={refOptions.type}
              value={filters.type || ''}
              onChange={(e, { value }) => setFilters(f => ({ ...f, type: value ?? '' }))}
            />
          </Form.Group>
          <Form.Group>
            <Form.Field>
              <Button primary icon="search" content="Search" onClick={onSearch} />
              <Button icon="erase" content="Clear" onClick={onClear} style={{ marginLeft: 8 }} />
            </Form.Field>
          </Form.Group>
        </Form>
      </Segment>

      {/* Results summary */}
      <div className="sites-list-summary">
        {!loading && (count === 0 ? 'No sites found' : `Showing ${rangeStart}–${rangeEnd} of ${count} sites`)}
      </div>

      {loading ? <Loader active inline="centered" /> : null}
      {(error || deleteError) && <Message negative content={error || deleteError} />}

      <Table celled selectable compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>ID</Table.HeaderCell>
            {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_site_id').map(field => (
              <Table.HeaderCell key={field}>{field.replace(/_/g, ' ').toUpperCase()}</Table.HeaderCell>
            ))}
            <Table.HeaderCell>Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sites.map(s => (
            <Table.Row key={s.id || s.hub_site_id}>
              <Table.Cell>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onEdit) onEdit(s);
                  }}
                  className="site-id-link"
                  aria-label={`View details for site ${s.id || s.hub_site_id}`}
                >
                  {s.id || s.hub_site_id}
                </button>
              </Table.Cell>
              {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_site_id').map(field => (
                <Table.Cell key={field}>{s[field]}</Table.Cell>
              ))}
              <Table.Cell>
                <Button icon size="small" onClick={() => onEdit?.(s)} title="View Details">
                  <Icon name="eye" />
                </Button>
                <Button icon color="red" size="small" onClick={() => handleDelete(s)} title="Delete">
                  <Icon name="trash" />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      {/* Pagination */}
      <div className="sites-pagination">
        <div className="sites-pagination-left">
          <label>
            <select value={pageSize} onChange={onPageSizeChange} aria-label="Sites per page">
              {PAGE_SIZE_OPTS.map(n => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
          </label>
        </div>
        <div className="sites-pagination-center">
          <Button onClick={onPrev} disabled={!canPrev}>← Previous</Button>
          <span className="pagination-info">
            Showing {rangeStart}–{rangeEnd} of {count} sites
          </span>
          <Button onClick={onNext} disabled={!canNext}>Next →</Button>
        </div>
      </div>

    </Segment>
  );
}
