import React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  help?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, help, options, placeholder, className = "", ...props }: SelectProps) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <div className="control">
        <div className="select">
          <select className={`${className}`} {...props}>
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {help && <p className="help">{help}</p>}
    </div>
  );
}
