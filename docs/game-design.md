# Game design

## Shots and decisions

| Shot  | Input / AI context                                             | Reward                                       | Risk                           |
| ----- | -------------------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| Dink  | Assisted soft/low contact near the kitchen (see below)         | Low short bounce, safe margin                | Gives a forward opponent time  |
| Drive | Medium/hard swing                                              | Fast pressure                                | Hard drives widen dispersion   |
| Drop  | Assisted soft/low contact from deep; legacy keyboard D + swing | High arc into kitchen                        | Slow flight can be attacked    |
| Lob   | Swipe up on Swing; optional Lob chip; legacy Shift             | High deep landing against a forward opponent | Short lob invites smash        |
| Smash | Hard swing above 1.8 m                                         | Quick downward pressure                      | Requires a high reachable ball |

Assisted trajectories select a target and clear the net. They do not trigger a swing, move the opponent, or guarantee that a late/hard shot stays in bounds. The existing two-bounce and kitchen rules still apply.

## Timing

The ideal paddle plane is 0.95 m. A local estimate of arrival uses the contact height and vertical velocity, then accounts for the age of the phone peak (clock corrected and capped at 200 ms). Perfect is ±45 ms; Good is ±120 ms; everything else is Late (including very early inputs). The 200 ms swing buffer remains.

Perfect has narrow dispersion and a 4.5% power bonus. Good keeps normal power. Late drops power to 78% and adds lateral error. Average timing in the result card is absolute milliseconds from that plane; it is a game statistic, not a network latency measurement.

## Position and spin

The two-thumb phone controller positions the player automatically. Recovery settles at 2.6 m from the net after a dink or drop, and 5.8 m after a lob, drive, or smash. A serve recovers to 4.6 m. When receiving a ball on the player side (z > -0.7 m), ball depth takes priority: target depth is abs(ball.z), plus 1.0 m before the bounce, clamped to 2.4–7.3 m. Feet therefore remain outside the 2.1336 m kitchen line. Existing lateral ball tracking, player speed, two-bounce rules, and volley restrictions remain in force.

Legacy Arrow up / down and old phone intent values still select forward / retreat intent; neutral settles at midcourt. The optional assisted flag enables the new rules per swing; omitted or false retains legacy behavior. Auto footwork still moves toward the incoming ball but keeps volleys outside the kitchen. Forehand defaults to light topspin, backhand to underspin; X + Space selects underspin on keyboard. Angular velocity is set on the Rapier ball and the bounce receives a bounded tangential/lift correction so plastic-ball spin is legible at browser scale.

## Rivals

`web/src/game/rivals.json` owns shot weights, reaction, dispersion, preferred depth, pressure mistakes, palette, hats and quips. Pip is balanced. Rocket favors drives and makes more long-rally errors. Mabel waits near the kitchen and retreats slower against lobs. June mixes drops with fast pressure and is the club boss. Difficulty still independently controls movement and base reactions.

Three consecutive player wins increase AI pace/reduce reaction delay by 8%; three losses ease it by 10%. Mixed results restore baseline. This adjustment never changes sensor thresholds. Adaptation is session-local and is not shown in the HUD.

Statistics are match-local: longest rally, forced missed/double-bounce winners, player faults, and timing average. Lifetime rally best remains separate.

## Contact feedback

Solid contacts stop physics for 60 ms; perfect contacts for 75 ms. Rendering and input collection continue. A 32-particle pool supplies court dust and perfect-hit sparks, with a small ring at contact, ball squash, recoil and power-scaled camera shake. Reduced motion disables particles, shake and squash. Hats distinguish cap/visor/sunhat/headband variants; ready anticipation and win/loss poses use procedural joints.

The camera follows lateral movement gently, widens on impact and tightens at match point. The optional replay camera is deferred: readable live play and contact correctness take priority over a second timeline.

## Two-thumb phone controller

Landscape is the primary layout; portrait uses the same two controls without an orientation lock or rotation gate. Left-handed mode swaps the Aim and Swing zones. Default rallies expose only Aim and Swing, plus 64 px pause/settings icons. Pausing removes both play controls and displays Resume and Back to clubhouse. Settings pause an active match and keep it paused after closing.

Aim uses horizontal displacement relative to where the thumb first touches, scaled so 35% of the zone width reaches full aim. Releasing the thumb returns aim exponentially to zero with a 180 ms time constant; reduced motion returns directly. Independent pointer IDs allow aiming with one finger while charging with another. Pointer cancellation, lost capture, backgrounding, and pause discard the charge without sending a shot.

Swing taps up to 140 ms send medium power (0.55). Longer presses map linearly from 0.55 at 140 ms to 1.0 at 700 ms; power is capped at 1.0. Shots send on release, using the existing phone timestamp. An upward movement of at least 44 CSS px, larger than horizontal displacement, latches a lob for that gesture. The optional Lob chip is disabled by default, is available in Settings, and applies to the next touch shot. Click-only accessibility activation sends a medium shot; compatibility clicks after pointer release are suppressed.

The host chooses assisted soft shots using the **pre-timing** input power and contact position. A power below 0.35 is soft. Medium power up to 0.60 is also soft when the ball is at or below 1.20 m. A soft contact within kitchen + 1.0 m (3.1336 m from the net) is a dink; a soft contact farther back is a drop. Other contacts retain drive/smash selection. An explicit lob takes priority, then the legacy drop override. The serve remains its existing legal serve trajectory. This makes a medium tap on a low ball useful for short play, while charging creates a deep drive; no extra drop target is needed.

Motion permission is requested only from the enable action. Granted motion hides Aim and uses screen-relative tilt; both physical swings and the Swing button remain usable. Calibration takes three gentle forehand swings, and settings retain sensitivity, handedness, haptics, paddle skin, touch fallback, and recalibration. Motion updates use refs and imperative animation rather than React renders. Touch pose traffic is limited to approximately 30 Hz; swing release sends immediately.

### Protocol compatibility

All existing event names and required fields are preserved. `input:swing` adds only `assisted?: boolean`. New controllers send true and omit legacy drop/intent fields; legacy controllers and keyboards keep working unchanged. Older relays can ignore the extra field and still accept the shot, although they do not enable the new assistance. Existing host haptic patterns remain hit [22], perfect [12,18,25], fault [65], and point win [20,35,20]. A perfect contact also flashes the Swing ring. Unsupported vibration is a no-op.

### Real-device verification

Automated Chromium/WebKit checks validate layout, pointer handling, protocol delivery, mocked permission flows, wake-lock reacquisition, and feedback. Physical iPhone sensor accuracy in both landscape directions and portrait, native motion permission behavior, vibration availability, end-to-end Wi-Fi latency, notch/home-indicator insets, and installed Home Screen wake-lock behavior remain **unverified on a real device**.
