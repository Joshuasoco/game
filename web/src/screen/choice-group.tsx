import { useId } from "react";

/** Native radios retain arrow-key navigation, Space selection and form semantics. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; caption?: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="choice-group">
      <legend>{label}</legend>
      <div className="choice-options">
        {options.map((option) => (
          <label className="choice-option" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <b>{option.label}</b>
              {option.caption && <small>{option.caption}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
