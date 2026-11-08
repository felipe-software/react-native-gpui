import { useEffect, useState } from "react";
import { TextField } from "../common/TextField";

type Props = { testID: string; value: number; min: number; max: number; onChange: (value: number) => void };

export function NumberField({ testID, value, min, max, onChange }: Props) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);
    const commit = () => {
        const parsed = Number.parseInt(text, 10);
        if (!Number.isFinite(parsed)) {
            setText(String(value));
            return;
        }
        const clamped = Math.min(max, Math.max(min, parsed));
        setText(String(clamped));
        if (clamped !== value) onChange(clamped);
    };
    const change = (next: string) => {
        setText(next);
        const parsed = Number.parseInt(next, 10);
        const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;
        if (valid && parsed !== value) onChange(parsed);
    };
    return <TextField testID={testID} value={text} width={90} onChange={change} onSubmit={commit} />;
}
