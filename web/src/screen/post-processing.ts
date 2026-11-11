import * as T from "three";
import {
  BloomEffect,
  FXAAEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NormalPass,
  RenderPass,
  SSAOEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import type { Quality } from "../game/preferences";

/** Uses the same composer as react-postprocessing, preserving the game's existing clock. */
export class CourtPostProcessing {
  private composer: EffectComposer;
  private depth?: DepthOfFieldEffect;
  private depthPass?: EffectPass;
  constructor(
    renderer: T.WebGLRenderer,
    scene: T.Scene,
    camera: T.PerspectiveCamera,
    quality: Quality,
  ) {
    renderer.toneMapping = T.NoToneMapping;
    this.composer = new EffectComposer(renderer, {
      frameBufferType: T.HalfFloatType,
      multisampling: 0,
    });
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality === "high") {
      const normals = new NormalPass(scene, camera, { resolutionScale: 0.5 });
      this.composer.addPass(normals);
      this.composer.addPass(
        new EffectPass(
          camera,
          new SSAOEffect(camera, normals.texture, {
            samples: 8,
            rings: 3,
            radius: 0.12,
            intensity: 0.8,
            bias: 0.025,
            resolutionScale: 0.5,
            luminanceInfluence: 0.6,
          }),
        ),
      );
      this.depth = new DepthOfFieldEffect(camera, {
        focusRange: 18,
        bokehScale: 0.65,
        resolutionScale: 0.35,
      });
      this.depth.target = new T.Vector3(0, 0, 0);
      this.depthPass = new EffectPass(camera, this.depth);
      this.composer.addPass(this.depthPass);
    }
    this.composer.addPass(
      new EffectPass(
        camera,
        new BloomEffect({
          intensity: 0.14,
          luminanceThreshold: 1.2,
          luminanceSmoothing: 0.4,
          mipmapBlur: true,
          levels: 4,
          resolutionScale: 0.5,
        }),
      ),
    );
    this.composer.addPass(
      new EffectPass(
        camera,
        new HueSaturationEffect({ saturation: -0.045 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
        new VignetteEffect({ offset: 0.3, darkness: 0.24 }),
      ),
    );
    this.composer.addPass(new EffectPass(camera, new FXAAEffect()));
  }
  resize(w: number, h: number) {
    this.composer.setSize(w, h);
  }
  render(dt: number, active: boolean) {
    // Keep every shot sharp during play.
    if (this.depth) this.depth.bokehScale = active ? 0 : 0.65;
    if (this.depthPass) this.depthPass.enabled = !active;
    this.composer.render(dt);
  }
  dispose() {
    this.composer.dispose();
  }
}
