// The only durations and curves in use: the shell's ease-out-quad, within its 100–250 ms.

import Clutter from 'gi://Clutter';

export const Duration = {
    FAST: 120,     // things leaving
    NORMAL: 200,   // things arriving
};

export const Ease = {
    OUT: Clutter.AnimationMode.EASE_OUT_QUAD,
};

// Logical px the bar rises as it fades in.
export const RISE = 8;
