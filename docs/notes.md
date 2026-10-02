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
