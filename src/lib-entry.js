// STAGE TWO — single import surface for three + exactly the addons used.
// bundle mode  : esbuild absorbs every import below (resolved from node_modules).
// importmap mode: relative addon paths are absorbed here; ONLY bare 'three' stays for the import map.
//               (esbuild's external:['three'] also matches 'three/*' subpaths — hence relative paths
//                instead of 'three/addons/...' so expressly NOTHING but engine core stays bare.)
import * as THREE from 'three';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from '../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../node_modules/three/examples/jsm/postprocessing/OutputPass.js';

export { THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass };
