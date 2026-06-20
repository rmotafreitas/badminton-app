import React from "react";

export interface Column<T> {
  header: string;
  accessor: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  title: string;
  titleIcon?: string;
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
}

export function Table<T extends { id?: string }>({
  title,
  titleIcon,
  columns,
  data,
  loading = false,
  emptyMessage = "No data found.",
  loadingMessage = "Loading...",
}: TableProps<T>) {
  return (
    <div className="card has-table">
      <header className="card-header">
        <p className="card-header-title">
          {titleIcon && <span className="icon"><i className={`mdi ${titleIcon}`}></i></span>}
          {title}
        </p>
      </header>
      <div className="card-content">
        {loading ? (
          <div className="p-4 text-center">{loadingMessage}</div>
        ) : data.length === 0 ? (
          <div className="p-4 text-center text-gray-500">{emptyMessage}</div>
        ) : (
          <table>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i} className={col.headerClassName}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr key={row.id ?? rowIndex}>
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} className={col.className}>
                      {typeof col.accessor === "function"
                        ? (col.accessor(row, rowIndex) as React.ReactNode)
                        : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
