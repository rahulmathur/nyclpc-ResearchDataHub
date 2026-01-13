import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sites</CardTitle>
        <Button onClick={() => { if (onCreate) onCreate(); }}>+ New Site</Button>
      </CardHeader>
      <CardContent>
        {loading && <div className="text-slate-600 text-center py-8">Loading sites...</div>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_site_id').map(field => (
                  <TableHead key={field}>{field.replace(/_/g, ' ').toUpperCase()}</TableHead>
                ))}
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map(s => (
                <TableRow key={s.id || s.hub_site_id}>
                  <TableCell>{s.id || s.hub_site_id}</TableCell>
                  {schemaFields && schemaFields.filter(f => f !== 'id' && f !== 'hub_site_id').map(field => (
                    <TableCell key={field}>{s[field]}</TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { if (onEdit) onEdit(s); }} title="View Details">
                        👁
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(s)} title="Delete">
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
