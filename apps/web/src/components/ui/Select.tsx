import { useId } from "react";
import type { ChangeEventHandler } from "react";
import styles from "./Select.module.css";

interface SelectProps {
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled = false,
  className,
}: SelectProps) {
  const generatedId = useId();
  const selectId = `select-${generatedId}`;

  const wrapperClassNames = [styles.wrapper, className ?? ""].filter(Boolean).join(" ");
  const selectClassNames = [styles.select, error ? styles.error : ""].filter(Boolean).join(" ");

  return (
    <div className={wrapperClassNames}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={selectClassNames}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className={styles.errorMessage}>
          {error}
        </span>
      )}
    </div>
  );
}

export { Select };
export type { SelectProps };
