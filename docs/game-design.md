# Game design

## Shots and decisions
| Shot | Input / AI context | Reward | Risk |
|---|---|---|---|
| Dink | Soft swing below 35% | Low short bounce, safe margin | Gives a forward opponent time |
| Drive | Medium/hard swing | Fast pressure | Hard drives widen dispersion |
| Drop | Hold D + swing; phone DROP | High arc into kitchen | Slow flight can be attacked |
| Lob | Hold LOB / Shift | High deep landing against a forward opponent | Short lob invites smash |
| Smash | Hard swing above 1.8 m | Quick downward pressure | Requires a high reachable ball |

Assisted trajectories select a target and clear the net. They do not trigger a swing, move the opponent, or guarantee that a late/hard shot stays in bounds. The existing two-bounce and kitchen rules still apply.

## Timing
The ideal paddle plane is 0.95 m. A local estimate of arrival uses the contact height and vertical velocity, then accounts for the age of the phone peak (clock corrected and capped at 200 ms). Perfect is ±45 ms; Good is ±120 ms; everything else is Late (including very early inputs). The 200 ms swing buffer remains.

Perfect has narrow dispersion and a 4.5% power bonus. Good keeps normal power. Late drops power to 78% and adds lateral error. Average timing in the result card is absolute milliseconds from that plane; it is a game statistic, not a network latency measurement.

## Position and spin
Arrow up / down select forward / retreat intent; neutral settles at midcourt. Motion forward/back tilt and the phone ADVANCE hold use the same normalized intent. Auto footwork still moves toward the incoming ball but keeps volleys outside the kitchen. Forehand defaults to light topspin, backhand to underspin; X + Space selects underspin on keyboard. Angular velocity is set on the Rapier ball and the bounce receives a bounded tangential/lift correction so plastic-ball spin is legible at browser scale.

## Rivals
`web/src/game/rivals.json` owns shot weights, reaction, dispersion, preferred depth, pressure mistakes, palette, hats and quips. Pip is balanced. Rocket favors drives and makes more long-rally errors. Mabel waits near the kitchen and retreats slower against lobs. June mixes drops with fast pressure and is the club boss. Difficulty still independently controls movement and base reactions.

Three consecutive player wins increase AI pace/reduce reaction delay by 8%; three losses ease it by 10%. Mixed results restore baseline. This adjustment never changes sensor thresholds. Adaptation is session-local and is not shown in the HUD.

Statistics are match-local: longest rally, forced missed/double-bounce winners, player faults, and timing average. Lifetime rally best remains separate.
