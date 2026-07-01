/**
 * Minimal single-page PDF writer that embeds one JPEG image as a full-page
 * XObject. Avoids pulling in a PDF library for what is otherwise a simple,
 * well-documented technique (JPEG bytes dropped in as-is via /DCTDecode).
 */

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

export function buildSingleImagePdf(
  jpegBytes: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  dpi: number,
): Uint8Array {
  const pointsPerPixel = 72 / dpi;
  const widthPt = pixelWidth * pointsPerPixel;
  const heightPt = pixelHeight * pointsPerPixel;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const pushText = (value: string) => push(textBytes(value));
  const startObject = (num: number) => {
    offsets[num] = length;
    pushText(`${num} 0 obj\n`);
  };

  pushText("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  startObject(1);
  pushText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  pushText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  startObject(3);
  pushText(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(widthPt)} ${formatNumber(heightPt)}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`,
  );

  startObject(4);
  pushText(
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  push(jpegBytes);
  pushText("\nendstream\nendobj\n");

  const contentStream = `q\n${formatNumber(widthPt)} 0 0 ${formatNumber(heightPt)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = textBytes(contentStream);
  startObject(5);
  pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
  push(contentBytes);
  pushText("endstream\nendobj\n");

  const xrefOffset = length;
  const objectCount = 6;
  pushText(`xref\n0 ${objectCount}\n`);
  pushText("0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) {
    pushText(`${offsets[i].toString().padStart(10, "0")} 00000 n \n`);
  }
  pushText(
    `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  const result = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}
