import QRCode from "qrcode";

export async function generateQRDataURL(url: string, width = 200): Promise<string> {
  return QRCode.toDataURL(url, {
    width,
    margin: 1,
    color: { dark: "#1A1A1A", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });
}
