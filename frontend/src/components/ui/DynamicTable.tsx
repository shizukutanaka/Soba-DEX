import React, { useState, useMemo, useCallback } from 'react';
import '../../styles/dynamic-table.css';

export interface TableColumn<T = any> {
  key: keyof T | string;
  title: string;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  sorter?: (a: T, b: T) => number;
}

export interface DynamicTableProps<T = any> {
  /** Table data */
  data: T[];
  /** Table columns configuration */
  columns: TableColumn<T>[];
  /** Loading state */
  loading?: boolean;
  /** Empty state content */
  emptyText?: string;
  /** Row selection */
  rowSelection?: {
    selectedRowKeys: (string | number)[];
    onChange: (selectedRowKeys: (string | number)[], selectedRows: T[]) => void;
  };
  /** Pagination configuration */
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    showSizeChanger?: boolean;
    pageSizeOptions?: string[];
    onChange: (page: number, pageSize: number) => void;
  };
  /** Sorting configuration */
  sortConfig?: {
    key: string;
    direction: 'asc' | 'desc';
  };
  /** Filter configuration */
  filters?: Record<string, any>;
  /** Row key generator */
  rowKey?: (record: T, index: number) => string | number;
  /** Custom class name */
  className?: string;
}

/**
 * Dynamic Table component following Atlassian Design System principles
 * - Advanced data display with sorting, filtering, pagination
 * - Accessible keyboard navigation
 * - Customizable columns and rendering
 */
export function DynamicTable<T = any>({
  data,
  columns,
  loading = false,
  emptyText = 'No data available',
  rowSelection,
  pagination,
  sortConfig,
  filters = {},
  rowKey = (record, index) => index,
  className = ''
}: DynamicTableProps<T>) {
  const [internalSortConfig, setInternalSortConfig] = useState(sortConfig);
  const [internalFilters, setInternalFilters] = useState(filters);

  // Handle sorting
  const handleSort = useCallback((column: TableColumn<T>) => {
    if (!column.sortable) return;

    const key = String(column.key);
    const newDirection = internalSortConfig?.key === key && internalSortConfig.direction === 'asc' ? 'desc' : 'asc';

    setInternalSortConfig({ key, direction: newDirection });
  }, [internalSortConfig]);

  // Handle filtering
  const handleFilter = useCallback((columnKey: string, value: any) => {
    setInternalFilters(prev => ({
      ...prev,
      [columnKey]: value
    }));
  }, []);

  // Process data with sorting and filtering
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply filters
    Object.entries(internalFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        result = result.filter(item => {
          const itemValue = (item as any)[key];
          if (typeof value === 'string') {
            return String(itemValue).toLowerCase().includes(value.toLowerCase());
          }
          return itemValue === value;
        });
      }
    });

    // Apply sorting
    if (internalSortConfig) {
      const column = columns.find(col => String(col.key) === internalSortConfig.key);
      if (column?.sorter) {
        result.sort(column.sorter);
      } else {
        result.sort((a, b) => {
          const aValue = (a as any)[internalSortConfig.key];
          const bValue = (b as any)[internalSortConfig.key];

          if (aValue < bValue) return internalSortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return internalSortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      if (internalSortConfig.direction === 'desc') {
        result.reverse();
      }
    }

    return result;
  }, [data, columns, internalFilters, internalSortConfig]);

  // Pagination
  const paginatedData = useMemo(() => {
    if (!pagination) return processedData;

    const { current, pageSize } = pagination;
    const startIndex = (current - 1) * pageSize;
    return processedData.slice(startIndex, startIndex + pageSize);
  }, [processedData, pagination]);

  // Handle row selection
  const handleRowSelect = useCallback((record: T, checked: boolean) => {
    if (!rowSelection) return;

    const key = rowKey(record, 0);
    let newSelectedKeys = [...rowSelection.selectedRowKeys];

    if (checked) {
      if (!newSelectedKeys.includes(key)) {
        newSelectedKeys.push(key);
      }
    } else {
      newSelectedKeys = newSelectedKeys.filter(k => k !== key);
    }

    const selectedRows = data.filter(item => newSelectedKeys.includes(rowKey(item, 0)));
    rowSelection.onChange(newSelectedKeys, selectedRows);
  }, [rowSelection, rowKey, data]);

  // Handle select all
  const handleSelectAll = useCallback((checked: boolean) => {
    if (!rowSelection) return;

    const newSelectedKeys = checked ? paginatedData.map((record, index) => rowKey(record, index)) : [];
    const selectedRows = checked ? paginatedData : [];
    rowSelection.onChange(newSelectedKeys, selectedRows);
  }, [rowSelection, paginatedData, rowKey]);

  const tableClass = [
    'atlas-dynamic-table',
    className
  ].filter(Boolean).join(' ');

  const isAllSelected = rowSelection && paginatedData.length > 0 &&
    paginatedData.every((record, index) => rowSelection.selectedRowKeys.includes(rowKey(record, index)));
  const isIndeterminate = rowSelection && rowSelection.selectedRowKeys.length > 0 && !isAllSelected;

  return (
    <div className={tableClass}>
      <div className="atlas-dynamic-table__container" role="table" aria-label="Data table">
        {/* Table Header */}
        <div className="atlas-dynamic-table__header" role="rowgroup">
          <div className="atlas-dynamic-table__row" role="row">
            {rowSelection && (
              <div className="atlas-dynamic-table__cell atlas-dynamic-table__cell--selection" role="columnheader">
                <label className="atlas-checkbox">
                  <input
                    type="checkbox"
                    checked={!!isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !!isIndeterminate;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="Select all rows"
                  />
                  <span className="atlas-checkbox__checkmark" aria-hidden="true" />
                </label>
              </div>
            )}

            {columns.map((column, index) => {
              const isSorted = internalSortConfig?.key === String(column.key);
              const sortDirection = isSorted ? internalSortConfig.direction : null;

              return (
                <div
                  key={String(column.key)}
                  className={`atlas-dynamic-table__cell atlas-dynamic-table__cell--header ${column.sortable ? 'atlas-dynamic-table__cell--sortable' : ''}`}
                  role="columnheader"
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column)}
                  tabIndex={column.sortable ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (column.sortable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleSort(column);
                    }
                  }}
                  aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <div className="atlas-dynamic-table__cell-content">
                    {column.title}
                    {column.sortable && (
                      <span className="atlas-dynamic-table__sort-icon" aria-hidden="true">
                        {isSorted && sortDirection === 'asc' && '↑'}
                        {isSorted && sortDirection === 'desc' && '↓'}
                        {!isSorted && '↕'}
                      </span>
                    )}
                  </div>

                  {column.filterable && (
                    <div className="atlas-dynamic-table__filter">
                      <input
                        type="text"
                        placeholder={`Filter ${column.title.toLowerCase()}`}
                        value={internalFilters[String(column.key)] || ''}
                        onChange={(e) => handleFilter(String(column.key), e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="atlas-input atlas-input--sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Table Body */}
        <div className="atlas-dynamic-table__body" role="rowgroup">
          {loading ? (
            <div className="atlas-dynamic-table__loading">
              <div className="atlas-skeleton-table">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="atlas-skeleton-table__row">
                    {columns.map((_, colIndex) => (
                      <div key={colIndex} className="atlas-skeleton" style={{ height: '16px', margin: '8px 0' }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="atlas-dynamic-table__empty" role="row">
              <div className="atlas-dynamic-table__cell" role="cell">
                <div className="atlas-empty-state">
                  <div className="atlas-empty-state__content">
                    <p className="atlas-empty-state__description">{emptyText}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            paginatedData.map((record, rowIndex) => {
              const rowKeyValue = rowKey(record, rowIndex);
              const isSelected = rowSelection?.selectedRowKeys.includes(rowKeyValue);

              return (
                <div
                  key={rowKeyValue}
                  className={`atlas-dynamic-table__row ${isSelected ? 'atlas-dynamic-table__row--selected' : ''}`}
                  role="row"
                >
                  {rowSelection && (
                    <div className="atlas-dynamic-table__cell atlas-dynamic-table__cell--selection" role="cell">
                      <label className="atlas-checkbox">
                        <input
                          type="checkbox"
                          checked={!!isSelected}
                          onChange={(e) => handleRowSelect(record, e.target.checked)}
                          aria-label={`Select row ${rowIndex + 1}`}
                        />
                        <span className="atlas-checkbox__checkmark" aria-hidden="true" />
                      </label>
                    </div>
                  )}

                  {columns.map((column, colIndex) => {
                    const value = (record as any)[column.key];
                    const renderedValue = column.render ? column.render(value, record, rowIndex) : value;

                    return (
                      <div
                        key={String(column.key)}
                        className="atlas-dynamic-table__cell"
                        role="cell"
                        style={{ width: column.width }}
                      >
                        {renderedValue}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination && processedData.length > pagination.pageSize && (
        <div className="atlas-dynamic-table__pagination">
          <div className="atlas-dynamic-table__pagination-info">
            Showing {((pagination.current - 1) * pagination.pageSize) + 1} to {Math.min(pagination.current * pagination.pageSize, processedData.length)} of {processedData.length} entries
          </div>

          <div className="atlas-dynamic-table__pagination-controls">
            {pagination.showSizeChanger && (
              <select
                value={pagination.pageSize}
                onChange={(e) => pagination.onChange(1, Number(e.target.value))}
                className="atlas-select atlas-select--sm"
              >
                {(pagination.pageSizeOptions || ['10', '25', '50', '100']).map(size => (
                  <option key={size} value={size}>{size} per page</option>
                ))}
              </select>
            )}

            <button
              className="atlas-button atlas-button--sm atlas-button--ghost"
              disabled={pagination.current === 1}
              onClick={() => pagination.onChange(pagination.current - 1, pagination.pageSize)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="atlas-dynamic-table__pagination-current">
              Page {pagination.current} of {Math.ceil(processedData.length / pagination.pageSize)}
            </span>

            <button
              className="atlas-button atlas-button--sm atlas-button--ghost"
              disabled={pagination.current === Math.ceil(processedData.length / pagination.pageSize)}
              onClick={() => pagination.onChange(pagination.current + 1, pagination.pageSize)}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DynamicTable;
