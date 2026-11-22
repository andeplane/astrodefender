/**
 * The part of the 2D context the renderer uses. A real `CanvasRenderingContext2D` satisfies it, and
 * tests can pass a small recording fake instead, since happy-dom has no canvas.
 */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'fill'
  | 'stroke'
  | 'clip'
  | 'fillRect'
  | 'fillText'
  | 'setLineDash'
  | 'createRadialGradient'
  | 'createLinearGradient'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;
