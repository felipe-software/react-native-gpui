import { createContext } from "react";

export type WindowContextValue = {
    windowId: number;
    width: number;
    height: number;
    focused: boolean;
};

export const WindowContext = createContext<WindowContextValue | null>(null);
