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
  /** Optional skeleton rows to render instead of the plain loading text. */
  skeletonRows?: React.ReactNode;
}

export function Table<T extends { id?: string }>({
  title,
  titleIcon,
  columns,
  data,
  loading = false,
  emptyMessage = "No data found.",
  loadingMessage = "Loading...",
  skeletonRows,
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
          skeletonRows ? (
            <table>
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} className={col.headerClassName}>{col.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{skeletonRows}</tbody>
            </table>
          ) : (
            <div className="p-4 text-center">{loadingMessage}</div>
          )
        ) : data.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">{emptyMessage}</div>
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
