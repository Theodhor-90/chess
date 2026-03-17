import { useId } from "react";
import type { ChangeEventHandler } from "react";
import styles from "./Input.module.css";

interface InputProps {
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
}

function Input({
  label,
  name,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  type = "text",
  className,
}: InputProps) {
  const generatedId = useId();
  const inputId = `input-${generatedId}`;

  const wrapperClassNames = [styles.wrapper, className ?? ""].filter(Boolean).join(" ");
  const inputClassNames = [styles.input, error ? styles.error : ""].filter(Boolean).join(" ");

  return (
    <div className={wrapperClassNames}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClassNames}
      />
      {error && (
        <span role="alert" className={styles.errorMessage}>
          {error}
        </span>
      )}
    </div>
  );
}

export { Input };
export type { InputProps };
