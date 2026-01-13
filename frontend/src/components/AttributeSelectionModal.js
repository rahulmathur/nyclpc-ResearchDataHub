import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Table, Checkbox, Message, Dimmer, Loader } from 'semantic-ui-react';
import axios from 'axios';

export default function AttributeSelectionModal({ open, onClose, projectId, onAttributesSelected }) {
  const [attributes, setAttributes] = useState([]);
  const [selectedAttributes, setSelectedAttributes] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load all site attributes on open
  useEffect(() => {
    if (!open) return;
    loadAttributes();
  }, [open]);

  // Load selected attributes for this project if editing
  useEffect(() => {
    if (!open || !projectId) return;
    loadProjectAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const loadAttributes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/site-attributes');
      setAttributes(response.data?.data || []);
    } catch (err) {
      setError('Failed to load attributes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectAttributes = async () => {
    try {
      const response = await axios.get(`/api/projects/${projectId}/site-attributes`);
      const projectAttrs = response.data?.data || [];
      setSelectedAttributes(new Set(projectAttrs.map(pa => pa.attribute_id)));
    } catch (err) {
      console.error('Failed to load project attributes:', err);
    }
  };

  const handleToggleAttribute = (attrId) => {
    const newSelected = new Set(selectedAttributes);
    if (newSelected.has(attrId)) {
      newSelected.delete(attrId);
    } else {
      newSelected.add(attrId);
    }
    setSelectedAttributes(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedAttributes.size === filteredAttributes.length) {
      setSelectedAttributes(new Set());
    } else {
      setSelectedAttributes(new Set(filteredAttributes.map(a => a.attribute_id)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await axios.put(`/api/projects/${projectId}/site-attributes`, {
        attributeIds: Array.from(selectedAttributes)
      });

      if (onAttributesSelected) onAttributesSelected(Array.from(selectedAttributes));
      onClose();
    } catch (err) {
      setError('Failed to save attribute selections');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredAttributes = attributes.filter(a => {
    const name = (a.attribute_nm || '').toLowerCase();
    const text = (a.attribute_text || '').toLowerCase();
    const desc = (a.attribute_desc || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || text.includes(term) || desc.includes(term);
  });

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>Select Site Attributes for Project</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}
        
        <p style={{ color: '#666', marginBottom: 16 }}>
          Select which attributes should be tracked for sites in this project.
        </p>

        <Input
          placeholder="Search by attribute name or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginBottom: 16, width: '100%' }}
          icon="search"
        />

        <Dimmer active={loading} inverted>
          <Loader>Loading attributes...</Loader>
        </Dimmer>

        {!loading && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Checkbox
                label={`Select All (${filteredAttributes.length})`}
                checked={selectedAttributes.size === filteredAttributes.length && filteredAttributes.length > 0}
                indeterminate={selectedAttributes.size > 0 && selectedAttributes.size < filteredAttributes.length}
                onChange={handleSelectAll}
              />
            </div>

            <Table celled compact>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell width={1}></Table.HeaderCell>
                  <Table.HeaderCell>Attribute Name</Table.HeaderCell>
                  <Table.HeaderCell>Display Text</Table.HeaderCell>
                  <Table.HeaderCell>Description</Table.HeaderCell>
                  <Table.HeaderCell width={2}>Type</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredAttributes.map((attr) => {
                  const attrId = attr.attribute_id;
                  return (
                    <Table.Row key={attrId}>
                      <Table.Cell textAlign="center">
                        <Checkbox
                          checked={selectedAttributes.has(attrId)}
                          onChange={() => handleToggleAttribute(attrId)}
                        />
                      </Table.Cell>
                      <Table.Cell><strong>{attr.attribute_nm}</strong></Table.Cell>
                      <Table.Cell>{attr.attribute_text || '-'}</Table.Cell>
                      <Table.Cell>{attr.attribute_desc || '-'}</Table.Cell>
                      <Table.Cell>
                        <code style={{ 
                          backgroundColor: '#f0f0f0', 
                          padding: '2px 6px', 
                          borderRadius: 3,
                          fontSize: '0.85em'
                        }}>
                          {attr.attribute_type || '-'}
                        </code>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>

            {filteredAttributes.length === 0 && !loading && (
              <Message info content="No attributes found matching your search." />
            )}
          </>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={handleSave} loading={saving} disabled={saving}>
          Save Selection ({selectedAttributes.size} selected)
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
