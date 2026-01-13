import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Button, Loader, Form, Icon } from 'semantic-ui-react';
import './TableView.css';

function TableView({ tableName, openAddTrigger }) {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [columnMeta, setColumnMeta] = useState([]); // metadata including enum values
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, count: 0 });
  const [pageSize, setPageSize] = useState(50);
  const [useEstimatedCount, setUseEstimatedCount] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editData, setEditData] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  // respond to external openAddTrigger prop to open the add form from parent
  useEffect(() => {
    if (typeof openAddTrigger !== 'undefined' && openAddTrigger !== null) {
      setShowAddForm(true);
    }
  }, [openAddTrigger]);
  const [newRecord, setNewRecord] = useState({});
  // reset add form when table name changes
  useEffect(() => {
    setShowAddForm(false);
    setNewRecord({});
  }, [tableName]);

  useEffect(() => {
    loadTableData();
    // fetch column metadata including enum values
    (async () => {
      try {
        const colRes = await axios.get(`/api/columns/${tableName}`);
        setColumnMeta(colRes.data.columns || []);
      } catch (e) {
        setColumnMeta([]);
      }
    })();
  }, [tableName, pagination.offset, pageSize, useEstimatedCount]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setPagination(prev => ({ ...prev, offset: 0 }));
      loadTableData();
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, tableName, pageSize, useEstimatedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTableData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/table/${tableName}`, {
        params: { limit: pageSize, offset: pagination.offset, q: searchQuery || undefined, fastCount: useEstimatedCount ? 'true' : undefined }
      });
      
      const rawData = response.data.data || [];
      // assign a stable internal id per row so we can edit rows reliably even when
      // the actual DB PK uses custom column names (hub_project_id, etc.) or is absent
      const tableData = rawData.map((r, idx) => {
        const dbId = r.id || r._id || r.hub_project_id || r.hub_site_id;
        return { ...r, __internalId: dbId ?? `row-${pagination.offset + idx}` };
      });
      setData(tableData);
      setPagination(prev => ({ ...prev, count: response.data.count }));
      
      if (tableData.length > 0) {
        // hide internal id from columns
        setColumns(Object.keys(tableData[0]).filter(c => c !== '__internalId'));
      }
    } catch (error) {
      console.error('Failed to load table data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row) => {
    setEditingRow(row.__internalId);
    // keep editData free of internal id
    const { __internalId, ...rest } = row;
    setEditData({ ...rest });
  };

  const handleSave = async (internalId) => {
    try {
      const row = data.find(r => r.__internalId === internalId);
      if (!row) throw new Error('Row not found');
      const dbId = row.id || row._id || row.hub_project_id || row.hub_site_id || internalId;
      await axios.put(`/api/table/${tableName}/${dbId}`, editData);
      setEditingRow(null);
      setEditData({});
      loadTableData();
    } catch (error) {
      console.error('Failed to update:', error);
      alert('Failed to update record');
    }
  };

  const handleDelete = async (internalId) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    
    try {
      const row = data.find(r => r.__internalId === internalId);
      if (!row) throw new Error('Row not found');
      const dbId = row.id || row._id || row.hub_project_id || row.hub_site_id || internalId;
      await axios.delete(`/api/table/${tableName}/${dbId}`);
      loadTableData();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete record');
    }
  };

  const handleAdd = async () => {
    try {
      await axios.post(`/api/table/${tableName}`, newRecord);
      setShowAddForm(false);
      setNewRecord({});
      loadTableData();
    } catch (error) {
      console.error('Failed to add record:', error);
      alert('Failed to add record');
    }
  };

  const nextPage = () => {
    if (pagination.offset + pagination.limit < pagination.count) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  const prevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };

  if (loading && data.length === 0) {
    return (
      <div className="table-loading">
        <Loader active inline='centered'>Loading data...</Loader>
      </div>
    );
  }

  return (
    <div className="table-view">
      <div className="table-header">
        <h2>{tableName}</h2>
        <div className="table-actions">
          <span className="record-count">{pagination.count}{' '}{pagination.count ? (pagination.count_estimated ? ' (approx)' : '') : ''} records</span>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Search (across text columns)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd' }}
              aria-label="table-search"
            />

            <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value, 10))} aria-label="page-size-select">
              {[25,50,100,250,500,1000].map(s => <option key={s} value={s}>{s}/page</option>)}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={useEstimatedCount} onChange={(e) => setUseEstimatedCount(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Use estimated count</span>
            </label>

            <Button primary onClick={() => setShowAddForm(!showAddForm)}>+ Add Record</Button>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="add-form">
          <h3>Add New Record</h3>
          <Form>
            <Form.Group widths="equal">
              {columns.filter(col => col !== 'id' && col !== '_id').map(column => {
                const meta = columnMeta.find(m => m.column_name === column);
                if (meta?.enum_values?.length) {
                  const options = meta.enum_values.map(v => ({ key: v, text: v, value: v }));
                  return (
                    <Form.Select
                      key={column}
                      label={column}
                      options={options}
                      value={newRecord[column] || ''}
                      onChange={(e, { name, value }) => setNewRecord({ ...newRecord, [column]: value })}
                      name={column}
                      placeholder={`Select ${column}`}
                    />
                  );
                }

                return (
                  <Form.Input
                    key={column}
                    label={column}
                    value={newRecord[column] || ''}
                    onChange={(e, { value }) => setNewRecord({ ...newRecord, [column]: value })}
                    placeholder={`Enter ${column}`}
                  />
                );

              })}
            </Form.Group>
            <div className="form-actions">
              <Button primary onClick={handleAdd}>Save</Button>
              <Button onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </Form>
        </div>
      )}

      <div className="table-container">
        <Table celled selectable compact className="data-table">
          <Table.Header>
            <Table.Row>
              {columns.map(column => (
                <Table.HeaderCell key={column}>{column}</Table.HeaderCell>
              ))}
              <Table.HeaderCell className="actions-column">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {data.map((row, rowIndex) => {
              const rowId = row.__internalId || `row-${rowIndex}`;
              const isEditing = editingRow === rowId;

              return (
                <Table.Row key={rowId} className={isEditing ? 'editing' : ''}>
                  {columns.map(column => (
                    <Table.Cell key={column}>
                      {isEditing && column !== 'id' && column !== '_id' ? (
                        (() => {
                          const meta = columnMeta.find(m => m.column_name === column);
                          if (meta?.enum_values?.length) {
                            const options = meta.enum_values.map(v => ({ key: v, text: v, value: v }));
                            return (
                              <Form.Select
                                options={options}
                                value={editData[column] ?? ''}
                                onChange={(e, { value }) => setEditData({ ...editData, [column]: value })}
                                className="edit-input"
                              />
                            );
                          }

                          return (
                            <Form.Input
                              value={editData[column] || ''}
                              onChange={(e, { value }) => setEditData({ ...editData, [column]: value })}
                              className="edit-input"
                            />
                          );
                        })()
                      ) : (
                        <span className="cell-content">{String(row[column])}</span>
                      )}
                    </Table.Cell>
                  ))}
                  <Table.Cell className="actions-column">
                    {isEditing ? (
                      <div className="action-buttons">
                        <Button icon size="small" onClick={() => handleSave(rowId)}><Icon name="check" /></Button>
                        <Button icon size="small" onClick={() => { setEditingRow(null); setEditData({}); }}><Icon name="close" /></Button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <Button size="small" aria-label={`Edit row ${rowId}`} onClick={() => handleEdit(row)}>Edit</Button>
                        <Button negative size="small" aria-label={`Delete row ${rowId}`} onClick={() => handleDelete(rowId)}>Delete</Button>
                      </div>
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </div>

      <div className="table-pagination">
        <Button onClick={prevPage} disabled={pagination.offset === 0}>← Previous</Button>
        <span className="pagination-info">
          Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.count)} of {pagination.count}
        </span>
        <Button onClick={nextPage} disabled={pagination.offset + pagination.limit >= pagination.count}>Next →</Button>
      </div>
    </div>
  );
}

export default TableView;
