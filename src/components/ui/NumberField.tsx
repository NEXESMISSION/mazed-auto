"use client";

import * as React from "react";
import { Input, type InputProps } from "./Input";

interface Props extends Omit<InputProps, "value" | "onChange" | "type"> {
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  /** Allow decimals. Default false (integer-only). */
  decimal?: boolean;
}

/**
 * Number input that doesn't trap a stale "0" in the field. Internally tracks
 * the raw string so backspacing the last digit clears the field instead of
 * collapsing to 0 — which used to cause "070000" when the user typed after
 * deleting. Strips leading zeros so "07" normalizes to "7".
 */
export const NumberField = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, decimal = false, ...rest }, ref) => {
    const [raw, setRaw] = React.useState<string>(
      value === null || value === undefined ? "" : String(value),
    );

    React.useEffect(() => {
      const parsed = raw === "" ? undefined : Number(raw);
      const incomingNorm = value === null ? undefined : value;
      if ((parsed ?? null) !== (incomingNorm ?? null)) {
        setRaw(incomingNorm === undefined ? "" : String(incomingNorm));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      let v = e.target.value;
      v = decimal ? v.replace(/[^\d.]/g, "") : v.replace(/\D/g, "");
      if (decimal) {
        const firstDot = v.indexOf(".");
        if (firstDot !== -1) {
          v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
        }
        v = v.replace(/^0+(?=\d)/, "");
      } else {
        v = v.replace(/^0+(?=\d)/, "");
      }
      setRaw(v);
      if (v === "" || v === ".") {
        onChange(undefined);
      } else {
        const n = Number(v);
        if (!Number.isNaN(n)) onChange(n);
      }
    }

    return (
      <Input
        ref={ref}
        {...rest}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={raw}
        onChange={handleChange}
      />
    );
  },
);
NumberField.displayName = "NumberField";
