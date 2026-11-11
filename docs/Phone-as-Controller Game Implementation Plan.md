# Phone-as-Controller Game: Implementation Plan

Nov 11, 2026 · @Joshua Co

## 1. Concept

Build a solo 3D pickleball game, working title **Dink Duel**: the laptop shows a 3D court with an AI opponent, and your phone is the paddle. Swing the phone to hit the ball; swing speed sets the power and the phone's tilt at impact sets the direction.

**Why it fits a phone controller**

- Phone-as-paddle is a proven idea. Google's 2013 Roll It Chrome Experiment read swing speed and direction from the phone's motion sensors, drew the 3D scene with Three.js and linked the devices with WebSockets ([Chromium Blog](https://blog.chromium.org/2013/06/a-classic-boardwalk-game-rolls-from.html)).
- A swing is a gesture with timing and power, not continuous steering, so it plays nothing like your friend's tilt-steered car.
- Pickleball's rules are small enough to build in a few weeks: a 20 ft by 44 ft court, a 7-foot non-volley zone (the kitchen), the two-bounce rule, and games to 11 won by 2 ([USA Pickleball rules summary](https://usapickleball.org/what-is-pickleball/official-rules/rules-summary/), [court and scoring guide](https://hackathletics.com/blogs/news/pickleball-court-dimensions-rules-scoring), [MSU Rec Sports](https://recsports.msu.edu/node/331)).
- Real pickleball has soft dinks, hard drives and lobs, which gives swings a skill ceiling and makes matches replayable.

**Control options considered**

| Option | How it plays | Risk | Verdict |
| --- | --- | --- | --- |
| Swing the phone (recommended) | Swing to hit, tilt to aim, hold a thumb button to lob | Medium: sensors are noisy, so it needs calibration and aim assist | Most distinctive and fun |
| Touch only | Tap to hit, drag to aim | Low | Build it as a fallback and test input, not the headline |
| Tilt to move the player | Tilt left and right to run | Low | Too close to the car game |

**MVP scope:** singles against an AI opponent on one court, three difficulty levels, and a quick game to 11 (win by 2). The player's character moves automatically to the ball, so you only control timing, power, direction and shot type.

## 2. Game design

A match is a game to 11, win by 2, against an AI opponent, and should last a few minutes. A rally ends on a fault, and the next serve starts within seconds so players keep going.

**Controls**

| Action | On the phone | Effect in the game |
| --- | --- | --- |
| Hit | Swing the phone like a paddle | Returns the ball if it is within reach when the swing lands |
| Power | Swing speed | Soft swing is a dink, medium is a drive, hard on a high ball is a smash |
| Direction | Phone tilt (roll) at the moment of impact | Aims left or right across the court, with aim assist |
| Forehand or backhand | Direction of the swing, learned in calibration | Picks the paddle side and animation |
| Lob | Hold the thumb button while swinging | High, deep ball over the opponent |
| Serve | Underhand swing when the serve prompt shows | The ball tosses itself; the serve must land in the diagonal court beyond the kitchen |
| Calibrate | 3 practice swings when the phone first connects | Learns the swing axis and which hand holds the phone |
| Pause | Button on the phone | Pauses the match on the laptop |

**Rules in the MVP**

| Rule | In MVP | Note |
| --- | --- | --- |
| 20 ft by 44 ft court, 7-ft kitchen, line calls | Yes | A ball touching a line counts as in, except a serve touching the kitchen line ([USA Pickleball](https://usapickleball.org/what-is-pickleball/official-rules/rules-summary/)) |
| Serve: underhand, one attempt, diagonal | Yes | Must clear the net and land beyond the kitchen in the diagonal court |
| Two-bounce rule | Yes | The first return and the next shot must bounce before anyone volleys |
| Kitchen volley fault | Yes | The rules engine detects it; the auto-mover keeps both players from volleying in the kitchen |
| Net, out and double-bounce faults | Yes | Each ends the rally and scores for the other side |
| Scoring | Rally scoring to 11, win by 2 | Traditional side-out scoring (only the server scores) is an optional setting later |
| Doubles | No | Singles only in the MVP |

**Shots**

| Shot | Trigger | Result |
| --- | --- | --- |
| Dink | Soft swing, ball low | Short arc that lands in the opponent's kitchen |
| Drive | Medium or hard swing, ball above the net | Fast, flat return |
| Lob | Thumb button held | High, deep ball that pushes the opponent back |
| Smash | Hard swing, ball high near the net | Steep, fast ball downward |

**Aim assist.** Tilt at impact picks a landing target in the opponent's court. The game then solves the launch velocity that reaches it, so a decent swing always produces a playable ball. Difficulty widens the target error; it does not make the swing harder to detect.

**Game feel**

- A pickleball is small and hard to follow in 3D, so give it a ground shadow, a landing marker for the bounce, and a short trail.
- Chase camera behind the player's baseline, slightly raised; a few frames of hit-stop and a small shake on smashes.
- The on-screen paddle mirrors the phone's tilt in real time, so the player sees the phone respond.
- A distinct sound for paddle hit, bounce, net and out; a short haptic on the phone for every hit.

**Replay hooks**

- Three AI levels (easy, medium, hard).
- Rally challenge mode that counts consecutive returns, with a local best score.
- Cosmetic court themes unlocked by winning.

## 3. System architecture

The phone detects each swing and sends one small message per hit, a thin Node server relays it inside a room, and the laptop runs the 3D match and sends the game phase back.

&#91;embedded content: architecture · 3 parts, pairing in 4 steps\]

The server never runs game logic. That keeps it small and puts all tuning in one place, the laptop page.

## 4. Message protocol

A swing is one discrete event, so it travels as a reliable message. Only the optional paddle-pose stream is allowed to drop messages.

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `host:create` | Screen to server | none (ack returns `{roomCode}`) | 4-letter code that skips I, L and O |
| `controller:join` | Phone to server | `{roomCode}` (ack returns `{ok, playerId}`) | Rejects unknown codes and a second phone in the room |
| `controller:resume` | Phone to server | `{roomCode, playerId}` | Used after a dropped connection |
| `input:calibration` | Phone to screen | `{hand: "right"\|"left", swingSign: 1\|-1}` | Sent once, after the 3 practice swings |
| `input:swing` | Phone to screen | `{seq, power: 0..1, side: "forehand"\|"backhand", tilt: -1..1, lob: boolean, tPhone}` | One per swing, reliable |
| `input:pose` | Phone to screen | `{seq, pitch, roll}` | Volatile, about 30 per second; only moves the on-screen paddle |
| `game:phase` | Screen to phone | `{phase, score, serving, rally}` | Phases: calibrate, serve, rally, point, matchover; drives the phone layout |
| `haptic` | Screen to phone | `{pattern: number[]}` | Hit feedback; Android only in practice |
| `net:ping` | Phone to screen | ack with a timestamp | Every 2 seconds; used to estimate one-way delay |

**Rules**

- The laptop browser runs the game and the server only relays messages inside a room (`socket.join(roomCode)`). With one player and no prizes, that keeps the server very small.
- Use websocket-only transport so a connection never starts on slower HTTP long polling.
- Each swing carries `tPhone`, the phone's clock at the swing peak. The laptop estimates the one-way delay from the ping (half the round trip) and applies the swing at that time, not when the message arrived.
- Keep a swing in a short buffer (start at 200 ms, tune later) so a swing that arrives slightly before the ball is in reach still counts as a hit.
- Swings are never volatile: Socket.IO documents that a volatile event may be dropped and may arrive out of order ([example from socketioxide docs](https://docs.rs/crate/socketioxide/latest/source/docs/operators/volatile.md)), and a lost swing means a lost hit. The pose stream is the one place volatile is right, because a dropped frame only skips an animation step.
- Every message carries an increasing `seq`; the screen ignores older pose messages.
- Reconnect: when the phone drops, the server keeps the room for 60 seconds and the match pauses; the phone retries with `controller:resume`. If the laptop drops, the room closes.
- Validate every payload on the server with zod before relaying, and rate-limit each socket (for example 60 messages per second, which leaves room for the 30 per second pose stream).

## 5. Tech stack and project structure

Use TypeScript in one monorepo with three packages, so the message types are written once and checked on both ends.

| Layer | Choice | Reason |
| --- | --- | --- |
| Server | Node.js LTS, Express, Socket.IO 4, zod | You chose Node + Socket.IO; the server is a small room relay |
| Game screen | Vite, TypeScript, Three.js for the 3D scene, React for menus and HUD | Keeps the render loop outside React re-renders |
| Physics | Rapier (WebAssembly build, `@dimforge/rapier3d-compat`) | The ball is small and fast; one comparison lists Rapier with full continuous collision detection and cannon-es with limited support ([comparison](https://skillselion.com/skills/openaec-foundation/three.js-claude-skill-package/threejs-impl-physics)). Rapier must be initialized asynchronously before use |
| 3D assets | Low-poly glTF court, paddle and 2 characters | Free packs from sites such as Kenney or Quaternius are an option; confirm each pack's license before using it |
| Audio | Howler.js | Simple sound pool with low-latency playback |
| Phone controller | Vite page, DeviceMotion API, Pointer Events, Screen Wake Lock | No install; opens from the QR code |
| Pairing | `qrcode` npm package | Draws the join QR on the game screen |
| Tests | Vitest (logic), Playwright (two-browser end-to-end) | Covers pairing, input relay and rules without a real phone |

Use one unit as one meter in both Three.js and Rapier; it keeps the court dimensions and physics constants easy to reason about ([Rapier with Three.js guide](https://abratabia.com/threejs/physics.php)). Library choices are my recommendations, not something I benchmarked; milestone 1 includes a short physics spike to confirm them. If Rapier gives trouble, cannon-es is the simpler fallback.

**Folder layout**

```text
dink-duel/
  package.json               # npm workspaces
  shared/src/protocol.ts     # message types + zod schemas (used by all)
  server/src/                # index.ts, rooms.ts, validate.ts
  web/
    index.html               # game screen (laptop)
    controller.html          # phone controller
    src/screen/              # scene, court, ball, shot solver, rules, ai, camera, audio, hud
    src/controller/          # swing detector, calibration, pose stream, layouts
    public/models/           # glTF court, paddle, players
```

**HTTPS is mandatory on the phone.** Motion sensors need a secure context, and iOS Safari will auto-decline the permission request on a page that is not served over HTTPS ([yal.cc](https://yal.cc/?p=1395), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)). For local development, run the dev server on your network and expose it through an HTTPS tunnel (Cloudflare Tunnel or ngrok), or use a local certificate from mkcert. Plain `http://192.168.x.x` will work for touch, but not for swing detection.

## 6. Phone controller implementation

The controller is a static page that joins the room from the QR code, asks for motion permission once, calibrates with three practice swings, then sends one message per swing plus a light pose stream. The player holds the phone like a paddle, screen facing them.

**Safety first:** show a notice on the first screen that tells players to use a wrist strap or a firm grip and to swing within arm's reach, away from people and objects.

**Join and calibration flow**

1. The player scans the QR code on the laptop, which opens `https://<host>/controller.html?room=ABCD`.
2. The page connects and sends `controller:join` automatically.
3. A big "Tap to start" button runs the motion permission request. iOS only shows that dialog from a user tap, so it cannot run on page load ([source](https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2)).
4. Three guided practice swings record the swing axis and direction, which hand is used, the neutral tilt, and the player's own swing-speed range.
5. The phone sends `input:calibration` and the screen shows the serve prompt.

```ts
// Call from the click handler of the "Tap to start" button
async function enableMotion(): Promise<boolean> {
  const DM = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof DM.requestPermission === 'function') {
    return (await DM.requestPermission()) === 'granted'; // iOS 13+
  }
  return 'DeviceMotionEvent' in window; // Android and desktop: no prompt
}
```

**Swing detector**

- Listen to `devicemotion`. `rotationRate` is in degrees per second and `acceleration` in m/s² ([web.dev](https://web.dev/device-orientation)). Treat a swing as started when the rotation speed passes a threshold (start near 250 degrees per second and tune on real phones), and finished when it drops to about half of its peak.
- Send the swing at the finish, with the peak speed as power. Scale power against the player's calibrated range, so a gentle swinger can still reach full power.
- Ignore the return motion for about 300 ms after a swing, so the backswing does not count as a second hit.
- Forehand or backhand comes from the sign of the swing relative to the calibrated direction; left-handed players are handled by the same calibration.
- Aim comes from the tilt sampled at the swing peak, measured from the calibrated neutral tilt, with a small dead zone and a clamp. Do not aim from compass heading, which depends on a calibrated magnetometer.
- Android and iOS report tilt at different scales: the Tandemonium project found Android readings roughly 30 to 50 percent higher and used separate defaults per platform ([Tandemonium](https://github.com/petegordon/tandemonium)). Keep per-platform sensitivity values and a slider in the settings.
- Roll It, Google's earlier phone-swing game, used the same two browser events to get swing speed and direction ([Chromium Blog](https://blog.chromium.org/2013/06/a-classic-boardwalk-game-rolls-from.html)).

**Pose stream and buttons**

- Send `input:pose` about 30 times a second as a volatile message so the 3D paddle follows the phone.
- One large thumb button for lob and one small pause button; everything else on the screen is inert, with `touch-action: none`, so a swinging hand cannot trigger anything by accident.
- Show a short flash and, on Android, a haptic pulse (`navigator.vibrate`) on every hit sent back by the game. As far as I know iOS Safari does not support vibration, so never rely on it.

**Keeping the phone usable**

- Request a screen wake lock (`navigator.wakeLock.request('screen')`) and request it again on `visibilitychange`, otherwise the phone sleeps mid-match.
- Block pull-to-refresh and zoom with `overscroll-behavior: none` and a viewport meta tag that disables scaling.
- Show a small connection chip (connected, reconnecting) and the measured ping.

## 7. Game screen implementation

The laptop page owns all game logic. React draws menus and the HUD, Three.js draws the court, Rapier simulates the ball at a fixed step, and a rules engine plus an AI opponent run the match.

**Scene and camera**

- Build the court from real dimensions in meters: about 6.10 m wide (20 ft), 13.41 m long (44 ft), with a 2.13 m (7 ft) kitchen on each side of the net. Check the official rulebook for the net height before modeling it.
- Chase camera behind the player's baseline, slightly raised, with a small field-of-view widening on smashes.
- The ball is hard to follow in 3D: give it a ground shadow, a landing marker for the predicted bounce, a short trail, and a visual size slightly larger than its physics size.
- Cap the pixel ratio and shadow quality so the game holds 60 fps on laptops with integrated graphics.

**Game loop**

- Step physics at a fixed rate (start at 120 Hz) with an accumulator, render on `requestAnimationFrame`, and interpolate drawn positions between steps.
- The ball is a dynamic sphere with continuous collision detection on. Add air drag every step (a force that grows with speed squared), since a plastic pickleball slows quickly; tune restitution until the bounce height feels right. Skip spin in the MVP.
- The court surface and net are static colliders.
- Paddle hits are not physical collisions. When a buffered swing meets the ball inside its hit window, the shot solver sets the ball's new velocity.

**Shot solver**

1. Pick the shot type from swing power, ball height and the lob flag (see the Shots table).
2. Pick a target point on the opponent's half: tilt sets the left-right position, shot type sets the depth (dink lands in the kitchen, drive lands deep, lob lands near the baseline).
3. Add a random offset from a seeded generator; its size depends on difficulty or the AI's skill.
4. Find the launch velocity that reaches the target with the net cleared, by simulating a few candidate speeds with the same integrator as the physics and keeping the closest. A unit test fires 1,000 random targets and asserts the ball lands within a small tolerance (start at 5 cm).

**Rules engine**

- A pure TypeScript state machine with no 3D code. It receives events (bounce with court zone, paddle hit, net contact, out) and returns faults and points.
- Tracks bounces per side for the two-bounce rule, the serve target court, kitchen volleys, double bounces, and the score to 11 win by 2.
- Tested with scripted rallies, so rules never depend on the physics being tuned.

**AI opponent**

- Predicts the bounce by running the same integrator ahead, moves to the contact point at a limited speed, and chooses a shot from the situation: dink when the ball is low and it is close, drive when the ball is high, lob when it is out of position.
- Calls the same shot solver as the player, with a larger error and slower reactions at lower difficulty.

**Player movement and animation**

- The player character moves to the predicted contact point on its own, keeps behind the kitchen line for volleys, and returns to a ready position between shots.
- Animation clips (idle, run, forehand, backhand, serve) are triggered by game events.

**Match states**

`MENU` to `WAITING_FOR_PHONE` to `CALIBRATE` to `SERVE` to `RALLY` to `POINT`, back to `SERVE`, then `MATCH_OVER`. `PAUSED` covers a phone disconnect. Every state change emits `game:phase` to the phone, which swaps its layout.

**Polish**

- Browsers block audio until the first user interaction, so start the audio context from the menu's Start button.
- Debug mode (`?debug=1`): draw physics colliders, the predicted bounce, the swing buffer, ping and FPS.
- Best scores and rally-challenge records in `localStorage`.

## 8. Milestones and timeline

The MVP is a full match against the AI by the end of week 5 and a deployed, tested game by week 7, with week 8 for polish. Swing detection is the riskiest part, so it is tested on real phones in week 2, before anything depends on it. M5 (art and animation) is the longest block and the first thing to cut back if time runs short. The timeline assumes about 10 hours a week.

&#91;embedded content: milestones · 7 weeks, 2 gates\]

| Milestone | Deliverable | Done when |
| --- | --- | --- |
| M1 (W1) | Monorepo, Vite, Socket.IO hello world, 3D court with lines and net, a Rapier ball, a keyboard-triggered test hit | The ball bounces plausibly and never passes through the court or net in 5 minutes of random hits |
| M2 (W2) | Room create and join, QR code, HTTPS tunnel, calibration, swing detector, pose stream | A real swing launches the test ball; at least 9 of 10 deliberate swings are detected on both an iPhone and an Android phone |
| M3 (W3 to W4) | Shot solver, buffered hit window, rules engine (serve, two-bounce, faults, scoring) | The 1,000-target solver test and the scripted-rally rules tests pass; you can serve and rally against a dummy opponent that always returns |
| M4 (W4 to W5) | AI opponent with 3 levels, player auto-movement, point flow to 11 | A full match to 11, win by 2, plays start to finish with one laptop and one phone |
| M5 (W5 to W7) | Low-poly models, animations, camera work, sound, hit-stop, rally challenge, local best scores | 3 playtesters ask for a rematch |
| M6 (W7) | Hosted deployment, CI, reconnect polish | Works on 2 real phones against the hosted URL; resume works after a Wi-Fi blip |
| M7 (W8) | Playtest fixes, README, demo video | Every item on the portfolio checklist is ticked |

A global leaderboard (Postgres or SQLite behind the same server) is an optional stretch after M6; score submissions from the browser can be faked, so treat it as for fun.

## 9. Testing and performance targets

The targets below are my proposed starting points, not measured values; adjust them after the first real-phone tests.

| Check | Target | How to test |
| --- | --- | --- |
| Swing-to-hit delay | 95% of swings show a hit within 150 ms of the swing peak on the same Wi-Fi | Log the phone and screen timestamps; the one-way delay is about half the ping round trip |
| Swing detection | At least 95% of deliberate swings detected, under 5% false swings while the phone is handled | Record sensor samples on iPhone and Android; replay them in Vitest |
| Shot solver | Ball lands within 5 cm of the target in a 1,000-random-target test | Vitest |
| Rules engine | Scripted rallies pass: two-bounce, serve target, kitchen volley, net, out, double bounce, win by 2 | Vitest |
| Frame rate | 60 fps on a mid-range laptop with integrated graphics; physics step under 4 ms | Debug HUD; Chrome Performance panel |
| Reconnect | Phone resumes within 5 seconds of a Wi-Fi blip | Toggle airplane mode for 3 seconds mid-rally |
| Pairing and calibration | New player goes from QR scan to first hit in under 60 seconds | Stopwatch with 3 new players |
| First match | A new player wins a point with no help | Playtest with 5 people; note where they hesitate |

**Devices and networks**

- Phones: a current iPhone on Safari, an Android phone on Chrome, and one older, slower phone. Sensor sampling rates and scales differ by device, so swing thresholds need testing on each.
- Laptops: Chrome, Safari and Firefox, with both integrated and discrete graphics if you can borrow one.
- Network: because swings go through your hosted server even when both devices are in the same room, delay depends on server distance. One AirConsole review noticed input lag that the writer guessed came from inputs travelling over the internet ([HTXT](https://htxt.co.za/?p=95145)). Host the server in the region closest to your players, and test the swing buffer by adding 100 to 300 ms of artificial delay.

**Automated tests**

- Vitest for the shot solver, the rules engine, the swing detector (fed recorded samples) and the AI, which uses a seeded random generator so matches can be replayed.
- Playwright with two browser contexts, one as the screen and one as the controller: create a room, join, send scripted swings, assert hit events, then drop and resume the controller.

## 10. Deployment

Deploy one Node service that serves the built web app, the 3D assets and the Socket.IO endpoint from the same HTTPS address, so the phone and laptop use one URL and there is no cross-origin setup.

- **Host:** any provider with WebSocket support and automatic HTTPS (Fly.io, Railway and Render are common choices). I have not checked current prices or free-tier limits, so compare them before choosing, and pick the region closest to your players (for the Philippines, an Asian region).
- **Assets:** compress the glTF models and textures, serve them with long cache headers, and keep the first download small, since the physics engine's WebAssembly file adds to it. Show a loading screen with progress.
- **Single instance:** rooms live in server memory. That is enough for a 1-player game; running several instances would need the Socket.IO Redis adapter, which is out of scope.
- **Configuration:** `PORT`, `NODE_ENV` and an allowed-origin list as environment variables; no secrets are needed in the MVP.
- **CI:** a GitHub Actions workflow that runs type-check, lint, Vitest and the production build on every push, and deploys from `main`.
- **Health and monitoring:** a `/health` endpoint, a log line for room count and errors, and a free uptime monitor pinging `/health`.
- **Room security:** a 4-letter code from 23 letters (no I, L or O) gives about 280,000 combinations, so rate-limit join attempts per IP, expire rooms after 10 minutes of inactivity, and allow one phone per room.
- **Short join link:** serve the controller at a short path such as `/c` so the printed URL under the QR code is easy to type.

## 11. Risks and portfolio polish

The biggest risk is swing detection that feels unreliable, so M2 tests it on real phones before the game depends on it.

| Risk | Mitigation |
| --- | --- |
| Swings missed or counted twice | Calibration, per-platform thresholds, 300 ms return-motion lockout, replayed sensor recordings, a touch fallback input |
| Players cannot aim | Tilt picks a target and the shot solver handles the physics; show a landing marker |
| Ball passes through the court or net | Continuous collision detection, fixed step, speed cap, physics spike in M1 |
| Delay through the hosted server | Websocket-only transport, region close to players, timestamped swings with a 200 ms buffer, measure on Wi-Fi and mobile data |
| Shots feel floaty or unfair | Constants in one tuning file, debug overlay, playtests from M3 |
| 3D art takes too long | Start with placeholder shapes, use free low-poly packs, and treat M5 as the scope to cut |
| iOS blocks sensors on plain HTTP | HTTPS tunnel in development; touch fallback input keeps the game testable |
| Phone slips out of the hand | Wrist-strap and clear-space notice before the first swing |
| Phone sleeps or drops mid-match | Wake lock, 60-second room hold, `controller:resume` |

**Portfolio polish checklist**

- [ ] A 30-second demo video with the phone and laptop side by side
- [ ] README with the architecture diagram, run instructions and a GIF
- [ ] Live demo link and a QR code in the README
- [ ] A short write-up of three decisions: reliable swing events with a volatile pose stream, the shot solver, controller resume
- [ ] A measured latency number and device list from the testing section
- [ ] Credits and licenses for any sounds and fonts

## Sources

These are pages found in search; I read the excerpts, not every full page.

- [AirConsole developer guide: Smartphones as Controllers](https://developers2.airconsole.com/smartphones-as-controllers)
- [Game Developer: AirConsole, Using Smartphones as Controllers](https://www.gamedeveloper.com/design/airconsole---using-smartphones-as-controllers)
- [Kaazing: WebSocket race car demo](https://kaazing.com/the-simplest-way-to-use-your-smartphone-as-a-game-controller-a-websocket-race-car-demo/)
- [DEV: Hoverboard game with JavaScript and WebSockets](https://dev.to/devdevcharlie/making-an-interactive-hoverboard-game-using-javascript-and-web-sockets-379j)
- [Tandemonium (GitHub)](https://github.com/petegordon/tandemonium)
- [MDN: DeviceOrientationEvent.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
- [yal.cc: Using HTML5 accelerometer and gyroscope](https://yal.cc/?p=1395)
- [DEV: requestPermission for devicemotion on iOS 13](https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2)
- [HTXT: AirConsole review](https://htxt.co.za/?p=95145)
- [socketioxide docs: volatile events](https://docs.rs/crate/socketioxide/latest/source/docs/operators/volatile.md)
- [Chromium Blog: Roll It, a phone-swing game](https://blog.chromium.org/2013/06/a-classic-boardwalk-game-rolls-from.html)
- [USA Pickleball: rules summary](https://usapickleball.org/what-is-pickleball/official-rules/rules-summary/)
- [Pickleball court dimensions, rules and scoring](https://hackathletics.com/blogs/news/pickleball-court-dimensions-rules-scoring)
- [MSU Recreational Sports: pickleball rules](https://recsports.msu.edu/node/331)
- [Three.js physics comparison: cannon-es and Rapier](https://skillselion.com/skills/openaec-foundation/three.js-claude-skill-package/threejs-impl-physics)
- [Adding physics to Three.js with Rapier](https://abratabia.com/threejs/physics.php)
- [web.dev: device orientation and motion](https://web.dev/device-orientation)
