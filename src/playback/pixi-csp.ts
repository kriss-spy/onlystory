import * as PIXI from 'pixi.js';
import { install } from '@pixi/unsafe-eval';

// Use Pixi's interpreter for uniform uploads instead of generated functions.
// The desktop renderer keeps script evaluation disabled by its CSP.
install(PIXI);
