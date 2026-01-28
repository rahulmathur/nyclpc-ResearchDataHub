import React, { useEffect, useMemo } from 'react';
import { Segment, Header, Table, Button, Icon, Loader, Message } from 'semantic-ui-react';
import { useTableData, useDelete } from '../hooks';

export default function ProjectsList({ onEdit, onCreate, onChange }) {
  const { data: projects, schema, loading, error, load } = useTableData('hub_projects', '/api/projects');

  // Extract field names from schema, excluding primary key
  const schemaFields = useMemo(() => {
    if (!schema || schema.length === 0) {
      return ['name', 'description', 'address', 'borough', 'latitude', 'longitude'];
    }
    return schema.map(c => c.column_name).filter(cn => cn !== 'hub_project_id');
  }, [schema]);

  // Delete handler with success callback
  const { handleDelete, error: deleteError } = useDelete('/api/projects', async () => {
    await load();
    if (onChange) onChange();
  }, 'project');

  // Load data on mount
  useEffect(() => { load(); }, [load]);

  return (
    <Segment>
      <Header as="h3">Projects <Button primary size="small" onClick={() => { if (onCreate) onCreate(); }} style={{ float: 'right' }}>New Project</Button></Header>
      {loading ? <Loader active inline="centered" /> : null}
      {(error || deleteError) && <Message negative content={error || deleteError} />}

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
