import { useEffect, useRef, useState, type ComponentProps } from 'react';

type SearchInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'onCompositionStart' | 'onCompositionEnd'
> & {
  value: string;
  onValueChange: (value: string) => void;
};

// URL updates replace the browser's active composition range. Keep intermediate
// IME text local until the user commits a candidate.
export function SearchInput({
  value,
  onValueChange,
  ...props
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current) setDraft(value);
  }, [value]);
  return (
    <input
      {...props}
      value={draft}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        const next = event.currentTarget.value;
        setDraft(next);
        onValueChange(next);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        if (!composing.current) onValueChange(next);
      }}
    />
  );
}
