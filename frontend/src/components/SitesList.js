import React, { useEffect, useState } from 'react';
import { Segment, Header, Table, Button, Icon, Loader, Message } from 'semantic-ui-react';
import axios from 'axios';

export default function SitesList({ onEdit, onCreate, onChange }) {
  const [sites, setSites] = useState([]);
  const [schemaFields, setSchemaFields] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch schema columns for hub_sites
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/table/hub_sites');
      setSites(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load sites', err);
      setError(err.response?.data?.error || err.message || 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete site "${s.name || s.id}"?`)) return;
    try {
      await axios.delete(`/api/table/hub_sites/${s.id || s.hub_site_id}`);
      await load();
      if (onChange) onChange();
    } catch (err) {
      console.error('Delete failed', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete site');
    }
  };

  return (
    <Segment>
      <Header as="h3">Sites <Button primary size="small" onClick={() => { if (onCreate) onCreate(); }} style={{ float: 'right' }}>New Site</Button></Header>
      {loading ? <Loader active inline="centered" /> : null}
      {error && <Message negative content={error} />}

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
              <Table.Cell>{s.id || s.hub_site_id}</Table.Cell>
              {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_site_id').map(field => (
                <Table.Cell key={field}>{s[field]}</Table.Cell>
              ))}
              <Table.Cell>
                <Button icon size="small" onClick={() => { if (onEdit) onEdit(s); }} title="View Details">
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
    </Segment>
  );
}
