export type LabelSize = "small" | "medium" | "large" | "xlarge";

export const LABEL_SIZES: { key: LabelSize; label: string; width: string; height: string; qr: string; perPage: number }[] = [
  { key: "small", label: "Small", width: "55mm", height: "35mm", qr: "20mm", perPage: 15 },
  { key: "medium", label: "Medium", width: "70mm", height: "50mm", qr: "28mm", perPage: 8 },
  { key: "large", label: "Large", width: "90mm", height: "60mm", qr: "34mm", perPage: 6 },
  { key: "xlarge", label: "Extra Large", width: "130mm", height: "80mm", qr: "44mm", perPage: 3 },
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
  tagline?: string;
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
  tagline,
}: QRLabelProps) {
  const sizeConfig = LABEL_SIZES.find((s) => s.key === labelSize) || LABEL_SIZES[1];
  const isLarge = labelSize === "large" || labelSize === "xlarge";
  const isSmall = labelSize === "small";

  return (
    <div
      className="qr-label"
      style={{
        width: sizeConfig.width,
        height: sizeConfig.height,
        border: "0.5pt solid #ddd",
        padding: isSmall ? "3mm" : isLarge ? "5mm" : "4mm",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "stretch",
        fontFamily: "var(--font-sans)",
        boxSizing: "border-box",
        pageBreakInside: "avoid",
        backgroundColor: "#fff",
      }}
    >
      {/* Left: text content */}
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
              fontSize: isLarge ? "14pt" : isSmall ? "9pt" : "11pt",
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
            <>
              {workTitle && (
                <p
                  style={{
                    fontSize: "9pt",
                    fontWeight: 500,
                    color: "#1A1A1A",
                    margin: "2mm 0 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {workTitle}
                </p>
              )}
              {workMedium && (
                <p
                  style={{
                    fontSize: "7.5pt",
                    color: "#6B6B6B",
                    margin: "1mm 0 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {workMedium}
                </p>
              )}
              {workDimensions && (
                <p
                  style={{
                    fontSize: "7pt",
                    color: "#999",
                    margin: "0.5mm 0 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {workDimensions}
                </p>
              )}
              {workPrice && (
                <p
                  style={{
                    fontSize: "8pt",
                    fontWeight: 500,
                    color: "#C17C5A",
                    margin: "1.5mm 0 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {workPrice}
                </p>
              )}
            </>
          )}
        </div>
        {isLarge && tagline && (
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
            fontSize: isSmall ? "5.5pt" : "6.5pt",
            color: "#999",
            margin: 0,
            letterSpacing: "0.03em",
          }}
        >
          wallplace.co.uk
        </p>
      </div>

      {/* Right: QR code */}
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
