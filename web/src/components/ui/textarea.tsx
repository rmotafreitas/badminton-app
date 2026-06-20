import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  help?: string;
}

export function Textarea({ label, help, className = "", ...props }: TextareaProps) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <div className="control">
        <textarea className={`textarea ${className}`} {...props} />
      </div>
      {help && <p className="help">{help}</p>}
    </div>
  );
}
