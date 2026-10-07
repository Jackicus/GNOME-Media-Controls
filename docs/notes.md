# Measurements behind the code

What the code keeps because something was seen to go wrong without it. The
machine was not recorded for either; both are behaviour of VLC and of
Clutter's easing, not of a GPU.

## VLC announces each seek twice (`mpris.js` `SEEK_SETTLE`)

VLC sends `Seeked` for a seek, then again about 150 ms later. In a run of
seeks (a held pad button, a fast scroll) the second one arrives after the next
seek has gone, and taken as read it pulled the position back, wasting every
other seek. For a second after a seek of ours, a reading nearer where it
jumped from than where it went is dropped (`Player.reading`; commit 285a995).

## The fade-in stalls if restarted (`bar.js` `reveal`)

The pointer watcher asks for the bar every 100 ms while the pointer moves.
Restarting the 200 ms ease each time kept it from settling: the opacity stuck
at 254, rounded down, and the bar never finished arriving. `reveal()` returns
early while the bar is arriving or shown (`_shown`; commit 4ce0db0).

## Focus ring and slider fill against the panel (`stylesheet.css`)

Measured in the nested shell (Shell 50.5, GTX 1080 desktop) on the panel's
`#2e2e33`, with WCAG's contrast ratio; 3:1 is the floor for a focus indicator.
The plain accent as the 2 px ring and the slider fill: blue 3.58, teal 3.60,
green 3.55, yellow 4.49, orange 3.92, red 3.10, pink 3.86, purple 2.29, slate
3.45. The ring is now the theme's own focus colour, `st-mix(accent, white,
60%)`: blue 6.33, red 5.29, purple 5.05, yellow 7.12. The fill is
`st-mix(accent, white, 80%)`, which keeps it the accent: blue 4.76, red 3.90,
purple 3.39, yellow 5.64. The focused slider handle, `st-lighten(accent, 25%)`,
was already 5.58 for purple.
