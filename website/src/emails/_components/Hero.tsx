import { Section, Img } from "@react-email/components";
import { theme } from "./theme";

interface Props {
  image: string;
  alt: string;
  height?: number;
}

/**
 * Large visual hero, used in welcome / editorial emails. Max height bounded
 * so mobile clients don't render a full-screen billboard.
 */
export function Hero({ image, alt, height = 240 }: Props) {
  return (
    <Section style={{ padding: 0, backgroundColor: theme.surfaceMuted, lineHeight: 0 }}>
      <Img
        src={image}
        alt={alt}
        width="100%"
        height={height}
        style={{
          display: "block",
          width: "100%",
          maxWidth: "100%",
          height: "auto",
          maxHeight: height,
          objectFit: "cover" as const,
          borderRadius: 0,
        }}
      />
    </Section>
  );
}
