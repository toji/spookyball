import { Tag, System } from './engine/core/ecs.js';
import { Transform } from './engine/core/transform.js';
import { Camera } from './engine/core/camera.js';
import { AmbientLight, DirectionalLight, ShadowCastingLight } from './engine/core/light.js';
import { GltfLoader } from './engine/loaders/gltf.js';
import { WebGPUWorld } from './engine/webgpu/webgpu-world.js';

import { BallSystem } from './ball.js';
import { PlayerSystem, GameState } from './player.js';
import { StageSystem, Block } from './stage.js';
import { Physics2DSystem } from './physics-2d.js';
import { Physics2DVisualizerSystem } from './physics-2d-visualizer.js';
import { ImpactDamageSystem } from './impact-damage.js';
import { ScoreSystem } from './score.js';
import { DeadSystem, LifetimeHealthSystem } from './lifetime.js';
import { HTMLDisplaySystem } from './html-display.js';

import { vec3, quat } from 'gl-matrix';

import { QueryArgs } from './query-args.js';

import dat from 'dat.gui';
import Stats from 'stats.js';

import { WebGPUTextureDebugSystem, WebGPUDebugTextureView } from './engine/webgpu/webgpu-texture-debug.js';
import { WebGPUBloomSystem } from './engine/webgpu/webgpu-bloom.js';
import { FlyingControls, FlyingControlsSystem } from './engine/controls/flying-controls.js';

const debugMode = QueryArgs.getBool('debug', false);

function getQuality() {
  const HIGH_QUALITY = {}; // Defaults

  const MEDIUM_QUALITY = {
    shadowSamples: 4,
    resolutionMultiplier: 0.75,
  };

  const LOW_QUALITY = {
    shadowSamples: 2,
    shadowResolutionMultiplier: 0.5,
    sampleCount: 1,
    resolutionMultiplier: 0.5,
    bloomEnabled: false,
  };

  const POTATO_QUALITY = {
    shadowSamples: 1,
    shadowResolutionMultiplier: 0.5,
    shadowUpdateFrequency: 2,
    sampleCount: 1,
    resolutionMultiplier: 0.5,
    bloomEnabled: false,
  };

  const qualitySetting = QueryArgs.getString('quality');

  switch (qualitySetting) {
    case 'high':
      return HIGH_QUALITY;
    case 'medium':
      return MEDIUM_QUALITY;
    case 'low':
      return LOW_QUALITY;
    case 'potato':
      return POTATO_QUALITY;
  }

  // TODO: Try to auto-detect a rough feature level
  return HIGH_QUALITY;
}

const rendererFlags = getQuality();
rendererFlags.lucasMode = QueryArgs.getBool('lucasMode', false);

const appSettings = {
  pause: false,
  freeCamera: false,
  showPhysicsBodies: false,
  enableBloom: true,
  renderTarget: 'default',
};

const canvas = document.querySelector('canvas');

const world = new WebGPUWorld(canvas, rendererFlags)
  .registerSystem(Physics2DSystem)
  .registerSystem(ImpactDamageSystem)
  .registerSystem(LifetimeHealthSystem)
  .registerSystem(ScoreSystem)
  .registerSystem(DeadSystem)
  .registerSystem(HTMLDisplaySystem)
  ;

world.singleton.add(new GameState());


let renderer;
try {
  renderer = await world.renderer();
} catch(error) {
  document.querySelector('.container').classList.add('error');
  const errorElement = document.querySelector('#score-display');

  errorElement.innerHTML = `Your browser doesn't appear to support WebGPU. (Scary!)<br>
This game requires WebGPU support.`;

  if (debugMode) {
    errorElement.innerHTML += `<hr/>${error.message}`;
  }

  throw error;
}

const stats = new Stats();

if (debugMode) {
  document.body.appendChild(stats.dom);

  const gui = new dat.GUI();
  document.body.appendChild(gui.domElement);

  gui.add(appSettings, 'pause').onChange(() => {
    world.paused = appSettings.pause;
  });
  
  gui.add(appSettings, 'showPhysicsBodies').onChange(() => {
    if (appSettings.showPhysicsBodies) {
      world.registerRenderSystem(Physics2DVisualizerSystem);
    } else {
      world.removeSystem(Physics2DVisualizerSystem);
    }
  });

  const flyingControls = new FlyingControls();
  flyingControls.speed = 10;
  gui.add(appSettings, 'freeCamera').onChange(() => {
    if (appSettings.freeCamera) {
      world.registerRenderSystem(FlyingControlsSystem);
      camera.add(flyingControls);
    } else {
      world.removeSystem(FlyingControlsSystem);
      camera.remove(FlyingControls);
    }
  });

  if (rendererFlags.bloomEnabled !== false) {
    gui.add(appSettings, 'enableBloom').onChange(() => {
      if (appSettings.enableBloom) {
        world.registerRenderSystem(WebGPUBloomSystem);
      } else {
        world.removeSystem(WebGPUBloomSystem);
      }
    });
  }

  gui.add(appSettings, 'renderTarget', {
    'Default': 'default',
    'Shadow': 'shadow',
    'Emissive': 'emissive',
    'Bloom Pass 0': 'bloom0',
    'Bloom Pass 1': 'bloom1',
  }).onChange(() => {
    world.query(WebGPUDebugTextureView).forEach((entity) => {
      entity.destroy();
    });
  
    switch (appSettings.renderTarget) {
      case 'shadow':
        world.create(new WebGPUDebugTextureView(renderer.shadowDepthTexture.createView(), true));
        break;
      case 'emissive':
        world.create(new WebGPUDebugTextureView(renderer.renderTargets.emissiveTexture.createView()));
        break;
      case 'bloom0':
        world.create(new WebGPUDebugTextureView(renderer.renderTargets.bloomTextures[0].createView()));
        break;
      case 'bloom1':
        world.create(new WebGPUDebugTextureView(renderer.renderTargets.bloomTextures[1].createView()));
        break;
      default:
        world.removeSystem(WebGPUTextureDebugSystem);
        return;
    }
  
    world.registerRenderSystem(WebGPUTextureDebugSystem);
  });
  
  // Mark each block as dead when you click the "clearLevel" debug button.
  appSettings.clearLevel = () => {
    world.query(Block).forEach((entity, block) => {
      entity.add(Tag('dead'));
    });
  };
  gui.add(appSettings, 'clearLevel');

  appSettings.restart = () => {
    world.singleton.add(new GameState());
  };
  gui.add(appSettings, 'restart');
}

const gltfLoader = new GltfLoader(renderer);

world.registerRenderSystem(StageSystem, gltfLoader);
world.registerRenderSystem(BallSystem, gltfLoader);
world.registerRenderSystem(PlayerSystem, gltfLoader);

const projection = new Camera();
projection.zNear = 1;
projection.zFar = 1024;

const cameraOrientation = quat.create();
quat.rotateX(cameraOrientation, cameraOrientation, Math.PI * -0.42);

const camera = world.create(
  new Transform({ position: [0, 36, 12], orientation: cameraOrientation }),
  projection
);

// Add some lights
world.create(
  // Spooky moonlight
  new DirectionalLight({
    direction: [0.3, 0.3, 0.5],
    color: [0.75, 0.8, 1.0],
    intensity: 1.8
  }),
  new ShadowCastingLight({ width: 75, height: 50, zNear: 0.1, up: [0, 1, 0] }),
  new Transform({ position: [26, 25, 36] }),
  new AmbientLight(0.075, 0.075, 0.075)
);

function onFrame(t) {
  requestAnimationFrame(onFrame);

  stats.begin();
  world.execute();
  stats.end();
}
requestAnimationFrame(onFrame);