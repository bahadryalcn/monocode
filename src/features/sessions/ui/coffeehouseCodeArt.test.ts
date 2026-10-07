// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { CODE_WIDTH, CODE_HEIGHT, createCodeArtPainter } from "./coffeehouseCodeArt";

afterEach(() => vi.restoreAllMocks());

const COLUMNS = CODE_WIDTH, ROWS = CODE_HEIGHT * 3 / 5;

function canvases(webgl: unknown) {
  const surface = document.createElement("canvas");
  surface.width = 1040; surface.height = 340;
  const destination = { setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: true };
  // Two samples per glyph cell in each direction.
  const pixels = new Uint8ClampedArray(COLUMNS * 2 * ROWS * 2 * 4);
  const mask = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
    setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    ellipse: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), roundRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({ data: pixels })),
  };
  const other = { fillText: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), createPattern: vi.fn(() => ({})),
    createImageData: vi.fn((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) })),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind, options) {
    if (this === surface) return (kind === "webgl" ? webgl : destination) as never;
    return ((options as { willReadFrequently?: boolean } | undefined)?.willReadFrequently ? mask : other) as never;
  });
  /** Paint one fully covered cell at the top-left corner with the given grey value. */
  const paintCorner = (value: number) => {
    for (const o of [0, 4, COLUMNS * 8, COLUMNS * 8 + 4]) { pixels[o] = value; pixels[o + 3] = value ? 255 : 0; }
  };
  return { surface, destination, mask, other, paintCorner };
}

it("samples a small CPU mask and falls back to Canvas 2D glyph bands without WebGL", () => {
  const { surface, destination, mask, other, paintCorner } = canvases(null);
  paintCorner(255);
  const draw = createCodeArtPainter(surface);
  draw(["idle", "idle", "idle", "idle", "idle", "idle"]);
  expect([surface.width, surface.height]).toEqual([CODE_WIDTH * 3, CODE_HEIGHT * 3]);
  expect(mask.scale).toHaveBeenCalledWith(2, ROWS * 2 / CODE_HEIGHT);
  expect((mask as typeof mask & { lineJoin: string }).lineJoin).toBe("round");
  // Three glyph tiles of 4x4 cells are drawn once and reused by every frame.
  expect(other.fillText).toHaveBeenCalledTimes(48);
  expect(other.createPattern).toHaveBeenCalledTimes(3);
  // A bright silhouette edge lands in the bold highlight band.
  expect(other.putImageData.mock.calls[2][0].data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
  expect(destination.drawImage).toHaveBeenCalled();
  // A disappearing shape must clear the old cell; very dark paint stays negative space.
  paintCorner(0);
  draw(["sip", "idle", "idle", "idle", "idle", "idle"]);
  expect(other.putImageData.mock.calls[5][0].data[3]).toBe(0);
  paintCorner(40);
  draw(["idle", "idle", "idle", "idle", "idle", "idle"]);
  expect(other.putImageData.mock.calls.slice(6).every(([image]) => image.data[3] === 0)).toBe(true);
  expect(other.fillText).toHaveBeenCalledTimes(48);
});

it("composites with a single WebGL draw per frame when available", () => {
  const constants = { VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3, ARRAY_BUFFER: 4, STATIC_DRAW: 5,
    FLOAT: 6, TEXTURE0: 10, TEXTURE_2D: 20, TEXTURE_MIN_FILTER: 21, TEXTURE_MAG_FILTER: 22, NEAREST: 23,
    TEXTURE_WRAP_S: 24, TEXTURE_WRAP_T: 25, CLAMP_TO_EDGE: 26, RGBA: 27, UNSIGNED_BYTE: 28, COLOR_BUFFER_BIT: 29, TRIANGLE_STRIP: 30 };
  const gl = new Proxy({ ...constants, getProgramParameter: () => true, isContextLost: () => false,
    texSubImage2D: vi.fn(), drawArrays: vi.fn() } as Record<string, unknown>, {
    get: (target, key: string) => key in target ? target[key] : (target[key] = vi.fn(() => ({}))),
  });
  const { surface, destination, paintCorner } = canvases(gl);
  paintCorner(255);
  const draw = createCodeArtPainter(surface);
  draw(["idle", "idle", "idle", "idle", "idle", "idle"]);
  draw(["idle", "idle", "idle", "idle", "idle", "idle"]);
  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  const upload = (gl.texSubImage2D as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(upload.slice(4, 6)).toEqual([COLUMNS, ROWS]);
  expect(Array.from((upload[8] as Uint8Array).slice(0, 4))).toEqual([255, 200, 0, 255]);
  expect(destination.drawImage).not.toHaveBeenCalled();
});
