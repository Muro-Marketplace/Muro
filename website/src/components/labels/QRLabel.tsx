// Printable QR label.
//
// Two independent axes:
//   1. **size** (LabelSize): physical dimensions — micro / small /
//      medium / large / xlarge. Drives sheet density.
//   2. **style** (LabelStyle): visual treatment of the *content* —
//      Minimal (artist + title + QR), Editorial (gallery-style
//      framing with full meta), QR Only (just the code).
//
// Style and size are decoupled: an Editorial label at "small" still
// reads as Editorial, just compressed. The portal page can preset
// sensible (style, size) pairs but power users can override either.

export type LabelSize = "micro" | "small" | "medium" | "large" | "xlarge";
export type LabelStyle = "minimal" | "editorial" | "qr_only";

export const LABEL_SIZES: { key: LabelSize; label: string; width: string; height: string; qr: string; perPage: number }[] = [
  { key: "micro", label: "QR Only", width: "25mm", height: "25mm", qr: "25mm", perPage: 48 },
  { key: "small", label: "Small", width: "55mm", height: "35mm", qr: "20mm", perPage: 15 },
  { key: "medium", label: "Medium", width: "70mm", height: "50mm", qr: "28mm", perPage: 8 },
  { key: "large", label: "Large", width: "90mm", height: "60mm", qr: "34mm", perPage: 6 },
  { key: "xlarge", label: "Extra Large", width: "130mm", height: "80mm", qr: "44mm", perPage: 3 },
];

/**
 * Editorial style is gallery-portrait: artist + title stack at the
 * top, QR centred, meta + price at the bottom. The default landscape
 * sizes from LABEL_SIZES don't give enough vertical room — at "medium"
 * (70 × 50) the price line was being clipped outside the border.
 *
 * For editorial we flip the dimensions so the card always renders
 * portrait, regardless of the size key the user picked. Grid layout
 * in LabelSheet honours the same swap so the sheet packs tidily.
 */
export function getEffectiveLabelDims(
  size: LabelSize,
  style: LabelStyle,
): { width: string; height: string; qr: string; perPage: number } {
  const cfg = LABEL_SIZES.find((s) => s.key === size) || LABEL_SIZES[2];
  if (style === "editorial" && size !== "micro") {
    // Swap width and height for portrait editorial. perPage rebalances
    // because narrower cards fit more across; we keep the same total
    // count to avoid surprising the user with a different sheet size.
    return { width: cfg.height, height: cfg.width, qr: cfg.qr, perPage: cfg.perPage };
  }
  return { width: cfg.width, height: cfg.height, qr: cfg.qr, perPage: cfg.perPage };
}

export const LABEL_STYLES: {
  key: LabelStyle;
  name: string;
  description: string;
  /** Sensible size to default to when this style is picked. */
  defaultSize: LabelSize;
}[] = [
  { key: "minimal", name: "Minimal", description: "Artist, title and QR code only. Clean and classic.", defaultSize: "medium" },
  { key: "editorial", name: "Editorial", description: "Adds medium, dimensions and price for a gallery-style label.", defaultSize: "large" },
  { key: "qr_only", name: "QR Only", description: "QR code only, ultra-minimal.", defaultSize: "micro" },
];

interface QRLabelProps {
  artistName: string;
  workTitle?: string;
  workMedium?: string;
  workDimensions?: string;
  workPrice?: string;
  qrDataUrl: string;
  isPortfolioLabel?: boolean;
  labelSize?: LabelSize;
  /** Visual treatment. Defaults to "minimal". */
  labelStyle?: LabelStyle;
  tagline?: string;
  /** Per-label field toggles. Default true for the data the user
   *  has provided; render code also gates by style (Editorial only). */
  showMedium?: boolean;
  showDimensions?: boolean;
  showPrice?: boolean;
}

export default function QRLabel({
  artistName,
  workTitle,
  workMedium,
  workDimensions,
  workPrice,
  qrDataUrl,
  isPortfolioLabel,
  labelSize = "medium",
  labelStyle = "minimal",
  tagline,
  showMedium = true,
  showDimensions = true,
  showPrice = true,
}: QRLabelProps) {
  // Effective dims swap for editorial → portrait. Keep the underlying
  // size key for size-bucket logic (small / medium / large) so we
  // don't accidentally re-style fonts based on the swapped numbers.
  const sizeConfig = getEffectiveLabelDims(labelSize, labelStyle);
  const isLargeSize = labelSize === "large" || labelSize === "xlarge";
  const isSmallSize = labelSize === "small";

  // ── Style: QR Only ───────────────────────────────────────────────
  if (labelStyle === "qr_only") {
    return (
      <div
        className="qr-label"
        style={{
          width: sizeConfig.width,
          height: sizeConfig.height,
          boxSizing: "border-box",
          pageBreakInside: "avoid",
          backgroundColor: "#fff",
          border: "0.5pt solid #ddd",
          padding: "2mm",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="QR code"
            style={{ width: "78%", height: "78%", display: "block", objectFit: "contain" }}
          />
        )}
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: isSmallSize ? "5pt" : "6pt",
            color: "#999",
            margin: "1.5mm 0 0 0",
            letterSpacing: "0.05em",
          }}
        >
          wallplace.co.uk
        </p>
      </div>
    );
  }

  const containerStyle: React.CSSProperties = {
    width: sizeConfig.width,
    height: sizeConfig.height,
    border: "0.5pt solid #ddd",
    boxSizing: "border-box",
    pageBreakInside: "avoid",
    backgroundColor: "#fff",
    fontFamily: "var(--font-sans)",
  };

  // ── Style: Editorial ─────────────────────────────────────────────
  if (labelStyle === "editorial") {
    return (
      <div
        className="qr-label"
        style={{
          ...containerStyle,
          padding: isLargeSize ? "6mm 5mm" : isSmallSize ? "3mm" : "4.5mm",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ width: "100%", textAlign: "center" }}>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: isLargeSize ? "7pt" : "6pt",
              color: "#6B6B6B",
              margin: 0,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {artistName}
          </p>
          {!isPortfolioLabel && workTitle && (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                // Editorial portrait at medium gets a narrower card,
                // so we drop the title from 13pt → 11pt to keep
                // longer titles like "Vietnamese Village" inside the
                // border. Large/xlarge stay at 16pt.
                fontSize: isLargeSize ? "16pt" : isSmallSize ? "10pt" : "11pt",
                fontWeight: 400,
                color: "#1A1A1A",
                margin: "1.5mm 0 0 0",
                lineHeight: 1.15,
                wordBreak: "break-word",
                hyphens: "auto",
              }}
            >
              {workTitle}
            </p>
          )}
          {isPortfolioLabel && (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: isLargeSize ? "12pt" : "10pt",
                fontStyle: "italic",
                color: "#6B6B6B",
                margin: "1.5mm 0 0 0",
              }}
            >
              Scan to view full portfolio
            </p>
          )}
          <div
            style={{
              width: isLargeSize ? "10mm" : "6mm",
              height: "0.4pt",
              backgroundColor: "#C17C5A",
              margin: "2mm auto 0",
            }}
          />
        </div>

        <div style={{ width: sizeConfig.qr, height: sizeConfig.qr }}>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="QR code"
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          )}
        </div>

        <div style={{ width: "100%", textAlign: "center" }}>
          {!isPortfolioLabel && (
            <div
              style={{
                fontSize: isLargeSize ? "7pt" : "6pt",
                color: "#6B6B6B",
                lineHeight: 1.4,
              }}
            >
              {showMedium && workMedium && <div>{workMedium}</div>}
              {showDimensions && workDimensions && <div>{workDimensions}</div>}
              {showPrice && workPrice && (
                <div style={{ color: "#C17C5A", fontWeight: 500, marginTop: "1mm" }}>
                  {workPrice}
                </div>
              )}
            </div>
          )}
          {isLargeSize && tagline && (
            <p
              style={{
                fontSize: "7pt",
                color: "#6B6B6B",
                fontStyle: "italic",
                margin: "2mm 0 0 0",
              }}
            >
              {tagline}
            </p>
          )}
          <p
            style={{
              fontSize: isSmallSize ? "5pt" : "6pt",
              color: "#999",
              margin: "1.5mm 0 0 0",
              letterSpacing: "0.05em",
            }}
          >
            wallplace.co.uk
          </p>
        </div>
      </div>
    );
  }

  // ── Style: Minimal (default) ─────────────────────────────────────
  return (
    <div
      className="qr-label"
      style={{
        ...containerStyle,
        padding: isSmallSize ? "3mm" : isLargeSize ? "5mm" : "4mm",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          minWidth: 0,
          paddingRight: "3mm",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: isLargeSize ? "14pt" : isSmallSize ? "9pt" : "11pt",
              fontWeight: 600,
              color: "#1A1A1A",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {artistName}
          </p>
          {isPortfolioLabel ? (
            <p
              style={{
                fontSize: "8pt",
                color: "#6B6B6B",
                margin: "2mm 0 0 0",
                lineHeight: 1.3,
                fontStyle: "italic",
              }}
            >
              Scan to view full portfolio
            </p>
          ) : (
            workTitle && (
              <p
                style={{
                  fontSize: isLargeSize ? "10pt" : "9pt",
                  fontWeight: 500,
                  color: "#1A1A1A",
                  margin: "2mm 0 0 0",
                  lineHeight: 1.3,
                }}
              >
                {workTitle}
              </p>
            )
          )}
        </div>
        {isLargeSize && tagline && (
          <p
            style={{
              fontSize: "7.5pt",
              color: "#6B6B6B",
              margin: "2mm 0 0 0",
              lineHeight: 1.3,
              fontStyle: "italic",
            }}
          >
            {tagline}
          </p>
        )}
        <p
          style={{
            fontSize: isSmallSize ? "5.5pt" : "6.5pt",
            color: "#999",
            margin: 0,
            letterSpacing: "0.03em",
          }}
        >
          wallplace.co.uk
        </p>
      </div>
      <div
        style={{
          width: sizeConfig.qr,
          height: sizeConfig.qr,
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="QR code"
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        )}
      </div>
    </div>
  );
}
