import React from "react";
import { useDictionary } from "@/i18n";

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
  /** When provided, renders a Refresh button in the header top-right. */
  refetch?: () => void;
  /** Shows a spinning state on the refresh icon. */
  isFetching?: boolean;
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
  refetch,
  isFetching = false,
}: TableProps<T>) {
  const common = useDictionary().common;

  return (
    <div className="card has-table">
      <header className="card-header">
        <p className="card-header-title">
          {titleIcon && <span className="icon"><i className={`mdi ${titleIcon}`}></i></span>}
          {title}
        </p>
        {refetch && (
          <button
            type="button"
            className="card-header-icon button small light"
            onClick={refetch}
            disabled={isFetching}
            title={common.refresh}
            aria-label={common.refresh}
          >
            <span className="icon">
              <i className={`mdi mdi-reload ${isFetching ? "animate-spin" : ""}`}></i>
            </span>
            <span className="hidden sm:inline">{common.refresh}</span>
          </button>
        )}
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
