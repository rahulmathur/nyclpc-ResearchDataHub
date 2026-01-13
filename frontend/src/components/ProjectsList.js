import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Projects</CardTitle>
        <Button onClick={() => { if (onCreate) onCreate(); }}>+ New Project</Button>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-slate-600 text-center py-8">Loading projects...</div>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_project_id').map(field => (
                  <TableHead key={field}>{field.replace(/_/g, ' ').toUpperCase()}</TableHead>
                ))}
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map(p => (
                <TableRow key={p.id || p.hub_project_id}>
                  <TableCell>{p.id || p.hub_project_id}</TableCell>
                  {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_project_id').map(field => (
                    <TableCell key={field}>{p[field]}</TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { if (onEdit) onEdit(p); }} title="Edit">
                        ✎
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(p)} title="Delete">
                        🗑
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
