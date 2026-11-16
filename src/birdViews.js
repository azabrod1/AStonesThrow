// The birds as drawn (src/main.js): a kind with a model is drawn as one
// (src/birdMeshes.js: MODELLED_KINDS), the rest as pictures facing the camera
// (src/birdSprites.js), till each has a model. Each view is given only its
// own birds, so neither keeps meshes for, nor fetches anything for, a bird
// the other draws: a place with no modelled kind never asks for the models'
// catalogue.
//
// `above` and `mirror` go in the main scene (the mirror's meshes on the
// mirror's layer alone) and `below` in the under-water pass (what of a
// standing bird is in the water: the heron's legs). show(population, camera)
// gives the place's birds their meshes and fetches the images of the kinds
// about at its hour; update(camera) poses them, each frame;
// mirrorChanges(into, frustum) is asked once for each frame drawn
// (src/birdDrawing.js); warmUp() draws a bird of each view in front of the
// camera, so their programs are built under the veil (its done() takes them
// away); drawCalls counts the draws they take now.
import * as THREE from 'three';
import { createBirdModels, MODELLED_KINDS } from './birdMeshes.js';
import { createBirdPictures } from './birdSprites.js';

/** Both bird views as one: `lighting`, the sky's `haze` uniforms, the mirror's layer, and `onLoaded`, called when a kind's image has come. */
export function createBirdViews({ lighting, haze, mirrorLayer, onLoaded }) {
  const models = createBirdModels({ lighting, haze, mirrorLayer, onLoaded });
  const pictures = createBirdPictures({ lighting, haze, mirrorLayer, onLoaded });
  return {
    above: new THREE.Group().add(models.above, pictures.above),
    mirror: new THREE.Group().add(models.mirror, pictures.mirror),
    below: new THREE.Group().add(models.below, pictures.below),
    show(population, camera) {
      models.show(population.birds.filter((bird) => MODELLED_KINDS.has(bird.kind)), population.dark);
      pictures.show(population.birds.filter((bird) => !MODELLED_KINDS.has(bird.kind)), population.dark, camera);
    },
    update(camera) {
      models.update();
      pictures.update(camera);
    },
    mirrorChanges: (into, frustum) => models.mirrorChanges(into, frustum) + pictures.mirrorChanges(into, frustum),
    warmUp() {
      const started = [models.warmUp(), pictures.warmUp()];
      return { done() { for (const one of started) one.done(); } };
    },
    get drawCalls() { return models.drawCalls + pictures.drawCalls; },
  };
}
