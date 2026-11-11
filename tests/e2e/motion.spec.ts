import { expect, test } from "@playwright/test";

test("score changes animate only their digit and leave accessible text immediate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/__score", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto("/__score");
  await page.evaluate(async () => {
    const reactPath = "/node_modules/.vite/deps/react.js";
    const rootPath = "/node_modules/.vite/deps/react-dom_client.js";
    const scorePath = "/src/screen/score-digit.tsx";
    const refreshPath = "/@react-refresh";
    const { default: refresh } = await import(/* @vite-ignore */ refreshPath);
    refresh.injectIntoGlobalHook(window);
    Object.assign(window, {
      $RefreshReg$: () => {},
      $RefreshSig$: () => (type: unknown) => type,
      __vite_plugin_react_preamble_installed__: true,
    });
    const React = (await import(/* @vite-ignore */ reactPath)).default;
    const { createRoot } = (await import(/* @vite-ignore */ rootPath)).default;
    const { ScoreDigit } = await import(/* @vite-ignore */ scorePath);
    const originalAnimate = Element.prototype.animate;
    Object.assign(window, { scoreAnimations: [] });
    Element.prototype.animate = function (
      ...args: Parameters<Element["animate"]>
    ) {
      const animation = originalAnimate.apply(this, args);
      (window as unknown as { scoreAnimations: string[] }).scoreAnimations.push(
        this.textContent ?? "",
      );
      return animation;
    };
    const root = createRoot(document.querySelector("#root")!);
    const render = (a: number, b: number) =>
      root.render(
        React.createElement(
          "div",
          { "aria-label": `Score ${a} to ${b}` },
          React.createElement(ScoreDigit, { value: a }),
          React.createElement(ScoreDigit, { value: b }),
        ),
      );
    render(0, 0);
    Object.assign(window, { updateScore: render });
  });
  await expect(page.locator("b")).toHaveText(["0", "0"]);
  expect(
    await page
      .locator("b")
      .evaluateAll((nodes) => nodes.map((n) => n.getAnimations().length)),
  ).toEqual([0, 0]);
  const result = await page.evaluate(async () => {
    (
      window as unknown as { updateScore: (a: number, b: number) => void }
    ).updateScore(1, 0);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return {
      text: document.querySelector("[aria-label]")?.getAttribute("aria-label"),
      started: (window as unknown as { scoreAnimations: string[] })
        .scoreAnimations,
      animations: [...document.querySelectorAll("b")].map(
        (n) => n.getAnimations().length,
      ),
    };
  });
  expect(result.text).toBe("Score 1 to 0");
  expect(result.started).toEqual(["1"]);
  await page.waitForTimeout(220);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() =>
    (
      window as unknown as { updateScore: (a: number, b: number) => void }
    ).updateScore(2, 0),
  );
  await expect(page.locator("b")).toHaveText(["2", "0"]);
  expect(
    await page
      .locator("b")
      .evaluateAll((nodes) => nodes.map((n) => n.getAnimations().length)),
  ).toEqual([0, 0]);
});

test("scene contact, camera, pause and live reduced-motion changes preserve gameplay roots", async ({
  page,
}) => {
  await page.route("**/__motion", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0"><div id="court" style="width:100vw;height:100vh"></div></body></html>',
    }),
  );
  await page.goto("/__motion");
  const result = await page.evaluate(async () => {
    const path = "/src/screen/scene.ts";
    const { CourtScene } = (await import(
      /* @vite-ignore */ path
    )) as typeof import("../../web/src/screen/scene");
    const scene = new CourtScene(
      document.querySelector<HTMLElement>("#court")!,
    );
    const initialCamera = scene.camera.position.clone();
    scene.setReducedMotion(true);
    const initialCameraStable =
      scene.camera.position.distanceTo(initialCamera) < 0.0001;
    scene.setReducedMotion(false);
    scene.setQuality("low");
    scene.setActive(true);
    scene.player.group.position.set(0, 0, 5.8);
    scene.ai.group.position.set(0, 0, -5.8);
    scene.resetPresentation();
    scene.render(100, 0, true);
    const p = { x: 0.65, y: 1, z: 5.3 };
    scene.hit("player", false, false, { shot: "drive", contact: p });
    scene.impact(p, true, 1, false, { x: 0, y: 1, z: -8 }, "drive");
    const flash = (scene.ball.material as import("three").MeshStandardMaterial)
      .emissiveIntensity;
    scene.render(1 / 60, 1 / 60, true, 0, 0.06);
    const contactPose = scene.player.action;
    const shake = Math.abs(scene.camera.position.x);
    for (let i = 2; i <= 12; i++) scene.render(1 / 60, i / 60, true);
    const settled = scene.camera.position.x;
    scene.hit("player", true, false, {
      shot: "drive",
      backhand: true,
      contact: p,
    });
    scene.impact(p, true, 1);
    scene.render(0, 0.2, false);
    scene.setReducedMotion(true);
    const reduced = {
      body: scene.player.body.position.toArray(),
      legs: [scene.player.leftLeg.rotation.x, scene.player.leftLeg.rotation.z],
      scale: scene.ball.scale.toArray(),
      camera: scene.camera.position.x,
    };
    scene.hit("player", false, false, { shot: "drive", whiff: true });
    const whiffPulse = (
      scene.ball.material as import("three").MeshStandardMaterial
    ).emissiveIntensity;
    scene.setReducedMotion(false);
    const roots = {
      player: scene.player.group.position.toArray(),
      rotation: scene.player.group.rotation.toArray(),
      scale: scene.player.group.scale.toArray(),
    };
    Object.assign(window, { motionScene: scene });
    return {
      initialCameraStable,
      contactPose,
      shake,
      settled,
      reduced,
      roots,
      flash,
      whiffPulse,
    };
  });
  expect(result.initialCameraStable).toBe(true);
  expect(result.contactPose).toBe("contact");
  expect(result.shake).toBeLessThanOrEqual(0.035);
  expect(result.settled).toBeCloseTo(0, 8);
  expect(result.reduced).toEqual({
    body: [0, 0, 0],
    legs: [0, 0],
    scale: [1, 1, 1],
    camera: 0,
  });
  expect(result.roots).toEqual({
    player: [0, 0, 5.8],
    rotation: [0, 0, 0, "XYZ"],
    scale: [1, 1, 1],
  });
  // The operating-system preference also takes effect without opening Settings.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        motionScene: import("../../web/src/screen/scene").CourtScene;
      }
    ).motionScene.dispose(),
  );
});

test("P resumes the pause panel after Resume receives keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Just looking? Try with your keyboard" })
    .click();
  await page.keyboard.press("p");
  await expect(page.getByRole("button", { name: "Resume game" })).toBeFocused();
  await page.keyboard.press("p");
  await expect(
    page.getByRole("heading", { name: "A little breather." }),
  ).toHaveCount(0);
});
