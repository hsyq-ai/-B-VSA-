export const TARGET_SAMPLE_RATE = 16000;
export const TARGET_CHUNK_SIZE = 2560;

export function concatFloat32Arrays(left: Float32Array, right: Float32Array): Float32Array {
  if (!left.length) return right;
  if (!right.length) return left;
  const merged = new Float32Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

export function downsampleFloat32(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE,
): Float32Array {
  if (!input.length) return new Float32Array();
  if (inputSampleRate <= 0 || inputSampleRate === targetSampleRate) {
    return new Float32Array(input);
  }
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  let outputIndex = 0;
  let inputIndex = 0;
  while (outputIndex < outputLength) {
    const nextInputIndex = Math.min(input.length, Math.round((outputIndex + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let i = inputIndex; i < nextInputIndex; i += 1) {
      sum += input[i];
      count += 1;
    }
    output[outputIndex] = count > 0 ? sum / count : input[Math.min(inputIndex, input.length - 1)] || 0;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }
  return output;
}

export function float32ToBase64(input: Float32Array): string {
  const bytes = new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}
