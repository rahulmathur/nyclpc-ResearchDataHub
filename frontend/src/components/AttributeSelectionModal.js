import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Table, Checkbox, Message, Dimmer, Loader, Icon, Segment, Header } from 'semantic-ui-react';
import axios from 'axios';

export default function AttributeSelectionModal({ open, onClose, projectId, onAttributesSelected }) {
  const [attributes, setAttributes] = useState([]);
  const [orderedSelectedIds, setOrderedSelectedIds] = useState([]); // Array to maintain order
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);

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

  // Drag and drop handlers
  const handleDragStart = useCallback((e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    setOrderedSelectedIds(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(dropIndex, 0, removed);
      return newOrder;
    });
    setDraggedIndex(null);
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

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

  const filteredAttributes = attributes.filter(a => {
    const name = (a.attribute_nm || '').toLowerCase();
    const text = (a.attribute_text || '').toLowerCase();
    const desc = (a.attribute_desc || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || text.includes(term) || desc.includes(term);
  });

  // Get attribute details by ID
  const getAttrById = (id) => attributes.find(a => a.attribute_id === id);

  // Selected attributes in order
  const selectedAttributesOrdered = orderedSelectedIds
    .map(id => getAttrById(id))
    .filter(Boolean);

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>Select Site Attributes for Project</Modal.Header>
      <Modal.Content scrolling>
        {error && <Message negative content={error} />}
        
        <p style={{ color: '#666', marginBottom: 16 }}>
          Select which attributes should be tracked for sites in this project. Drag to reorder how columns appear.
        </p>

        {/* Selected Attributes - Reorderable */}
        {selectedAttributesOrdered.length > 0 && (
          <Segment>
            <Header as="h4" style={{ marginBottom: 12 }}>
              <Icon name="ordered list" />
              Selected Attributes (drag to reorder)
            </Header>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {selectedAttributesOrdered.map((attr, index) => (
                <div
                  key={attr.attribute_id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: draggedIndex === index ? '#e8f4f8' : '#f9f9f9',
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    cursor: 'grab',
                    opacity: draggedIndex === index ? 0.5 : 1
                  }}
                >
                  <Icon name="bars" style={{ marginRight: 12, color: '#999' }} />
                  <span style={{ flex: 1 }}>
                    <strong>{index + 1}.</strong> {attr.attribute_nm}
                    {attr.attribute_text && <span style={{ color: '#666' }}> ({attr.attribute_text})</span>}
                  </span>
                  <Button.Group size="mini">
                    <Button icon="arrow up" disabled={index === 0} onClick={() => moveItem(index, -1)} />
                    <Button icon="arrow down" disabled={index === selectedAttributesOrdered.length - 1} onClick={() => moveItem(index, 1)} />
                  </Button.Group>
                  <Button 
                    icon="remove" 
                    size="mini" 
                    negative 
                    style={{ marginLeft: 8 }}
                    onClick={() => handleToggleAttribute(attr.attribute_id)}
                  />
                </div>
              ))}
            </div>
          </Segment>
        )}

        <Header as="h4" style={{ marginTop: 20, marginBottom: 12 }}>
          <Icon name="list" />
          Available Attributes
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
                  <Table.HeaderCell>Attribute Name</Table.HeaderCell>
                  <Table.HeaderCell>Display Text</Table.HeaderCell>
                  <Table.HeaderCell>Description</Table.HeaderCell>
                  <Table.HeaderCell width={2}>Type</Table.HeaderCell>
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
                        {isSelected && (
                          <div style={{ fontSize: '0.8em', color: '#666', marginTop: 2 }}>
                            #{orderIndex + 1}
                          </div>
                        )}
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
          Save Selection ({orderedSelectedIds.length} selected)
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
