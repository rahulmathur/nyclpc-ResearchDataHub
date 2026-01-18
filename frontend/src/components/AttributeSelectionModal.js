import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Table, Checkbox, Message, Dimmer, Loader, Icon, Header } from 'semantic-ui-react';
import axios from 'axios';

export default function AttributeSelectionModal({ open, onClose, projectId, onAttributesSelected }) {
  const [attributes, setAttributes] = useState([]);
  const [orderedSelectedIds, setOrderedSelectedIds] = useState([]); // Array to maintain order
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
      // Already sorted by sort_order from backend
      setOrderedSelectedIds(projectAttrs.map(pa => pa.attribute_id));
    } catch (err) {
      console.error('Failed to load project attributes:', err);
    }
  };

  const handleToggleAttribute = (attrId) => {
    if (orderedSelectedIds.includes(attrId)) {
      // Remove from selection
      setOrderedSelectedIds(prev => prev.filter(id => id !== attrId));
    } else {
      // Add to end of selection
      setOrderedSelectedIds(prev => [...prev, attrId]);
    }
  };

  const handleSelectAll = () => {
    if (orderedSelectedIds.length === filteredAttributes.length) {
      setOrderedSelectedIds([]);
    } else {
      // Add all filtered that aren't already selected, preserving existing order
      const currentSet = new Set(orderedSelectedIds);
      const newIds = filteredAttributes
        .filter(a => !currentSet.has(a.attribute_id))
        .map(a => a.attribute_id);
      setOrderedSelectedIds([...orderedSelectedIds, ...newIds]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Send in order - backend will use array position as sort_order
      await axios.put(`/api/projects/${projectId}/site-attributes`, {
        attributeIds: orderedSelectedIds
      });

      if (onAttributesSelected) onAttributesSelected(orderedSelectedIds);
      onClose();
    } catch (err) {
      setError('Failed to save attribute selections');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= orderedSelectedIds.length) return;
    setOrderedSelectedIds(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(index, 1);
      newOrder.splice(newIndex, 0, removed);
      return newOrder;
    });
  };

  const moveByAttrId = (attrId, direction) => {
    const index = orderedSelectedIds.indexOf(attrId);
    if (index === -1) return;
    moveItem(index, direction);
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
          Select which attributes to track for sites in this project. Use the arrows to set their display order.
        </p>

        <Header as="h4" style={{ marginBottom: 12 }}>
          <Icon name="list" />
          Site Attributes
        </Header>

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
                checked={orderedSelectedIds.length === filteredAttributes.length && filteredAttributes.length > 0}
                indeterminate={orderedSelectedIds.length > 0 && orderedSelectedIds.length < filteredAttributes.length}
                onChange={handleSelectAll}
              />
            </div>

            <Table celled compact>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell width={1}></Table.HeaderCell>
                  <Table.HeaderCell width={1}>Order</Table.HeaderCell>
                  <Table.HeaderCell>Attribute Name</Table.HeaderCell>
                  <Table.HeaderCell>Display Text</Table.HeaderCell>
                  <Table.HeaderCell>Description</Table.HeaderCell>
                  <Table.HeaderCell width={2}>Type</Table.HeaderCell>
                  <Table.HeaderCell width={1}></Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredAttributes.map((attr) => {
                  const attrId = attr.attribute_id;
                  const isSelected = orderedSelectedIds.includes(attrId);
                  const orderIndex = orderedSelectedIds.indexOf(attrId);
                  return (
                    <Table.Row key={attrId} positive={isSelected}>
                      <Table.Cell textAlign="center">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleToggleAttribute(attrId)}
                        />
                      </Table.Cell>
                      <Table.Cell textAlign="center">
                        {isSelected ? orderIndex + 1 : '–'}
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
                      <Table.Cell>
                        <Button.Group size="mini">
                          <Button
                            icon="arrow up"
                            disabled={!isSelected || orderIndex === 0}
                            onClick={() => moveByAttrId(attrId, -1)}
                            title="Move up"
                          />
                          <Button
                            icon="arrow down"
                            disabled={!isSelected || orderIndex === orderedSelectedIds.length - 1}
                            onClick={() => moveByAttrId(attrId, 1)}
                            title="Move down"
                          />
                        </Button.Group>
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
          Save Selection ({orderedSelectedIds.length} selected)
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
