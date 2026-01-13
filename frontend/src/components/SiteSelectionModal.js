import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';

export default function SiteSelectionModal({ open, onClose, projectId, onSitesSelected }) {
  const [sites, setSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load all sites on mount
  useEffect(() => {
    if (!open) return;
    loadSites();
  }, [open]);

  // Load selected sites for this project if editing
  useEffect(() => {
    if (!open || !projectId) return;
    loadProjectSites();
  }, [open, projectId]);

  const loadSites = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/table/hub_sites');
      setSites(response.data?.data || []);
    } catch (err) {
      setError('Failed to load sites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectSites = async () => {
    try {
      const response = await axios.get('/api/table/lnk_project_site');
      const projectSites = response.data?.data?.filter(ps => ps.hub_project_id === projectId) || [];
      setSelectedSites(new Set(projectSites.map(ps => ps.hub_site_id)));
    } catch (err) {
      console.error('Failed to load project sites:', err);
    }
  };

  const handleToggleSite = (siteId) => {
    const newSelected = new Set(selectedSites);
    if (newSelected.has(siteId)) {
      newSelected.delete(siteId);
    } else {
      newSelected.add(siteId);
    }
    setSelectedSites(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSites.size === filteredSites.length) {
      setSelectedSites(new Set());
    } else {
      setSelectedSites(new Set(filteredSites.map(s => s.hub_site_id || s.id)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Delete existing links for this project
      const existing = await axios.get('/api/table/lnk_project_site');
      const projectLinks = existing.data?.data?.filter(ps => ps.hub_project_id === projectId) || [];
      
      for (const link of projectLinks) {
        await axios.delete(`/api/table/lnk_project_site/${link.lnk_project_site_id || link.id}`);
      }

      // Add new links
      for (const siteId of selectedSites) {
        await axios.post('/api/table/lnk_project_site', {
          hub_project_id: projectId,
          hub_site_id: siteId
        });
      }

      if (onSitesSelected) onSitesSelected(Array.from(selectedSites));
      onClose();
    } catch (err) {
      setError('Failed to save site selections');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredSites = sites.filter(s => {
    const name = (s.site_name || s.name || '').toLowerCase();
    const id = (s.hub_site_id || s.id || '').toString();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || id.includes(term);
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Sites for Project</DialogTitle>
          <DialogDescription>Choose which sites to link to this project</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        
        <Input
          placeholder="Search by site name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-4"
        />

        {loading && <div className="text-center text-slate-500 py-4">Loading sites...</div>}

        {!loading && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedSites.size === filteredSites.length && filteredSites.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select All ({filteredSites.length})
              </label>
            </div>

            <div className="border rounded-md overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Site ID</TableHead>
                    <TableHead>Site Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSites.map((site) => {
                    const siteId = site.hub_site_id || site.id;
                    const siteName = site.site_name || site.name || '';
                    return (
                      <TableRow key={siteId}>
                        <TableCell className="w-12">
                          <Checkbox
                            checked={selectedSites.has(siteId)}
                            onCheckedChange={() => handleToggleSite(siteId)}
                          />
                        </TableCell>
                        <TableCell>{siteId}</TableCell>
                        <TableCell>{siteName}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {filteredSites.length === 0 && !loading && (
              <Alert>
                <AlertDescription>No sites found matching your search.</AlertDescription>
              </Alert>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            Save Selection ({selectedSites.size} selected)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
