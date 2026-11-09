import { useEffect, useRef, useState } from "react";
import type { MouseResponderEvent } from "react-native-gpui";

const TICK_MS = 20;
const HOVER_IN = 0.5;
const HOVER_OUT = 0.3;
const RIPPLE_HELD = 0.02;
const RIPPLE_RELEASED = 0.07;

export type Point = { x: number; y: number };
export type Ripple = { id: number; x: number; y: number; progress: number };

export type ButtonEffect = {
    hovered: boolean;
    factor: number;
    pointer: Point;
    ripples: Ripple[];
    enter: (event: MouseResponderEvent) => void;
    move: (event: MouseResponderEvent) => void;
    leave: () => void;
    press: (event: MouseResponderEvent) => void;
    release: () => void;
};

function local(event: MouseResponderEvent): Point {
    return { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
}

export function stepHover(factor: number, hovered: boolean): number {
    if (hovered) return Math.min(1, factor + HOVER_IN);
    return Math.max(0, factor - HOVER_OUT);
}

export function stepRipples(ripples: Ripple[], held: boolean): Ripple[] {
    const step = held ? RIPPLE_HELD : RIPPLE_RELEASED;
    return ripples.map((ripple) => ({ ...ripple, progress: ripple.progress + step })).filter((ripple) => ripple.progress < 1);
}

export function useButtonEffect(enabled = true): ButtonEffect {
    const [hovered, setHovered] = useState(false);
    const [factor, setFactor] = useState(0);
    const [pointer, setPointer] = useState<Point>({ x: 0, y: 0 });
    const [ripples, setRipples] = useState<Ripple[]>([]);
    const held = useRef(false);
    const nextId = useRef(0);
    const target = enabled && hovered ? 1 : 0;
    const animating = factor !== target || ripples.length > 0;

    useEffect(() => {
        if (!animating) return;
        const timer = setTimeout(() => {
            setFactor((current) => stepHover(current, target === 1));
            setRipples((current) => stepRipples(current, held.current));
        }, TICK_MS);
        return () => clearTimeout(timer);
    }, [animating, factor, ripples, target]);

    return {
        hovered,
        factor,
        pointer,
        ripples,
        enter: (event) => {
            setHovered(true);
            setPointer(local(event));
        },
        move: (event) => setPointer(local(event)),
        leave: () => {
            setHovered(false);
            held.current = false;
        },
        press: (event) => {
            if (!enabled || event.nativeEvent.pressDrag) return;
            held.current = true;
            nextId.current += 1;
            const at = local(event);
            setRipples((current) => [...current, { id: nextId.current, x: at.x, y: at.y, progress: 0 }]);
        },
        release: () => {
            held.current = false;
        },
    };
}
