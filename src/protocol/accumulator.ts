import { LENGTH_PREFIX_SIZE, MAX_FRAME_SIZE } from "./constants.ts";
import {
  decodeFrame,
  FrameError,
  type DecodedFrame,
  validateBodyLength,
} from "./frame.ts";

function peekBodyLength(buffer: Uint8Array): number {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const bodyLength = view.getUint32(0, false);
  validateBodyLength(bodyLength);
  const frameSize = LENGTH_PREFIX_SIZE + bodyLength;
  if (frameSize > MAX_FRAME_SIZE) {
    throw new FrameError(`Frame size ${frameSize} exceeds MAX_FRAME_SIZE`);
  }
  return bodyLength;
}

/**
 * Reassembles stream chunks into complete frames (§2.3).
 * Throws {@link FrameError} on invalid length prefix; caller should drop the connection.
 */
export class StreamAccumulator {
  private buffer: Uint8Array = new Uint8Array(0);

  bufferedByteCount(): number {
    return this.buffer.length;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  append(chunk: Uint8Array): DecodedFrame[] {
    if (chunk.length === 0) {
      return [];
    }

    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const frames: DecodedFrame[] = [];

    while (this.buffer.length >= LENGTH_PREFIX_SIZE) {
      const bodyLength = peekBodyLength(this.buffer);
      const frameSize = LENGTH_PREFIX_SIZE + bodyLength;
      if (this.buffer.length < frameSize) {
        break;
      }

      const frameBytes = this.buffer.slice(0, frameSize);
      frames.push(decodeFrame(frameBytes));
      this.buffer = this.buffer.slice(frameSize);
    }

    return frames;
  }
}
