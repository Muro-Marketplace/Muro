import { ImageResponse } from "next/og";

export const alt = "Wallplace, curated art for commercial spaces";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          backgroundColor: "#1A1A1A",
          padding: "80px",
          color: "#FAFAFA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, letterSpacing: -0.5, opacity: 0.7 }}>Wallplace</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 86, lineHeight: 1.05, maxWidth: 980, fontWeight: 400 }}>
            Curated art for commercial spaces.
          </div>
          <div style={{ fontSize: 28, opacity: 0.6, maxWidth: 900 }}>
            A marketplace connecting independent venues with emerging artists.
          </div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.5 }}>wallplace.co.uk</div>
      </div>
    ),
    size,
  );
}
