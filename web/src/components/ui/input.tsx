import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  help?: string;
  iconLeft?: string;
  iconRight?: string;
}

export function Input({ label, help, iconLeft, iconRight, className = "", ...props }: InputProps) {
  const iconClasses = [
    iconLeft && "icons-left",
    iconRight && "icons-right",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <div className={`control ${iconClasses}`}>
        <input className={`input ${className}`} {...props} />
        {iconLeft && (
          <span className="icon left"><i className={`mdi ${iconLeft}`}></i></span>
        )}
        {iconRight && (
          <span className="icon right"><i className={`mdi ${iconRight}`}></i></span>
        )}
      </div>
      {help && <p className="help">{help}</p>}
    </div>
  );
}
