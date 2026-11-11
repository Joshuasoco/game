import { expect, test } from "@playwright/test";

test("ball cues survive low quality, fade after landing and respect reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Load the real renderer without a second app/render loop or a production debug API.
  await page.route("**/__readability", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0"><div id="court" style="width:100vw;height:100vh"></div></body></html>',
    }),
  );
  await page.goto("/__readability");
  const result = await page.evaluate(async () => {
    const path = "/src/screen/scene.ts";
    const { CourtScene } = (await import(
      /* @vite-ignore */ path
    )) as typeof import("../../web/src/screen/scene");
    const scene = new CourtScene(
      document.querySelector<HTMLElement>("#court")!,
    );
    scene.setQuality("low");
    scene.setReducedMotion(false);
    scene.setActive(true);
    const marker = scene.scene.getObjectByName("landing-marker")!;
    const shadow = scene.scene.getObjectByName("ball-shadow")!;
    const trails = scene.scene.children.filter(
      (object) => object.name === "ball-trail",
    );
    const p = { x: 1, y: 1.1, z: 3 };
    const target = { x: -1, y: 0.037, z: -4 };
    for (let frame = 0; frame < 60; frame++) {
      scene.setBall({ ...p, z: 3 - frame / 6 }, target);
      scene.render(1 / 60, frame / 60, true);
    }
    const flying = {
      marker: marker.visible,
      shadow: shadow.visible,
      trail: trails.some((object) => object.visible),
    };
    const baseline = (
      scene.ball.material as import("three").MeshStandardMaterial
    ).emissiveIntensity;
    scene.impact(p, true, 0.7);
    scene.render(1 / 60, 1, true);
    const contact = (
      scene.ball.material as import("three").MeshStandardMaterial
    ).emissiveIntensity;
    // Physics retains the original target after a bounce; the marker must still fade.
    scene.impact(target, false, 0.3, true);
    for (let frame = 0; frame < 40; frame++) {
      scene.setBall(p, target);
      scene.render(1 / 60, 1 + frame / 60, true);
    }
    const fadedAfterBounce = !marker.visible;
    scene.setBall(p);
    for (let frame = 0; frame < 40; frame++)
      scene.render(1 / 60, 1 + frame / 60, false);
    const faded = {
      marker: marker.visible,
      trail: trails.some((object) => object.visible),
    };
    scene.setReducedMotion(true);
    scene.hit("player");
    for (let frame = 0; frame < 15; frame++) {
      scene.setBall({ ...p, x: frame / 5 }, target);
      scene.render(1 / 60, 2 + frame / 60, true);
    }
    const reduced = {
      marker: marker.visible,
      trail: trails.some((object) => object.visible),
      scale: marker.scale.x,
    };
    scene.setBall({ x: 1.5, y: 0.8500000238, z: 5.9 });
    const heldX = scene.ball.position.x;
    const radius = (scene.ball.geometry as import("three").SphereGeometry)
      .parameters.radius;
    const pulseEnded = (
      scene.ball.material as import("three").MeshStandardMaterial
    ).emissiveIntensity;
    scene.dispose();
    return {
      flying,
      faded,
      reduced,
      baseline,
      contact,
      pulseEnded,
      heldX,
      radius,
      fadedAfterBounce,
    };
  });
  expect(result.flying).toEqual({ marker: true, shadow: true, trail: true });
  expect(result.faded).toEqual({ marker: false, trail: false });
  expect(result.fadedAfterBounce).toBe(true);
  expect(result.reduced).toEqual({ marker: true, trail: false, scale: 1 });
  expect(result.contact).toBeGreaterThan(result.baseline);
  expect(result.pulseEnded).toBeCloseTo(result.baseline);
  expect(result.heldX).toBeCloseTo(1.98);
  expect(result.radius).toBeCloseTo(0.09 * 1.6);
});
