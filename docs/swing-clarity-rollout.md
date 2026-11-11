# Swing clarity: implementation and rollout

The implementation follows the existing game layout in `web/src/game`, `web/src/screen`, and `web/src/controller`. It adds no packages and keeps the existing shot solver, physics, scoring and automatic footwork.

## Configuration and rollout

`config/readiness.json` owns reach, cooldowns, the 80 ms input buffer, hysteresis, fault-card duration, practice delays and haptic durations. `config/copy.en.json` supplies the new runtime copy. This repository calls Normal difficulty `medium`, so the config uses that existing key. Pip is an existing rival rather than a selectable player avatar; the rollout and reach-bonus key follow that existing rival selection.

`readiness_v2` defaults on for Pip + Easy and off for other matchups. To test all combinations, run this in the laptop browser and start a new match:

```js
localStorage.setItem('dink-clarity', JSON.stringify({
  ...JSON.parse(localStorage.getItem('dink-clarity') || '{}'),
  readiness_v2: true
}));
```

Set it to `false` for the legacy control or remove only that property to restore cohort defaults. The replay action opts the current practice run into readiness without changing the stored override. Reach tuning applies to actual human hit validation and the ring together; the AI keeps its existing contact window and behavior.

Help text follows the active cohort: disabled cohorts receive timing and proximity guidance without references to an unavailable ring. Both versions lead with the automatic-footwork mental model. Fault copy is also carried in the phase message so the phone can show the same explanation.

The explicit priority in the spec wins over its inconsistent sample evaluator: kitchen warnings precede the two-bounce warnings. Rule warnings apply within the preparation radius. Pressing in a warning state invokes the referee immediately, even outside the smaller legal-hit radius, as specified by the input event flow and property test. Display hysteresis never changes the physical hit check.

GET_READY presses wait up to 80 ms for a legal contact. A pending press cannot be extended by mashing. If the window expires, it becomes a whiff with animation, swish, explanation, and the configured cooldown. WAIT states never buffer. Other out-of-reach presses whiff immediately. Legacy cohorts keep their existing input behavior.

## Practice and feedback

First-time keyboard Pip + Easy quick matches run five lessons: automatic footwork, green-ring timing, intentional whiff, serving followed by the first-return bounce, and two shots aimed to the same side. The ball machine uses the existing solver with deterministic feeds instead of AI decisions. Misses repeat the lesson without changing the match score. Twenty-second hint timers show a larger coach line and an arrow at the ring. The timers stop while paused.

Passed steps persist as the JSON array at `tutorial.completedSteps`. Skipping sets `dink-practice-skipped` without marking unpassed lessons complete. Replay starts from lesson one. Storage failures are harmless. Completion starts a fresh match at 0–0.

The laptop publishes sequenced `game:readiness` messages on changes and at 10 Hz. The relay validates the message and accepts it only from the room host. The phone drops old/duplicate sequence numbers, updates its tappable Swing button, and provides optional entry haptics. A 120 ms latency badge uses the existing RTT measurement. Keyboard and phone inputs have separate sequence tracking so keyboard fallback continues to work after controller loss.

High Contrast Ring, Reduce motion, Swing cue sound, Minimal swing HUD, and Hide ring on Hard work through Settings. Rule blocks have labels and distinct shapes; green entry plays at most one sound per incoming shot. Fault explanations freeze the court for 1.2 seconds with a fade and mark the net, landing, bounce positions, hit location or kitchen. Next point cannot skip this explanation.

## Telemetry and release gates

Existing analytics consent remains off by default. Opting in records `whiff`, `fault`, `swing_in_reach`, `tutorial_step`, and `first_rally_complete`, including the specified fields and a random session ID. Events stay on this device in a bounded 200-event log at `dink-clarity-events`; counters retain `dink-metrics`. There is no telemetry service or remote dashboard in this repository, so none is created or contacted. Clear local counters in Settings clears both logs.

For local inspection while analytics is enabled:

```js
console.table(JSON.parse(localStorage.getItem('dink-clarity-events') || '[]'));
```

Automated verification covers all evaluator states, 10,000 generated referee comparisons, hysteresis, sync sequencing/keepalives, relay validation/host authorization, whiff cooldowns, buffer acceptance/expiry, pause and fault timers, keyboard fallback, persistent practice progress, and all five lessons with real physics. Browser checks cover first-run/skip/replay/settings and phone mirroring/tappability.

Before broadening the flag, still perform physical-phone haptic/latency testing, twenty keyboard points on Pip + Easy, the five-person first-time usability test, and the spec's one-week cohort comparison. Remote-dashboard verification, success-metric comparisons, and rollout approval are release activities; automated tests cannot establish those results. No external store page is present; the in-game help, pause help, phone instructions and repository Play instructions are updated.
