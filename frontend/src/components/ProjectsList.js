import React, { useEffect, useState } from 'react';
import { Segment, Header, Table, Button, Icon, Loader, Message } from 'semantic-ui-react';
import axios from 'axios';

export default function ProjectsList({ onEdit, onCreate, onChange }) {
  const [projects, setProjects] = useState([]);
  const [schemaFields, setSchemaFields] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch schema columns for hub_projects
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/columns/hub_projects');
        const cols = res.data?.columns || [];
        if (!mounted) return;
        if (cols.length > 0) {
          // Exclude primary key columns; include other fields
          const fields = cols.map(c => c.column_name).filter(cn => cn !== 'hub_project_id');
          setSchemaFields(fields);
        } else {
          // Fallback to common field names
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
      const res = await axios.get('/api/projects');
      setProjects(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load projects', err);
      setError(err.response?.data?.error || err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete project "${p.name || p.id}"?`)) return;
    try {
      await axios.delete(`/api/projects/${p.id}`);
      await load();
      if (onChange) onChange();
    } catch (err) {
      console.error('Delete failed', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete project');
    }
  };

  return (
    <Segment>
      <Header as="h3">Projects <Button primary size="small" onClick={() => { if (onCreate) onCreate(); }} style={{ float: 'right' }}>New Project</Button></Header>
      {loading ? <Loader active inline="centered" /> : null}
      {error && <Message negative content={error} />}

      <Table celled selectable compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>ID</Table.HeaderCell>
            {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_project_id').map(field => (
              <Table.HeaderCell key={field}>{field.replace(/_/g, ' ').toUpperCase()}</Table.HeaderCell>
            ))}
            <Table.HeaderCell>Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {projects.map(p => (
            <Table.Row key={p.id || p.hub_project_id}>
              <Table.Cell>{p.id || p.hub_project_id}</Table.Cell>
              {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_project_id').map(field => (
                <Table.Cell key={field}>{p[field]}</Table.Cell>
              ))}
              <Table.Cell>
                <Button icon size="small" onClick={() => { if (onEdit) onEdit(p); }} title="Edit">
                  <Icon name="edit" />
                </Button>
                <Button icon color="red" size="small" onClick={() => handleDelete(p)} title="Delete">
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
