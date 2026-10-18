import {
  MeshAttachment,
  RegionAttachment,
  Vector2,
  type Skeleton,
} from '@esotericsoftware/spine-webgl';

export interface FaceBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Face/closed-eye geometry exists even while an alternate expression is showing. */
export function faceBounds(skeleton: Skeleton): FaceBounds {
  for (const slot of [...skeleton.slots].sort(
    (a, b) =>
      Number(b.data.name === 'eyeclose') - Number(a.data.name === 'eyeclose'),
  )) {
    if (!/eyeclose|eye_close|00_default|^face(?:_|$)/i.test(slot.data.name))
      continue;
    const attachment = skeleton.getAttachment(
      slot.data.index,
      slot.data.attachmentName ?? slot.data.name,
    );
    let vertices: Float32Array;
    if (attachment instanceof MeshAttachment) {
      vertices = new Float32Array(attachment.worldVerticesLength);
      attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
    } else if (attachment instanceof RegionAttachment) {
      vertices = new Float32Array(8);
      attachment.computeWorldVertices(slot, vertices, 0, 2);
    } else continue;
    const xs: number[] = [],
      ys: number[] = [];
    for (let i = 0; i < vertices.length; i += 2) {
      xs.push(vertices[i]);
      ys.push(vertices[i + 1]);
    }
    if (xs.length)
      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.max(...ys),
        bottom: Math.min(...ys),
      };
  }
  const eyes = skeleton.bones.filter((b) =>
    /^(?:[LR]_Eye|eye[LR]?|eye_[LR])$/i.test(b.data.name),
  );
  if (eyes.length) {
    const x = eyes.reduce((n, b) => n + b.worldX, 0) / eyes.length;
    const y = eyes.reduce((n, b) => n + b.worldY, 0) / eyes.length;
    const radius = 100 * Math.abs(skeleton.scaleX);
    return {
      left: x - radius,
      right: x + radius,
      top: y + radius * 0.5,
      bottom: y - radius,
    };
  }
  const offset = new Vector2(),
    size = new Vector2();
  skeleton.getBounds(offset, size, []);
  return {
    left: skeleton.x - size.x * 0.15,
    right: skeleton.x + size.x * 0.15,
    top: offset.y + size.y * 0.86,
    bottom: offset.y + size.y * 0.73,
  };
}
