import { useEffect, useState } from "react";
import type { Store } from "../../data/api";

export function useStore<T>(store: Store<T>): T {
    const [value, setValue] = useState(() => store.get());
    useEffect(() => {
        setValue(store.get());
        return store.subscribe(setValue);
    }, [store]);
    return value;
}
